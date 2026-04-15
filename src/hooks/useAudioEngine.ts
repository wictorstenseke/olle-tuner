import { useCallback, useRef, useState, useEffect } from 'react';
import type { TrackState } from '../types';
import { drumPatterns } from '../data/drumPatterns';

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
    { id: 1, state: 'empty', buffer: null },
    { id: 2, state: 'empty', buffer: null },
    { id: 3, state: 'empty', buffer: null },
    { id: 4, state: 'empty', buffer: null },
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
  const drumIntervalRef = useRef<number | null>(null);
  const drumSourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const tracksRef = useRef(tracks);
  tracksRef.current = tracks;

  const drumBuffersRef = useRef<Map<string, AudioBuffer>>(new Map());

  const getAudioContext = useCallback(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext();
    }
    if (audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume();
    }
    return audioContextRef.current;
  }, []);

  const getDrumBuffer = useCallback((name: string): AudioBuffer => {
    const ctx = getAudioContext();
    const existing = drumBuffersRef.current.get(name);
    if (existing) return existing;

    const sampleRate = ctx.sampleRate;
    const duration = name === 'kick' ? 0.3 : name === 'snare' ? 0.2 : 0.05;
    const length = Math.floor(sampleRate * duration);
    const buffer = ctx.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);

    if (name === 'kick') {
      for (let i = 0; i < length; i++) {
        const t = i / sampleRate;
        const freq = 150 * Math.exp(-t * 10);
        const env = Math.exp(-t * 8);
        data[i] = Math.sin(2 * Math.PI * freq * t) * env * 0.8;
      }
    } else if (name === 'snare') {
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
  }, [getAudioContext]);

  // Request mic access — called on first user interaction
  const initMic = useCallback(async () => {
    if (mediaStreamRef.current) return;
    try {
      const ctx = getAudioContext();
      mediaStreamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
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
      console.error('Mic access denied:', err);
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
      const progress = (elapsed % loopDurationRef.current) / loopDurationRef.current;
      setLoopProgress(progress);
      progressAnimFrameRef.current = requestAnimationFrame(update);
    };
    update();
  }, []);

  const playTrackLoop = useCallback((trackId: number, buffer: AudioBuffer) => {
    const ctx = getAudioContext();

    const existing = sourceNodesRef.current.get(trackId);
    if (existing) {
      try { existing.stop(); } catch { /* already stopped */ }
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
  }, [getAudioContext]);

  const startRecording = useCallback(async (trackId: number) => {
    const ctx = getAudioContext();

    // Ensure mic is ready
    if (!mediaStreamRef.current) {
      await initMic();
    }
    if (!mediaStreamRef.current) return; // mic denied

    chunksRef.current = [];
    recordingTrackRef.current = trackId;

    const recorder = new MediaRecorder(mediaStreamRef.current);
    recorderRef.current = recorder;

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    recorder.onstop = async () => {
      const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
      const arrayBuffer = await blob.arrayBuffer();
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer);

      const tid = recordingTrackRef.current!;

      if (loopDurationRef.current <= 0) {
        loopDurationRef.current = audioBuffer.duration;
        loopStartTimeRef.current = ctx.currentTime;
        setIsLooping(true);
        startProgressLoop();
      }

      setTracks(prev => prev.map(t =>
        t.id === tid ? { ...t, state: 'playing' as TrackState, buffer: audioBuffer } : t
      ));

      playTrackLoop(tid, audioBuffer);
      recordingTrackRef.current = null;
    };

    recorder.start();
    setTracks(prev => prev.map(t =>
      t.id === trackId ? { ...t, state: 'recording' as TrackState } : t
    ));
  }, [getAudioContext, initMic, playTrackLoop, startProgressLoop]);

  const stopRecording = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state === 'recording') {
      recorderRef.current.stop();
    }
  }, []);

  const toggleMute = useCallback((trackId: number) => {
    setTracks(prev => prev.map(t => {
      if (t.id !== trackId) return t;
      if (t.state === 'playing') {
        const gainNode = gainNodesRef.current.get(trackId);
        if (gainNode) gainNode.gain.value = 0;
        return { ...t, state: 'muted' as TrackState };
      }
      if (t.state === 'muted') {
        const gainNode = gainNodesRef.current.get(trackId);
        if (gainNode) gainNode.gain.value = 1;
        return { ...t, state: 'playing' as TrackState };
      }
      return t;
    }));
  }, []);

  const deleteTrack = useCallback((trackId: number) => {
    const source = sourceNodesRef.current.get(trackId);
    if (source) {
      try { source.stop(); } catch { /* already stopped */ }
      sourceNodesRef.current.delete(trackId);
    }
    const gain = gainNodesRef.current.get(trackId);
    if (gain) {
      gain.disconnect();
      gainNodesRef.current.delete(trackId);
    }

    setTracks(prev => {
      const updated = prev.map(t =>
        t.id === trackId ? { ...t, state: 'empty' as TrackState, buffer: null } : t
      );
      const anyActive = updated.some(t => t.state === 'playing' || t.state === 'muted');
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
  const handlePadPress = useCallback((trackId: number) => {
    const track = tracksRef.current.find(t => t.id === trackId);
    if (!track) return;

    switch (track.state) {
      case 'empty':
        startRecording(trackId);
        break;
      case 'recording':
        stopRecording();
        break;
      case 'playing':
      case 'muted':
        toggleMute(trackId);
        break;
    }
  }, [startRecording, stopRecording, toggleMute]);

  // Drum machine — loops independently, does NOT set master loop
  const startDrums = useCallback(() => {
    const ctx = getAudioContext();
    const pattern = drumPatterns[drumState.patternIndex];
    const stepDuration = 60 / drumState.bpm / 4;
    const totalSteps = pattern.steps * drumState.bars;

    let step = 0;
    const scheduleStep = () => {
      const currentStep = step % pattern.steps;

      pattern.tracks.forEach(track => {
        if (track.pattern[currentStep]) {
          const buffer = getDrumBuffer(track.name);
          const source = ctx.createBufferSource();
          source.buffer = buffer;
          source.connect(ctx.destination);
          source.start();
          drumSourcesRef.current.push(source);
        }
      });

      step++;
      if (step >= totalSteps) step = 0;
    };

    scheduleStep();
    drumIntervalRef.current = window.setInterval(scheduleStep, stepDuration * 1000);

    setDrumState(prev => ({ ...prev, active: true }));
  }, [getAudioContext, drumState.patternIndex, drumState.bpm, drumState.bars, getDrumBuffer]);

  const stopDrums = useCallback(() => {
    if (drumIntervalRef.current) {
      clearInterval(drumIntervalRef.current);
      drumIntervalRef.current = null;
    }
    drumSourcesRef.current.forEach(s => { try { s.stop(); } catch { /* already stopped */ } });
    drumSourcesRef.current = [];
    setDrumState(prev => ({ ...prev, active: false }));
  }, []);

  const setDrumPattern = useCallback((index: number) => {
    setDrumState(prev => ({ ...prev, patternIndex: index }));
  }, []);

  const setDrumBpm = useCallback((bpm: number) => {
    setDrumState(prev => ({ ...prev, bpm }));
  }, []);

  const setDrumBars = useCallback((bars: number) => {
    setDrumState(prev => ({ ...prev, bars }));
  }, []);

  const stopAll = useCallback(() => {
    sourceNodesRef.current.forEach((source) => {
      try { source.stop(); } catch { /* already stopped */ }
    });
    sourceNodesRef.current.clear();
    gainNodesRef.current.forEach(g => g.disconnect());
    gainNodesRef.current.clear();
    stopDrums();
    cancelAnimationFrame(progressAnimFrameRef.current);
    loopDurationRef.current = 0;
    loopStartTimeRef.current = 0;
    setIsLooping(false);
    setLoopProgress(0);
    setTracks(prev => prev.map(t => ({ ...t, state: 'empty' as TrackState, buffer: null })));
  }, [stopDrums]);

  useEffect(() => {
    return () => {
      cancelAnimationFrame(inputAnimFrameRef.current);
      cancelAnimationFrame(progressAnimFrameRef.current);
      mediaStreamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, []);

  return {
    tracks,
    loopProgress,
    isLooping,
    inputLevel,
    micReady,
    drumState,
    drumPatterns,
    handlePadPress,
    deleteTrack,
    stopAll,
    startDrums,
    stopDrums,
    setDrumPattern,
    setDrumBpm,
    setDrumBars,
    initMic,
  };
}
