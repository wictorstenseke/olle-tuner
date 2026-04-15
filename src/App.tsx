import { useState } from 'react';
import { LoopRing } from './components/LoopRing';
import { InputMeter } from './components/InputMeter';
import { TrackPad } from './components/TrackPad';
import { DrumPicker } from './components/DrumPicker';
import { TunerModal } from './components/TunerModal';
import { useAudioEngine } from './hooks/useAudioEngine';
import './App.css';

function App() {
  const [tunerOpen, setTunerOpen] = useState(false);
  const [drumsOpen, setDrumsOpen] = useState(false);
  const engine = useAudioEngine();

  return (
    <div className="app">
      {/* Top bar */}
      <div className="top-bar">
        <div className="logo">OLLE TUNER</div>
        <InputMeter level={engine.inputLevel} />
        <div className="top-bar-buttons">
          <button
            className={`top-btn ${engine.drumState.active ? 'active' : ''}`}
            onClick={() => setDrumsOpen(true)}
          >
            DRUMS
            {engine.drumState.active && <span className="top-btn-dot" />}
          </button>
          <button className="top-btn" onClick={() => setTunerOpen(true)}>
            TUNER
          </button>
        </div>
      </div>

      {/* Loop ring */}
      <div className="ring-section">
        <LoopRing
          progress={engine.loopProgress}
          isLooping={engine.isLooping}
          tracks={engine.tracks}
        />
      </div>

      {/* Track pads + stop all */}
      <div className="pads-section">
        {engine.tracks.map((track) => (
          <TrackPad
            key={track.id}
            id={track.id}
            state={track.state}
            onPress={() => engine.handlePadPress(track.id)}
            onDelete={() => engine.deleteTrack(track.id)}
          />
        ))}
        <div className="track-pad-wrapper">
          <div className="track-led" style={{ backgroundColor: '#ff3333', boxShadow: '0 0 8px #ff333366' }} />
          <button className="track-pad stop-all" onClick={engine.stopAll}>
            <div className="pad-surface">
              <div className="pad-grip-lines">
                <div className="grip-line" />
                <div className="grip-line" />
                <div className="grip-line" />
              </div>
              <span className="track-pad-label" style={{ color: '#ff3333' }}>■ STOP ALL</span>
            </div>
          </button>
        </div>
      </div>

      {/* Drums modal */}
      {drumsOpen && (
        <div className="modal-overlay" onClick={() => setDrumsOpen(false)}>
          <div className="drums-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">DRUM MACHINE</span>
              <button className="modal-close" onClick={() => setDrumsOpen(false)}>✕</button>
            </div>
            <DrumPicker
              patterns={engine.drumPatterns}
              currentIndex={engine.drumState.patternIndex}
              bpm={engine.drumState.bpm}
              bars={engine.drumState.bars}
              active={engine.drumState.active}
              onSelectPattern={engine.setDrumPattern}
              onSetBpm={engine.setDrumBpm}
              onSetBars={engine.setDrumBars}
              onStart={engine.startDrums}
              onStop={engine.stopDrums}
            />
          </div>
        </div>
      )}

      {/* Tuner modal */}
      <TunerModal isOpen={tunerOpen} onClose={() => setTunerOpen(false)} />
    </div>
  );
}

export default App;
