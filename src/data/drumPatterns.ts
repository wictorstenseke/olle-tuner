import type { DrumPattern } from '../types';

// 16-step patterns, 1 = hit, 0 = rest
export const drumPatterns: DrumPattern[] = [
  {
    name: 'Basic Rock',
    steps: 16,
    tracks: [
      { name: 'kick',  pattern: [1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0] },
      { name: 'snare', pattern: [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0] },
      { name: 'hihat', pattern: [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0] },
    ],
  },
  {
    name: 'Funk',
    steps: 16,
    tracks: [
      { name: 'kick',  pattern: [1,0,0,1, 0,0,1,0, 1,0,0,1, 0,0,0,0] },
      { name: 'snare', pattern: [0,0,0,0, 1,0,0,1, 0,0,0,0, 1,0,0,0] },
      { name: 'hihat', pattern: [1,1,1,1, 1,1,1,1, 1,1,1,1, 1,1,1,1] },
    ],
  },
  {
    name: 'Bossa Nova',
    steps: 16,
    tracks: [
      { name: 'kick',  pattern: [1,0,0,0, 0,0,1,0, 0,1,0,0, 0,0,0,0] },
      { name: 'snare', pattern: [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0] },
      { name: 'hihat', pattern: [1,0,1,1, 0,1,1,0, 1,1,0,1, 1,0,1,0] },
    ],
  },
  {
    name: 'Hip Hop',
    steps: 16,
    tracks: [
      { name: 'kick',  pattern: [1,0,0,0, 0,0,0,0, 1,0,1,0, 0,0,0,0] },
      { name: 'snare', pattern: [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,1] },
      { name: 'hihat', pattern: [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0] },
    ],
  },
  {
    name: 'Reggae',
    steps: 16,
    tracks: [
      { name: 'kick',  pattern: [1,0,0,0, 0,0,1,0, 0,0,0,0, 1,0,0,0] },
      { name: 'snare', pattern: [0,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0] },
      { name: 'hihat', pattern: [0,1,0,1, 0,1,0,1, 0,1,0,1, 0,1,0,1] },
    ],
  },
  {
    name: 'Metronome',
    steps: 4,
    tracks: [
      { name: 'kick',  pattern: [1,0,0,0] },
      { name: 'hihat', pattern: [0,1,1,1] },
    ],
  },
];
