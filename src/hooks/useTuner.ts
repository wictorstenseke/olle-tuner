import { useEffect, useRef, useState } from 'react';

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

const GUITAR_STRINGS = [
  { note: 'E', octave: 2, freq: 82.41 },
  { note: 'A', octave: 2, freq: 110.0 },
  { note: 'D', octave: 3, freq: 146.83 },
  { note: 'G', octave: 3, freq: 196.0 },
  { note: 'B', octave: 3, freq: 246.94 },
  { note: 'E', octave: 4, freq: 329.63 },
];

function autoCorrelate(buf: Float32Array, sampleRate: number): number {
  let size = buf.length;
  let rms = 0;
  for (let i = 0; i < size; i++) {
    rms += buf[i] * buf[i];
  }
  rms = Math.sqrt(rms / size);
  if (rms < 0.01) return -1;

  // Trim silence from ends
  let r1 = 0;
  let r2 = size - 1;
  const threshold = 0.2;
  for (let i = 0; i < size / 2; i++) {
    if (Math.abs(buf[i]) < threshold) { r1 = i; break; }
  }
  for (let i = 1; i < size / 2; i++) {
    if (Math.abs(buf[size - i]) < threshold) { r2 = size - i; break; }
  }

  buf = buf.slice(r1, r2);
  size = buf.length;
  if (size < 2) return -1;

  const c = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    for (let j = 0; j < size - i; j++) {
      c[i] += buf[j] * buf[j + i];
    }
  }

  let d = 0;
  while (d < size - 1 && c[d] > c[d + 1]) d++;

  let maxval = -1;
  let maxpos = -1;
  for (let i = d; i < size; i++) {
    if (c[i] > maxval) {
      maxval = c[i];
      maxpos = i;
    }
  }

  if (maxpos < 1 || maxpos >= size - 1) return -1;

  let T0 = maxpos;

  // Parabolic interpolation
  const x1 = c[T0 - 1];
  const x2 = c[T0];
  const x3 = c[T0 + 1];
  const a = (x1 + x3 - 2 * x2) / 2;
  const b = (x3 - x1) / 2;
  if (a) T0 = T0 - b / (2 * a);

  return sampleRate / T0;
}

function frequencyToNote(freq: number) {
  const noteNum = 12 * (Math.log2(freq / 440));
  const roundedNote = Math.round(noteNum);
  const cents = Math.floor((noteNum - roundedNote) * 100);
  const noteIndex = ((roundedNote % 12) + 12) % 12;
  const octave = Math.floor((roundedNote + 9) / 12) + 4;
  return {
    note: NOTE_NAMES[noteIndex],
    octave,
    cents,
    frequency: freq,
  };
}

function findClosestString(freq: number) {
  let closest = 0;
  let minDiff = Infinity;
  GUITAR_STRINGS.forEach((s, i) => {
    const diff = Math.abs(freq - s.freq);
    if (diff < minDiff) {
      minDiff = diff;
      closest = i;
    }
  });
  return closest;
}

export interface TunerData {
  note: string;
  octave: number;
  cents: number;
  frequency: number;
  closestString: number;
  active: boolean;
}

const DEFAULT_TUNER_DATA: TunerData = { note: '-', octave: 0, cents: 0, frequency: 0, closestString: -1, active: false };

export function useTuner(isOpen: boolean) {
  const [tunerData, setTunerData] = useState<TunerData>(DEFAULT_TUNER_DATA);

  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number>(0);
  const runningRef = useRef(false);

  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;

    async function startTuner() {
      try {
        const ctx = new AudioContext();
        if (cancelled) { ctx.close(); return; }
        audioContextRef.current = ctx;

        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); ctx.close(); return; }
        mediaStreamRef.current = stream;

        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 4096;
        source.connect(analyser);

        runningRef.current = true;
        const buf = new Float32Array(analyser.fftSize);

        const detect = () => {
          if (!runningRef.current || cancelled) return;

          analyser.getFloatTimeDomainData(buf);
          const freq = autoCorrelate(buf, ctx.sampleRate);

          if (freq > 0 && freq < 1000) {
            const noteData = frequencyToNote(freq);
            const closestString = findClosestString(freq);
            setTunerData({
              ...noteData,
              closestString,
              active: true,
            });
          } else {
            setTunerData(prev => ({ ...prev, active: false }));
          }

          animFrameRef.current = requestAnimationFrame(detect);
        };
        detect();
      } catch (err) {
        console.error('Tuner mic access failed:', err);
      }
    }

    startTuner();

    return () => {
      cancelled = true;
      runningRef.current = false;
      cancelAnimationFrame(animFrameRef.current);
      mediaStreamRef.current?.getTracks().forEach(t => t.stop());
      mediaStreamRef.current = null;
      if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }
      setTunerData(DEFAULT_TUNER_DATA);
    };
  }, [isOpen]);

  return { tunerData, guitarStrings: GUITAR_STRINGS };
}
