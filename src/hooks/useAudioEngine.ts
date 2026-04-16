import { useCallback, useRef, useState, useEffect } from "react";
import type { TrackState } from "../types";
import { drumPatterns } from "../data/drumPatterns";

// Fit an AudioBuffer to an exact duration, compensating for MediaRecorder
// head latency. `recorder.start()` is synchronous but capture typically
// begins 30-100ms later, so the decoded buffer is shorter than targetDuration
// by roughly the head latency. We pad silence at the START (not end) so the
// recorded audio aligns with the loop grid — otherwise playback runs ahead
// of the beat and drifts against drums/other tracks every cycle.
function fitBufferToDuration(
  ctx: AudioContext,
  src: AudioBuffer,
  targetDuration: number
): AudioBuffer {
  const targetLength = Math.floor(targetDuration * ctx.sampleRate);
  const out = ctx.createBuffer(
    src.numberOfChannels,
    targetLength,
    ctx.sampleRate
  );
  if (src.length >= targetLength) {
    // Captured more than needed — keep the tail aligned to target end.
    for (let ch = 0; ch < src.numberOfChannels; ch++) {
      const srcData = src.getChannelData(ch);
      const outData = out.getChannelData(ch);
      outData.set(srcData.subarray(src.length - targetLength), 0);
    }
  } else {
    // Typical case: capture shorter than target due to MR head latency.
    // Pad silence at start so buffer[pad..] = audio from recordStart+latency.
    const padLength = targetLength - src.length;
    for (let ch = 0; ch < src.numberOfChannels; ch++) {
      const srcData = src.getChannelData(ch);
      const outData = out.getChannelData(ch);
      outData.set(srcData, padLength);
      // [0..padLength] auto-zeros from createBuffer.
    }
  }
  return out;
}

interface TrackData {
  id: number;
  state: TrackState;
  buffer: AudioBuffer | null;
}

interface DrumState {
  active: boolean;
  patternIndex: number;
  bpm: number;
  bars: number;
}

