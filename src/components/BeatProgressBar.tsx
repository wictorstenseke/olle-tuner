interface Props {
  progress: number;
  isActive: boolean;
  isRecording: boolean;
  countInBeat: number | null;
}

export function BeatProgressBar({ progress, isActive, isRecording, countInBeat }: Props) {
  const beats = [1, 2, 3, 4];
  const activeBeatIndex = isActive ? Math.min(Math.floor(progress * 4), 3) : -1;

  return (
    <div className={`beat-progress-bar${isRecording ? ' recording' : ''}`}>
      <div className="beat-segments">
        {/* Smooth fill — only during recording */}
        {isActive && isRecording && (
          <div
            className="beat-fill"
            style={{ width: `${progress * 100}%`, background: 'rgba(255, 34, 34, 0.25)' }}
          />
        )}
        {beats.map((num, i) => {
          const isCountIn = countInBeat === num;
          const isCurrent = activeBeatIndex === i;
          const isCompleted = isRecording && isActive && i < activeBeatIndex;
          return (
            <div
              key={num}
              className={`beat-segment${isCurrent ? ' active' : ''}${isCompleted ? ' completed' : ''}${isCountIn ? ' count-in' : ''}`}
            >
              <span className="beat-label">{num}</span>
            </div>
          );
        })}
      </div>
      {isActive && (
        <div
          className={`beat-playhead${isRecording ? ' recording' : ''}`}
          style={{ left: `${progress * 100}%` }}
        />
      )}
    </div>
  );
}
