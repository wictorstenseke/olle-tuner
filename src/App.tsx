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
  const engine = useAudioEngine();

  return (
    <div className="app">
      {/* Top bar */}
      <div className="top-bar">
        <div className="logo">OLLE TUNER</div>
        <InputMeter level={engine.inputLevel} />
        <button className="tuner-btn" onClick={() => setTunerOpen(true)}>
          🎵 TUNER
        </button>
      </div>

      {/* Loop ring */}
      <div className="ring-section">
        <LoopRing
          progress={engine.loopProgress}
          isLooping={engine.isLooping}
          tracks={engine.tracks}
        />
      </div>

      {/* Track pads */}
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
      </div>

      {/* Bottom controls */}
      <div className="bottom-section">
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

        <button className="stop-all-btn" onClick={engine.stopAll}>
          ■ STOP ALL
        </button>
      </div>

      {/* Tuner modal */}
      <TunerModal isOpen={tunerOpen} onClose={() => setTunerOpen(false)} />
    </div>
  );
}

export default App;
