import { useState } from 'react';
import type { TrackState } from '../types';

interface Props {
  id: number;
  state: TrackState;
  onPress: () => void;
  onDelete: () => void;
}

const STATE_COLORS: Record<TrackState, string> = {
  empty: '#333',
  recording: '#ff2222',
  playing: '#00ff44',
  muted: '#555',
};

const STATE_GLOW: Record<TrackState, string> = {
  empty: 'none',
  recording: '0 0 20px #ff2222, 0 0 40px #ff222266',
  playing: '0 0 20px #00ff44, 0 0 40px #00ff4466',
  muted: '0 0 8px #55555566',
};

const STATE_LABELS: Record<TrackState, string> = {
  empty: 'TAP TO REC',
  recording: '● REC',
  playing: '▶ PLAYING',
  muted: '■ MUTED',
};

export function TrackPad({ id, state, onPress, onDelete }: Props) {
  const [showDelete, setShowDelete] = useState(false);
  const [pressed, setPressed] = useState(false);

  const handleDelete = (e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
    if (showDelete) {
      onDelete();
      setShowDelete(false);
    } else {
      setShowDelete(true);
      setTimeout(() => setShowDelete(false), 3000);
    }
  };

  return (
    <div className="track-pad-wrapper">
      {/* LED indicator */}
      <div
        className="track-led"
        style={{
          backgroundColor: STATE_COLORS[state],
          boxShadow: STATE_GLOW[state],
        }}
      />

      {/* Main pad button */}
      <button
        className={`track-pad ${state} ${pressed ? 'pressed' : ''}`}
        onPointerDown={() => setPressed(true)}
        onPointerUp={() => { setPressed(false); onPress(); }}
        onPointerLeave={() => setPressed(false)}
        style={{
          borderColor: STATE_COLORS[state],
        }}
      >
        <span className="track-pad-number">TRACK {id}</span>
        <span className="track-pad-label" style={{ color: STATE_COLORS[state] }}>
          {STATE_LABELS[state]}
        </span>
      </button>

      {/* Delete button */}
      {state !== 'empty' && (
        <button
          className={`track-delete ${showDelete ? 'confirm' : ''}`}
          onClick={handleDelete}
          onTouchEnd={handleDelete}
        >
          {showDelete ? '✕ CONFIRM' : '✕'}
        </button>
      )}
    </div>
  );
}
