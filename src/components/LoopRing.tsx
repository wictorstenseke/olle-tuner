import type { TrackState } from '../types';

interface Props {
  progress: number;
  isLooping: boolean;
  tracks: { id: number; state: TrackState }[];
}

export function LoopRing({ progress, isLooping, tracks }: Props) {
  const size = 100;
  const center = size / 2;
  const radius = 38;
  const strokeWidth = 5;
  const circumference = 2 * Math.PI * radius;

  // Start position: top (12 o'clock = -90 degrees)
  const startAngle = -90;
  const startRad = (startAngle * Math.PI) / 180;
  const startX = center + radius * Math.cos(startRad);
  const startY = center + radius * Math.sin(startRad);

  // Playhead position
  const headAngle = startAngle + progress * 360;
  const headRad = (headAngle * Math.PI) / 180;
  const headX = center + radius * Math.cos(headRad);
  const headY = center + radius * Math.sin(headRad);

  // Tick marks around the ring (12 marks like a clock)
  const ticks = Array.from({ length: 12 }, (_, i) => {
    const tickAngle = ((i * 30) - 90) * Math.PI / 180;
    const isMajor = i % 3 === 0;
    const innerR = radius - (isMajor ? 10 : 7);
    const outerR = radius - 4;
    return {
      x1: center + innerR * Math.cos(tickAngle),
      y1: center + innerR * Math.sin(tickAngle),
      x2: center + outerR * Math.cos(tickAngle),
      y2: center + outerR * Math.sin(tickAngle),
      isMajor,
    };
  });

  const activeCount = tracks.filter(t => t.state === 'playing' || t.state === 'recording').length;
  const mutedCount = tracks.filter(t => t.state === 'muted').length;
  const isRecording = tracks.some(t => t.state === 'recording');

  const ringColor = isRecording ? '#ff2222' : '#c87400';

  return (
    <div className="loop-ring-container">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <defs>
          <radialGradient id="bezelGrad" cx="40%" cy="35%">
            <stop offset="0%" stopColor="#4a4a4a" />
            <stop offset="100%" stopColor="#1a1a1a" />
          </radialGradient>
          <filter id="glow">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="dotGlow">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Bezel ring */}
        <circle cx={center} cy={center} r={radius + 9} fill="url(#bezelGrad)" />
        <circle cx={center} cy={center} r={radius + 6} fill="#111" />

        {/* Background ring track */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="#222"
          strokeWidth={strokeWidth}
        />

        {/* Tick marks */}
        {ticks.map((tick, i) => (
          <line
            key={i}
            x1={tick.x1}
            y1={tick.y1}
            x2={tick.x2}
            y2={tick.y2}
            stroke={tick.isMajor ? '#444' : '#333'}
            strokeWidth={tick.isMajor ? 2 : 1}
          />
        ))}

        {/* Start marker — bright notch at 12 o'clock */}
        <circle
          cx={startX}
          cy={startY}
          r={3}
          fill={isLooping ? ringColor : '#555'}
          opacity={isLooping ? 1 : 0.6}
        />

        {/* Progress arc */}
        {isLooping && (
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke={ringColor}
            strokeWidth={strokeWidth}
            strokeDasharray={`${progress * circumference} ${circumference}`}
            strokeDashoffset={0}
            strokeLinecap="round"
            filter="url(#glow)"
            opacity={0.7}
            transform={`rotate(-90 ${center} ${center})`}
          />
        )}

        {/* Playhead dot */}
        {isLooping && (
          <circle
            cx={headX}
            cy={headY}
            r={5}
            fill="#fff"
            stroke={ringColor}
            strokeWidth={2}
            filter="url(#dotGlow)"
          />
        )}

        {/* Center info */}
        <text x={center} y={center + 3} textAnchor="middle" fill="#666" fontSize="8" fontFamily="monospace">
          {isLooping ? (isRecording ? 'REC' : `${activeCount}/${activeCount + mutedCount}`) : '---'}
        </text>
      </svg>
    </div>
  );
}
