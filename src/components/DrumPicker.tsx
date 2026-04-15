import type { DrumPattern } from '../types';

interface Props {
  patterns: DrumPattern[];
  currentIndex: number;
  bpm: number;
  bars: number;
  active: boolean;
  onSelectPattern: (index: number) => void;
  onSetBpm: (bpm: number) => void;
  onSetBars: (bars: number) => void;
  onStart: () => void;
  onStop: () => void;
}

export function DrumPicker({
  patterns,
  currentIndex,
  bpm,
  bars,
  active,
  onSelectPattern,
  onSetBpm,
  onSetBars,
  onStart,
  onStop,
}: Props) {
  return (
    <div className="drum-picker">
      <div className="drum-picker-controls">
        <div className="drum-picker-row">
          <label>PATTERN</label>
          <select
            value={currentIndex}
            onChange={(e) => onSelectPattern(Number(e.target.value))}
            disabled={active}
          >
            {patterns.map((p, i) => (
              <option key={i} value={i}>{p.name}</option>
            ))}
          </select>
        </div>

        <div className="drum-picker-row">
          <label>BPM</label>
          <div className="drum-bpm-control">
            <button onClick={() => onSetBpm(Math.max(60, bpm - 5))} disabled={active}>−</button>
            <span className="drum-bpm-value">{bpm}</span>
            <button onClick={() => onSetBpm(Math.min(200, bpm + 5))} disabled={active}>+</button>
          </div>
        </div>

        <div className="drum-picker-row">
          <label>BARS</label>
          <div className="drum-bars-control">
            {[1, 2, 4].map(b => (
              <button
                key={b}
                className={bars === b ? 'active' : ''}
                onClick={() => onSetBars(b)}
                disabled={active}
              >
                {b}
              </button>
            ))}
          </div>
        </div>
      </div>

      <button
        className={`drum-toggle ${active ? 'active' : ''}`}
        onClick={active ? onStop : onStart}
      >
        {active ? '■ STOP' : '▶ START'}
      </button>
    </div>
  );
}
