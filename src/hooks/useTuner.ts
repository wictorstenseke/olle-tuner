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

// Detection band covers guitar fundamentals + small margin.
// Tight range helps suppress octave-harmonic false positives.
const MIN_FREQ = 65; // just below E2 (82.41 Hz)
const MAX_FREQ = 1100; // above high E4 (329.63 Hz) with harmonic headroom

// Stability gates
const CLARITY_THRESHOLD = 0.9; // pitchy returns 0..1 (1 = perfectly periodic)
const RMS_THRESHOLD = 0.01; // noise gate
const HOLD_MS = 1200; // keep last reading on-screen this long after signal drops
const MEDIAN_WINDOW = 5; // median over last N accepted frames

function frequencyToNote(freq: number) {
  // noteNum is semitones relative to A4 (440 Hz)
  const noteNum = 12 * Math.log2(freq / 440);
  const rounded = Math.round(noteNum);
  const cents = Math.round((noteNum - rounded) * 100);
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

function median(arr: number[]) {
  const sorted = [...arr].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
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
  const historyRef = useRef<number[]>([]);

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

        const source = ctx.createMediaStreamSource(stream);

        // High-pass 60 Hz: kills mic rumble / handling noise, preserves E2 (82 Hz).
        const hp = ctx.createBiquadFilter();
        hp.type = "highpass";
        hp.frequency.value = 60;
        hp.Q.value = 0.7;

        // Low-pass 1.5 kHz: attenuates upper harmonics that confuse MPM
        // into picking an octave-up lag on plucked strings.
        const lp = ctx.createBiquadFilter();
        lp.type = "lowpass";
        lp.frequency.value = 1500;
        lp.Q.value = 0.7;

        const analyser = ctx.createAnalyser();
        // 4096 samples @ 44.1 kHz ≈ 93 ms — enough for ~7 periods of low E2.
        analyser.fftSize = 4096;
        analyser.smoothingTimeConstant = 0;

        source.connect(hp);
        hp.connect(lp);
        lp.connect(analyser);

        const detector = PitchDetector.forFloat32Array(analyser.fftSize);
        detector.minVolumeDecibels = -40;
        const input = new Float32Array(detector.inputLength);

        const detect = () => {
          if (!running || cancelled) return;

          analyser.getFloatTimeDomainData(input);

          // RMS noise gate (before pitch detection for speed)
          let sumSq = 0;
          for (let i = 0; i < input.length; i++) sumSq += input[i] * input[i];
          const rms = Math.sqrt(sumSq / input.length);

          let good = false;
          if (rms >= RMS_THRESHOLD) {
            const [freq, clarity] = detector.findPitch(input, ctx.sampleRate);
            if (
              clarity >= CLARITY_THRESHOLD &&
              freq >= MIN_FREQ &&
              freq <= MAX_FREQ &&
              Number.isFinite(freq)
            ) {
              // Median filter over last N accepted frames — kills isolated
              // octave jumps and single-frame outliers.
              const hist = historyRef.current;
              hist.push(freq);
              if (hist.length > MEDIAN_WINDOW) hist.shift();
              const smoothFreq = median(hist);

              const noteData = frequencyToNote(smoothFreq);
              const closestString = findClosestString(smoothFreq);
              setTunerData({ ...noteData, closestString, active: true });

              // Reset pending hold-expiry — signal is back.
              if (holdTimeoutRef.current !== null) {
                clearTimeout(holdTimeoutRef.current);
                holdTimeoutRef.current = null;
              }
              good = true;
            }
          }

          // No confident pitch this frame → start hold-expiry timer (once).
          // After HOLD_MS of continuous silence/noise, clear the display.
          if (!good && holdTimeoutRef.current === null) {
            holdTimeoutRef.current = window.setTimeout(() => {
              historyRef.current = [];
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
      historyRef.current = [];
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
