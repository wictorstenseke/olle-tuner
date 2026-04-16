import { useEffect, useRef, useState } from "react";
import { PitchDetector } from "pitchy";

const NOTE_NAMES = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
];

const GUITAR_STRINGS = [
  { note: "E", octave: 2, freq: 82.41 },
  { note: "A", octave: 2, freq: 110.0 },
  { note: "D", octave: 3, freq: 146.83 },
  { note: "G", octave: 3, freq: 196.0 },
  { note: "B", octave: 3, freq: 246.94 },
  { note: "E", octave: 4, freq: 329.63 },
];

// Detection band covers guitar fundamentals + harmonic headroom.
const MIN_FREQ = 60;
const MAX_FREQ = 1200;

const CLARITY_THRESHOLD = 0.85; // pitchy returns 0..1 (1 = perfectly periodic)
const HOLD_MS = 1200; // keep last reading on-screen this long after signal drops
const EMA_ALPHA = 0.06; // cents smoothing within a single note

function frequencyToNote(freq: number) {
  // noteNum is semitones relative to A4 (440 Hz)
  const noteNum = 12 * Math.log2(freq / 440);
  const rounded = Math.round(noteNum);
  const cents = (noteNum - rounded) * 100;
  // A4 index in NOTE_NAMES is 9 — offset so A4 maps to 'A'
  const noteIndex = (((rounded + 9) % 12) + 12) % 12;
  const octave = Math.floor((rounded + 9) / 12) + 4;
  return { note: NOTE_NAMES[noteIndex], octave, cents, frequency: freq };
}

function findClosestString(freq: number) {
  // Use cents distance (log) instead of raw Hz so mapping is octave-fair.
  let closest = 0;
  let minCents = Infinity;
  GUITAR_STRINGS.forEach((s, i) => {
    const cents = Math.abs(1200 * Math.log2(freq / s.freq));
    if (cents < minCents) {
      minCents = cents;
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

const DEFAULT_TUNER_DATA: TunerData = {
  note: "-",
  octave: 0,
  cents: 0,
  frequency: 0,
  closestString: -1,
  active: false,
};

export function useTuner(isOpen: boolean) {
  const [tunerData, setTunerData] = useState<TunerData>(DEFAULT_TUNER_DATA);

  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);
  const holdTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;
    let running = true;

    async function start() {
      try {
        const ctx = new AudioContext();
        if (cancelled) {
          ctx.close();
          return;
        }
        audioContextRef.current = ctx;

        // Disable browser DSP that corrupts pitch (AGC/noise-suppression can
        // chop the fundamental or pump gain during decay).
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
          },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          ctx.close();
          return;
        }
        mediaStreamRef.current = stream;

        // iOS/Android may suspend the context until user gesture.
        if (ctx.state === "suspended") await ctx.resume();

        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 4096;
        source.connect(analyser);

        const detector = PitchDetector.forFloat32Array(analyser.fftSize);
        const buffer = new Float32Array(analyser.fftSize);

        // EMA smoothing on cents only. Resets when the detected note changes
        // so cross-note transitions don't drag the needle.
        let smoothedCents = 0;
        let lastNote = "";

        const detect = () => {
          if (!running || cancelled) return;

          analyser.getFloatTimeDomainData(buffer);
          const [freq, clarity] = detector.findPitch(buffer, ctx.sampleRate);

          if (
            clarity >= CLARITY_THRESHOLD &&
            freq >= MIN_FREQ &&
            freq <= MAX_FREQ &&
            Number.isFinite(freq)
          ) {
            const { note, octave, cents } = frequencyToNote(freq);

            if (note !== lastNote) {
              smoothedCents = cents;
              lastNote = note;
            } else {
              smoothedCents += EMA_ALPHA * (cents - smoothedCents);
            }

            const closestString = findClosestString(freq);
            setTunerData({
              note,
              octave,
              cents: Math.round(smoothedCents),
              frequency: freq,
              closestString,
              active: true,
            });

            // Signal is back — cancel any pending hold-expiry.
            if (holdTimeoutRef.current !== null) {
              clearTimeout(holdTimeoutRef.current);
              holdTimeoutRef.current = null;
            }
          } else if (holdTimeoutRef.current === null) {
            // Low clarity → arm hold timer (once). After HOLD_MS with no
            // confident pitch, clear the display.
            holdTimeoutRef.current = window.setTimeout(() => {
              lastNote = "";
              smoothedCents = 0;
              setTunerData(DEFAULT_TUNER_DATA);
              holdTimeoutRef.current = null;
            }, HOLD_MS);
          }

          rafRef.current = requestAnimationFrame(detect);
        };
        detect();
      } catch (err) {
        console.error("Tuner mic access failed:", err);
      }
    }
    start();

    return () => {
      cancelled = true;
      running = false;
      cancelAnimationFrame(rafRef.current);
      if (holdTimeoutRef.current !== null) {
        clearTimeout(holdTimeoutRef.current);
        holdTimeoutRef.current = null;
      }
      mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
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