export function useAudioEngine() {
  const [tracks, setTracks] = useState<TrackData[]>([
    { id: 1, state: "empty", buffer: null },
    { id: 2, state: "empty", buffer: null },
    { id: 3, state: "empty", buffer: null },
    { id: 4, state: "empty", buffer: null },
  ]);
  const [loopProgress, setLoopProgress] = useState(0);
  const [isLooping, setIsLooping] = useState(false);
  const [inputLevel, setInputLevel] = useState(0);
  const [micReady, setMicReady] = useState(false);
  const [drumState, setDrumState] = useState<DrumState>({
    active: false,
    patternIndex: 0,
    bpm: 120,
    bars: 2,
  });
  const [bpm, setBpmState] = useState(100);
  const [countInBeat, setCountInBeat] = useState<number | null>(null);
  const [queuedTrackId, setQueuedTrackId] = useState<number | null>(null);
  const [recordingMode, setRecordingMode] = useState<"bars" | "manual">("bars");

  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordingTrackRef = useRef<number | null>(null);
  const loopDurationRef = useRef<number>(0);
  const loopStartTimeRef = useRef<number>(0);
  const inputAnimFrameRef = useRef<number>(0);
  const progressAnimFrameRef = useRef<number>(0);
  const sourceNodesRef = useRef<Map<number, AudioBufferSourceNode>>(new Map());
  const gainNodesRef = useRef<Map<number, GainNode>>(new Map());
  const analyserRef = useRef<AnalyserNode | null>(null);
  const drumSourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const tracksRef = useRef(tracks);
  const bpmRef = useRef(100);
  const recordingModeRef = useRef<"bars" | "manual">("bars");
  const countingInTrackRef = useRef<number | null>(null);
  const countInTimersRef = useRef<number[]>([]);
  // rAF handle for audio-clock-driven recording stop (replaces setTimeout drift)
  const recordStopRafRef = useRef<number>(0);
  // rAF handle for overdub boundary wait (replaces setTimeout drift on queued takes)
  const queueWaitRafRef = useRef<number>(0);
  // Scheduled metronome click nodes — retained so they can be cancelled on early stop
  const metronomeSourcesRef = useRef<AudioBufferSourceNode[]>([]);

  const drumBuffersRef = useRef<Map<string, AudioBuffer>>(new Map());

  // Keep refs in sync with state — refs must not be written during render.
  useEffect(() => {
    tracksRef.current = tracks;
  }, [tracks]);
  useEffect(() => {
    recordingModeRef.current = recordingMode;
  }, [recordingMode]);

  const getAudioContext = useCallback(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext();
    }
    if (audioContextRef.current.state === "suspended") {
      audioContextRef.current.resume();
    }
    return audioContextRef.current;
  }, []);

  const getDrumBuffer = useCallback(
    (name: string): AudioBuffer => {
      const ctx = getAudioContext();
      const existing = drumBuffersRef.current.get(name);
      if (existing) return existing;

      const sampleRate = ctx.sampleRate;
      const duration = name === "kick" ? 0.3 : name === "snare" ? 0.2 : 0.05;
      const length = Math.floor(sampleRate * duration);
      const buffer = ctx.createBuffer(1, length, sampleRate);
      const data = buffer.getChannelData(0);

      if (name === "kick") {
        for (let i = 0; i < length; i++) {
          const t = i / sampleRate;
          const freq = 150 * Math.exp(-t * 10);
          const env = Math.exp(-t * 8);
          data[i] = Math.sin(2 * Math.PI * freq * t) * env * 0.8;
        }
      } else if (name === "snare") {
        for (let i = 0; i < length; i++) {
          const t = i / sampleRate;
          const env = Math.exp(-t * 15);
          const tone = Math.sin(2 * Math.PI * 200 * t) * 0.3;
          const noise = (Math.random() * 2 - 1) * 0.7;
          data[i] = (tone + noise) * env * 0.5;
        }
      } else {
        for (let i = 0; i < length; i++) {
          const t = i / sampleRate;
          const env = Math.exp(-t * 40);
          data[i] = (Math.random() * 2 - 1) * env * 0.3;
        }
      }

      drumBuffersRef.current.set(name, buffer);
      return buffer;
    },
    [getAudioContext]
  );

  const setBpm = useCallback((newBpm: number) => {
    const clamped = Math.max(40, Math.min(160, newBpm));
    setBpmState(clamped);
    bpmRef.current = clamped;
  }, []);

  const clickBufferRef = useRef<AudioBuffer | null>(null);

  const getClickBuffer = useCallback(() => {
    if (clickBufferRef.current) return clickBufferRef.current;
    const ctx = getAudioContext();
    const sampleRate = ctx.sampleRate;
    const length = Math.floor(sampleRate * 0.03);
    const buffer = ctx.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      const t = i / sampleRate;
      const env = Math.exp(-t * 150);
      data[i] = Math.sin(2 * Math.PI * 1000 * t) * env * 0.5;
    }
    clickBufferRef.current = buffer;
    return buffer;
  }, [getAudioContext]);

  const playClick = useCallback(() => {
    const ctx = getAudioContext();
    const source = ctx.createBufferSource();
    source.buffer = getClickBuffer();
    source.connect(ctx.destination);
    source.start();
  }, [getAudioContext, getClickBuffer]);

  const startCountIn = useCallback(
    (trackId: number, onComplete: () => void) => {
      const beatMs = 60000 / bpmRef.current;
      countingInTrackRef.current = trackId;

      setCountInBeat(1);
      playClick();
      const timers: number[] = [];
      timers.push(
        window.setTimeout(() => {
          setCountInBeat(2);
          playClick();
        }, beatMs)
      );
      timers.push(
        window.setTimeout(() => {
          setCountInBeat(3);
          playClick();
        }, beatMs * 2)
      );
      timers.push(
        window.setTimeout(() => {
          setCountInBeat(4);
          playClick();
        }, beatMs * 3)
      );
      timers.push(
        window.setTimeout(() => {
          setCountInBeat(null);
          countingInTrackRef.current = null;
          onComplete();
        }, beatMs * 4)
      );

      countInTimersRef.current = timers;
    },
    [playClick]
  );

  const cancelCountIn = useCallback(() => {
    countInTimersRef.current.forEach((t) => clearTimeout(t));
    countInTimersRef.current = [];
    if (queueWaitRafRef.current) {
      cancelAnimationFrame(queueWaitRafRef.current);
      queueWaitRafRef.current = 0;
    }
    countingInTrackRef.current = null;
    setCountInBeat(null);
    setQueuedTrackId(null);
  }, []);

  // Request mic access — called on first user interaction
  const initMic = useCallback(async () => {
    if (mediaStreamRef.current) return;
    try {
      const ctx = getAudioContext();
      // Music-grade capture: disable voice-call DSP that murders instrument
      // fidelity (echo cancellation pumps the signal, noise suppression eats
      // reverb tails, AGC rides the level). Request 48kHz stereo so we match
      // the AudioContext rate and keep transients intact.
      mediaStreamRef.current = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          channelCount: 2,
          sampleRate: 48000,
          sampleSize: 16,
        },
      });
      setMicReady(true);

      // Start input level monitoring
      const source = ctx.createMediaStreamSource(mediaStreamRef.current);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const updateLevel = () => {
        analyser.getByteTimeDomainData(dataArray);
        let max = 0;
        for (let i = 0; i < dataArray.length; i++) {
          const val = Math.abs(dataArray[i] - 128);
          if (val > max) max = val;
        }
        setInputLevel(max / 128);
        inputAnimFrameRef.current = requestAnimationFrame(updateLevel);
      };
      updateLevel();
    } catch (err) {
      console.error("Mic access denied:", err);
    }
  }, [getAudioContext]);

  // Loop progress animation
  const startProgressLoop = useCallback(() => {
    cancelAnimationFrame(progressAnimFrameRef.current);
    const update = () => {
      if (loopDurationRef.current <= 0) return;
      const ctx = audioContextRef.current;
      if (!ctx) return;
      const elapsed = ctx.currentTime - loopStartTimeRef.current;
      const progress =
        (elapsed % loopDurationRef.current) / loopDurationRef.current;
      setLoopProgress(progress);
      progressAnimFrameRef.current = requestAnimationFrame(update);
    };
    update();
  }, []);

  const playTrackLoop = useCallback(
    (trackId: number, buffer: AudioBuffer) => {
      const ctx = getAudioContext();

      const existing = sourceNodesRef.current.get(trackId);
      if (existing) {
        try {
          existing.stop();
        } catch {
          /* already stopped */
        }
      }

      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;

      if (loopDurationRef.current > 0) {
        source.loopEnd = loopDurationRef.current;
      }

      let gainNode = gainNodesRef.current.get(trackId);
      if (!gainNode) {
        gainNode = ctx.createGain();
        gainNode.connect(ctx.destination);
        gainNodesRef.current.set(trackId, gainNode);
      }
      gainNode.gain.value = 1;

      source.connect(gainNode);

      if (loopStartTimeRef.current > 0) {
        const elapsed = ctx.currentTime - loopStartTimeRef.current;
        const offset = elapsed % loopDurationRef.current;
        source.start(0, offset);
      } else {
        source.start();
        loopStartTimeRef.current = ctx.currentTime;
      }

      sourceNodesRef.current.set(trackId, source);
    },
    [getAudioContext]
  );

  const startRecording = useCallback(
    async (trackId: number) => {
      const ctx = getAudioContext();

      // Ensure mic is ready
      if (!mediaStreamRef.current) {
        await initMic();
      }
      if (!mediaStreamRef.current) return; // mic denied

      // Set loop duration from BPM if not already set (bars mode only for first recording)
      if (loopDurationRef.current <= 0 && recordingModeRef.current === "bars") {
        loopDurationRef.current = 960 / bpmRef.current; // 4 bars (16 beats) in seconds
      }

      const doRecord = () => {
        if (!mediaStreamRef.current) return;

        chunksRef.current = [];
        recordingTrackRef.current = trackId;

        // Pick the highest-fidelity container the browser supports and bump
        // the bitrate well past MediaRecorder's voice-call default. 256kbps
        // Opus is transparent for most musical material; Safari falls back
        // to mp4/aac.
        const mimeCandidates = [
          "audio/webm;codecs=opus",
          "audio/ogg;codecs=opus",
          "audio/mp4;codecs=mp4a.40.2",
          "audio/webm",
        ];
        const mimeType = mimeCandidates.find(
          (m) =>
            typeof MediaRecorder !== "undefined" &&
            MediaRecorder.isTypeSupported?.(m)
        );
        const recorder = new MediaRecorder(
          mediaStreamRef.current,
          mimeType
            ? { mimeType, audioBitsPerSecond: 256000 }
            : { audioBitsPerSecond: 256000 }
        );
        recorderRef.current = recorder;

        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunksRef.current.push(e.data);
        };

        recorder.onstop = async () => {
          // Cancel any still-pending metronome clicks + watchdog rAF.
          cancelAnimationFrame(recordStopRafRef.current);
          recordStopRafRef.current = 0;
          metronomeSourcesRef.current.forEach((s) => {
            try {
              s.stop();
            } catch {
              /* already stopped */
            }
          });
          metronomeSourcesRef.current = [];

          const blob = new Blob(chunksRef.current, { type: "audio/webm" });
          const arrayBuffer = await blob.arrayBuffer();
          const rawBuffer = await ctx.decodeAudioData(arrayBuffer);

          // Fit recording to grid: MediaRecorder startup latency (~30-100ms)
          // makes the decoded buffer slightly shorter than the BPM-expected
          // loop. Pad (or trim) to exact loopDuration so `source.loopEnd`
          // isn't clamped and the track stays locked to the drum grid.
          let finalBuffer: AudioBuffer;
          if (loopDurationRef.current > 0) {
            finalBuffer = fitBufferToDuration(
              ctx,
              rawBuffer,
              loopDurationRef.current
            );
          } else {
            // Manual mode, very first recording — use actual length as grid.
            loopDurationRef.current = rawBuffer.duration;
            finalBuffer = rawBuffer;
          }

          const tid = recordingTrackRef.current!;

          setTracks((prev) =>
            prev.map((t) =>
              t.id === tid
                ? { ...t, state: "playing" as TrackState, buffer: finalBuffer }
                : t
            )
          );

          playTrackLoop(tid, finalBuffer);
          recordingTrackRef.current = null;
        };

        recorder.start();

        // Anchor loop clock AFTER recorder.start() so progress bar tracks
        // the actual audio-capture onset rather than racing ahead of it.
        const recordStart = ctx.currentTime;
        const recordEnd =
          recordStart +
          (loopDurationRef.current > 0 ? loopDurationRef.current : Infinity);

        if (loopStartTimeRef.current <= 0) {
          loopStartTimeRef.current = recordStart;
          setIsLooping(true);
          startProgressLoop();
        }

        // No during-record metronome: echo-cancellation is now off (music-
        // grade capture), so any speaker-routed click bleeds straight into
        // the recording. Count-in before record start still provides the
        // timing reference; already-recorded loops keep playing as the
        // rhythmic guide for overdubs.

        setTracks((prev) =>
          prev.map((t) =>
            t.id === trackId ? { ...t, state: "recording" as TrackState } : t
          )
        );

        // Audio-clock watchdog replaces setTimeout. Progress bar and stop
        // now share the same clock, so bar 4 no longer drifts.
        if (loopDurationRef.current > 0) {
          const watchStop = () => {
            if (ctx.currentTime >= recordEnd) {
              recordStopRafRef.current = 0;
              if (recorderRef.current?.state === "recording") {
                recorderRef.current.stop();
              }
              return;
            }
            recordStopRafRef.current = requestAnimationFrame(watchStop);
          };
          recordStopRafRef.current = requestAnimationFrame(watchStop);
        }
      };

      if (loopStartTimeRef.current > 0) {
        // Loop already running — wait on the AUDIO CLOCK for next bar 1.
        // setTimeout would drift 20-100ms past the boundary on busy frames,
        // offsetting the overdub from the grid. rAF polling ctx.currentTime
        // fires within one frame (~16ms) of the exact boundary.
        const elapsed = ctx.currentTime - loopStartTimeRef.current;
        const position = elapsed % loopDurationRef.current;
        const boundaryTime =
          ctx.currentTime + (loopDurationRef.current - position);

        countingInTrackRef.current = trackId;
        setQueuedTrackId(trackId);

        const waitForBoundary = () => {
          if (ctx.currentTime >= boundaryTime) {
            queueWaitRafRef.current = 0;
            countingInTrackRef.current = null;
            setQueuedTrackId(null);
            doRecord();
            return;
          }
          queueWaitRafRef.current = requestAnimationFrame(waitForBoundary);
        };
        queueWaitRafRef.current = requestAnimationFrame(waitForBoundary);
      } else {
        // First recording — full count-in
        startCountIn(trackId, doRecord);
      }
    },
    [getAudioContext, initMic, playTrackLoop, startProgressLoop, startCountIn]
  );

  const stopRecording = useCallback(() => {
    // recorder.onstop handles watchdog + metronome cleanup.
    if (recorderRef.current && recorderRef.current.state === "recording") {
      recorderRef.current.stop();
    }
  }, []);

  const toggleMute = useCallback((trackId: number) => {
    setTracks((prev) =>
      prev.map((t) => {
        if (t.id !== trackId) return t;
        if (t.state === "playing") {
          const gainNode = gainNodesRef.current.get(trackId);
          if (gainNode) gainNode.gain.value = 0;
          return { ...t, state: "muted" as TrackState };
        }
        if (t.state === "muted") {
          const gainNode = gainNodesRef.current.get(trackId);
          if (gainNode) gainNode.gain.value = 1;
          return { ...t, state: "playing" as TrackState };
        }
        return t;
      })
    );
  }, []);

  const deleteTrack = useCallback((trackId: number) => {
    const source = sourceNodesRef.current.get(trackId);
    if (source) {
      try {
        source.stop();
      } catch {
        /* already stopped */
      }
      sourceNodesRef.current.delete(trackId);
    }
    const gain = gainNodesRef.current.get(trackId);
    if (gain) {
      gain.disconnect();
      gainNodesRef.current.delete(trackId);
    }

    setTracks((prev) => {
      const updated = prev.map((t) =>
        t.id === trackId
          ? { ...t, state: "empty" as TrackState, buffer: null }
          : t
      );
      const anyActive = updated.some(
        (t) => t.state === "playing" || t.state === "muted"
      );
      if (!anyActive) {
        loopDurationRef.current = 0;
        loopStartTimeRef.current = 0;
        cancelAnimationFrame(progressAnimFrameRef.current);
        setIsLooping(false);
        setLoopProgress(0);
      }
      return updated;
    });
  }, []);

  // Use ref to avoid stale closure in handlePadPress
  const handlePadPress = useCallback(
    (trackId: number) => {
      const track = tracksRef.current.find((t) => t.id === trackId);
      if (!track) return;

      switch (track.state) {
        case "empty":
          if (countingInTrackRef.current === trackId) {
            cancelCountIn();
          } else if (!countingInTrackRef.current) {
            startRecording(trackId);
          }
          break;
        case "recording":
          stopRecording();
          break;
        case "playing":
        case "muted":
          toggleMute(trackId);
          break;
      }
    },
    [startRecording, stopRecording, toggleMute, cancelCountIn]
  );

  // Drum machine — synced to loop via AudioContext scheduling
  const drumAnimRef = useRef<number>(0);
  const drumLastStepRef = useRef<number>(-1);

  const startDrums = useCallback(() => {
    const ctx = getAudioContext();

    // If no loop running, start one
    if (loopDurationRef.current <= 0) {
      loopDurationRef.current = 960 / bpmRef.current;
    }
    if (loopStartTimeRef.current <= 0) {
      loopStartTimeRef.current = ctx.currentTime;
      setIsLooping(true);
      startProgressLoop();
    }

    drumLastStepRef.current = -1;
    const pattern = drumPatterns[drumState.patternIndex];
    const stepsPerBeat = pattern.steps / 4; // steps per beat (usually 4 for 16-step)

    const scheduleDrums = () => {
      const elapsed = ctx.currentTime - loopStartTimeRef.current;
      const loopPos = elapsed % loopDurationRef.current;
      const beatDuration = 60 / bpmRef.current;
      const stepDuration = beatDuration / stepsPerBeat;
      // 4 bars = 16 beats total, each bar = pattern.steps steps
      const totalStepsInLoop = pattern.steps * 4;
      const currentStep = Math.floor(loopPos / stepDuration) % totalStepsInLoop;
      const patternStep = currentStep % pattern.steps;

      if (currentStep !== drumLastStepRef.current) {
        drumLastStepRef.current = currentStep;
        pattern.tracks.forEach((track) => {
          if (track.pattern[patternStep]) {
            const buffer = getDrumBuffer(track.name);
            const source = ctx.createBufferSource();
            source.buffer = buffer;
            source.connect(ctx.destination);
            source.start();
            drumSourcesRef.current.push(source);
          }
        });
        // Clean up old sources
        if (drumSourcesRef.current.length > 50) {
          drumSourcesRef.current = drumSourcesRef.current.slice(-20);
        }
      }
      drumAnimRef.current = requestAnimationFrame(scheduleDrums);
    };
    scheduleDrums();

    setDrumState((prev) => ({ ...prev, active: true }));
  }, [
    getAudioContext,
    drumState.patternIndex,
    getDrumBuffer,
    startProgressLoop,
  ]);

  const stopDrums = useCallback(() => {
    cancelAnimationFrame(drumAnimRef.current);
    drumLastStepRef.current = -1;
    drumSourcesRef.current.forEach((s) => {
      try {
        s.stop();
      } catch {
        /* already stopped */
      }
    });
    drumSourcesRef.current = [];
    setDrumState((prev) => ({ ...prev, active: false }));
  }, []);

  const setDrumPattern = useCallback((index: number) => {
    setDrumState((prev) => ({ ...prev, patternIndex: index }));
  }, []);

  const setDrumBpm = useCallback(
    (newBpm: number) => {
      setBpm(newBpm);
    },
    [setBpm]
  );

  const setDrumBars = useCallback((bars: number) => {
    setDrumState((prev) => ({ ...prev, bars }));
  }, []);

  const stopAll = useCallback(() => {
    cancelCountIn();
    if (recorderRef.current && recorderRef.current.state === "recording") {
      recorderRef.current.stop();
    }
    stopDrums();
    // Mute all playing tracks instead of clearing
    gainNodesRef.current.forEach((g) => {
      g.gain.value = 0;
    });
    cancelAnimationFrame(progressAnimFrameRef.current);
    setIsLooping(false);
    setLoopProgress(0);
    setTracks((prev) =>
      prev.map((t) =>
        t.state === "playing" || t.state === "muted"
          ? { ...t, state: "muted" as TrackState }
          : t
      )
    );
  }, [stopDrums, cancelCountIn]);

  // Release mic on tab hide / page unload so the OS mic indicator clears
  // immediately when the user backgrounds or closes the app. Mobile browsers
  // don't guarantee unmount-time cleanup, which left the indicator lingering.
  const releaseMic = useCallback(() => {
    // Abort any in-flight recording so we don't leak a half-recorded blob.
    cancelAnimationFrame(recordStopRafRef.current);
    recordStopRafRef.current = 0;
    metronomeSourcesRef.current.forEach((s) => {
      try {
        s.stop();
      } catch {
        /* already stopped */
      }
    });
    metronomeSourcesRef.current = [];
    if (recorderRef.current && recorderRef.current.state === "recording") {
      try {
        recorderRef.current.stop();
      } catch {
        /* already stopped */
      }
    }
    cancelAnimationFrame(inputAnimFrameRef.current);
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    mediaStreamRef.current = null;
    analyserRef.current = null;
    setMicReady(false);
    setInputLevel(0);
  }, []);

  useEffect(() => {
    const onPageHide = () => releaseMic();
    const onVisibility = () => {
      if (document.visibilityState === "hidden") releaseMic();
    };
    window.addEventListener("pagehide", onPageHide);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", onPageHide);
      document.removeEventListener("visibilitychange", onVisibility);
      cancelAnimationFrame(inputAnimFrameRef.current);
      cancelAnimationFrame(progressAnimFrameRef.current);
      mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [releaseMic]);

  return {
    tracks,
    loopProgress,
    isLooping,
    inputLevel,
    micReady,
    bpm,
    countInBeat,
    queuedTrackId,
    drumState,
    drumPatterns,
    handlePadPress,
    deleteTrack,
    stopAll,
    setBpm,
    startDrums,
    stopDrums,
    setDrumPattern,
    setDrumBpm,
    setDrumBars,
    initMic,
    recordingMode,
    setRecordingMode,
  };
}
