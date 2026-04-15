import type { TrackState } from '../types';

interface Props {
  progress: number;
  isLooping: boolean;
  tracks: { id: number; state: TrackState }[];
}

export function LoopRing({ progress, isLooping, tracks }: Props) {
  const size = 160;
  const center = size / 2;
  const radius = 62;
  const strokeWidth = 8;

  const angle = progress * 360 - 90;
  const rad = (angle * Math.PI) / 180;
  const dotX = center + radius * Math.cos(rad);
  const dotY = center + radius * Math.sin(rad);

  // Track indicator dots around the ring
  const activeCount = tracks.filter(t => t.state === 'playing' || t.state === 'recording').length;
  const mutedCount = tracks.filter(t => t.state === 'muted').length;

  return (
    <div className="loop-ring-container">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Outer metallic bezel */}
        <defs>
          <radialGradient id="bezelGrad" cx="40%" cy="35%">
            <stop offset="0%" stopColor="#4a4a4a" />
            <stop offset="100%" stopColor="#1a1a1a" />
          </radialGradient>
          <filter id="glow">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="dotGlow">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Bezel ring */}
        <circle cx={center} cy={center} r={radius + 14} fill="url(#bezelGrad)" />
        <circle cx={center} cy={center} r={radius + 10} fill="#111" />

        {/* Background ring */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="#2a2a2a"
          strokeWidth={strokeWidth}
        />

        {/* Progress arc */}
        {isLooping && (
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke="#00ff44"
            strokeWidth={strokeWidth}
            strokeDasharray={`${progress * 2 * Math.PI * radius} ${2 * Math.PI * radius}`}
            strokeDashoffset={2 * Math.PI * radius * 0.25}
            strokeLinecap="round"
            filter="url(#glow)"
            opacity={0.8}
          />
        )}

        {/* Playhead dot */}
        {isLooping && (
          <circle
            cx={dotX}
            cy={dotY}
            r={6}
            fill="#00ff44"
            filter="url(#dotGlow)"
          />
        )}

        {/* Center info */}
        <text x={center} y={center - 8} textAnchor="middle" fill="#666" fontSize="11" fontFamily="monospace">
          {isLooping ? 'LOOP' : 'READY'}
        </text>
        <text x={center} y={center + 14} textAnchor="middle" fill="#aaa" fontSize="13" fontFamily="monospace" fontWeight="bold">
          {activeCount > 0 && `${activeCount} ACTIVE`}
          {mutedCount > 0 && ` ${mutedCount} MUTE`}
          {activeCount === 0 && mutedCount === 0 && 'TAP PAD'}
        </text>
      </svg>
    </div>
  );
}
