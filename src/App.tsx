import { useState, useRef, useEffect } from 'react';
import { BeatProgressBar } from './components/BeatProgressBar';
import { InputMeter } from './components/InputMeter';
import { TrackPad } from './components/TrackPad';
import { TunerModal } from './components/TunerModal';
import { useAudioEngine } from './hooks/useAudioEngine';
import './App.css';

function App() {
  const [tunerOpen, setTunerOpen] = useState(false);
  const [drumsMenuOpen, setDrumsMenuOpen] = useState(false);
  const drumsMenuRef = useRef<HTMLDivElement>(null);
  const engine = useAudioEngine();

  // Close drums menu on outside click
  useEffect(() => {
    if (!drumsMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (drumsMenuRef.current && !drumsMenuRef.current.contains(e.target as Node)) {
        setDrumsMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [drumsMenuOpen]);

  return (
    <div className="pedalboard">
      {/* Top-right controls */}
      <div className="top-controls">
        <div className="drums-menu-wrapper" ref={drumsMenuRef}>
          <button
            className={`ctrl-btn ${engine.drumState.active ? 'active' : ''}`}
            onClick={() => setDrumsMenuOpen(prev => !prev)}
          >
            DRUMS
            {engine.drumState.active && <span className="ctrl-btn-dot" />}
          </button>
          {drumsMenuOpen && (
            <div className="drums-context-menu">
              <select
                value={engine.drumState.patternIndex}
                onChange={(e) => engine.setDrumPattern(Number(e.target.value))}
                disabled={engine.drumState.active}
              >
                {engine.drumPatterns.map((p, i) => (
                  <option key={i} value={i}>{p.name}</option>
                ))}
              </select>
              <button
                className={`drum-play-btn ${engine.drumState.active ? 'active' : ''}`}
                onClick={() => {
                  if (engine.drumState.active) engine.stopDrums();
                  else engine.startDrums();
                }}
              >
                {engine.drumState.active ? '■ STOP' : '▶ PLAY'}
              </button>
            </div>
          )}
        </div>
        <button className="ctrl-btn" onClick={() => setTunerOpen(true)}>
          TUNER
        </button>
      </div>

      {/* Pad section — top area */}
      <div className="pad-area">
        <div className="pad-row">
          {engine.tracks.map((track) => (
            <div className="pad-cell" key={track.id}>
              <TrackPad
                id={track.id}
                state={track.state}
                queued={engine.queuedTrackId === track.id}
                barsRemaining={engine.queuedTrackId === track.id ? Math.max(1, 4 - Math.floor(engine.loopProgress * 4)) : 0}
                onPress={() => engine.handlePadPress(track.id)}
                onDelete={() => engine.deleteTrack(track.id)}
              />
            </div>
          ))}
          <div className="pad-cell">
            <div className="track-pad-wrapper">
              <div className="track-led" style={{ backgroundColor: '#ff333366', boxShadow: '0 0 6px #ff333333' }} />
              <button className="track-pad stop-all" onClick={engine.stopAll}>
                <div className="pad-surface">
                  <div className="pad-grip-lines">
                    <div className="grip-line" />
                    <div className="grip-line" />
                    <div className="grip-line" />
                  </div>
                  <span className="track-pad-label" style={{ color: '#ff3333' }}>STOP</span>
                </div>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Control strip — bottom area */}
      <div className="control-strip">
        <div className="bar-stack">
          <InputMeter level={engine.inputLevel} />
          <BeatProgressBar
            progress={engine.loopProgress}
            isActive={engine.isLooping}
            isRecording={engine.tracks.some(t => t.state === 'recording')}
            countInBeat={engine.countInBeat}
          />
        </div>
        <div className="bpm-selector">
          <span className="bpm-label-text">BPM</span>
          <button className="bpm-btn" onClick={() => engine.setBpm(engine.bpm - 5)}>−</button>
          <span className="bpm-value">{engine.bpm}</span>
          <button className="bpm-btn" onClick={() => engine.setBpm(engine.bpm + 5)}>+</button>
        </div>
      </div>

      {/* Tuner modal */}
      <TunerModal isOpen={tunerOpen} onClose={() => setTunerOpen(false)} />
    </div>
  );
}

export default App;
