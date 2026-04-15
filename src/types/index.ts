export type TrackState = 'empty' | 'recording' | 'playing' | 'muted';

export interface Track {
  id: number;
  state: TrackState;
  buffer: AudioBuffer | null;
  sourceNode: AudioBufferSourceNode | null;
  gainNode: GainNode | null;
}

export interface DrumPattern {
  name: string;
  steps: number;
  tracks: {
    name: string;
    pattern: number[];
  }[];
}
