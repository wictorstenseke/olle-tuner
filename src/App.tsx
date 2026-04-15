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
    <div className="pedalboard">
      {/* Pad section — top area */}
      <div className="pad-area">
        <div className="pad-row">
          {engine.tracks.map((track) => (
            <div className="pad-cell" key={track.id}>
              <TrackPad
                id={track.id}
                state={track.state}
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
        <div className="control-left">
          <div className="control-label">OLLE TUNER</div>
        </div>

        <div className="control-center">
          <LoopRing
            progress={engine.loopProgress}
            isLooping={engine.isLooping}
            tracks={engine.tracks}
          />
          <InputMeter level={engine.inputLevel} />
        </div>

        <div className="control-right">
          <button
            className={`ctrl-btn ${engine.drumState.active ? 'active' : ''}`}
            onClick={() => setDrumsOpen(true)}
          >
            DRUMS
            {engine.drumState.active && <span className="ctrl-btn-dot" />}
          </button>
          <button className="ctrl-btn" onClick={() => setTunerOpen(true)}>
            TUNER
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
