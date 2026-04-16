import { useTuner } from "../hooks/useTuner";

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export function TunerModal({ isOpen, onClose }: Props) {
  const { tunerData, guitarStrings } = useTuner(isOpen);

  if (!isOpen) return null;

  const centsAbs = Math.abs(tunerData.cents);
  const inTune = centsAbs < 5;
  const centsColor = inTune ? "#00ff44" : centsAbs < 15 ? "#ffaa00" : "#ff3333";

  return (
    <div className="tuner-overlay" onClick={onClose}>
      <div className="tuner-modal" onClick={(e) => e.stopPropagation()}>
        <div className="tuner-header">
          <span className="tuner-title">CHROMATIC TUNER</span>
          <button className="tuner-close" onClick={onClose}>
            ✕
          </button>
        </div>

        {/* String circles */}
        <div className="tuner-strings">
          {guitarStrings.map((s, i) => {
            const isClosest = tunerData.closestString === i && tunerData.active;
            return (
              <div
                key={i}
                className={`tuner-string-circle ${isClosest ? "active" : ""}`}
                style={{
                  borderColor: isClosest
                    ? inTune
                      ? "#00ff44"
                      : "#ffaa00"
                    : "#404040",
                  boxShadow: isClosest
                    ? `0 0 15px ${inTune ? "#00ff44" : "#ffaa00"}, inset 0 0 10px ${inTune ? "#00ff4433" : "#ffaa0033"}`
                    : "none",
                }}
              >
                <span className="string-note">{s.note}</span>
                <span className="string-number">
                  {guitarStrings.length - i}
                </span>
              </div>
            );
          })}
        </div>

        {/* Current note display */}
        <div className="tuner-note-display">
          <span
            className="tuner-note"
            style={{ color: tunerData.active ? centsColor : "#707070" }}
          >
            {tunerData.note}
          </span>
          <span className="tuner-octave">
            {tunerData.active ? tunerData.octave : ""}
          </span>
        </div>

        {/* Cents meter */}
        <div className="tuner-cents-meter">
          <div className="cents-scale">
            <span>♭</span>
            <div className="cents-bar-container">
              <div className="cents-center-mark" />
              {tunerData.active && (
                <div
                  className="cents-indicator"
                  style={{
                    left: `${50 + tunerData.cents}%`,
                    backgroundColor: centsColor,
                    boxShadow: `0 0 10px ${centsColor}`,
                  }}
                />
              )}
            </div>
            <span>♯</span>
          </div>
          <span className="cents-value" style={{ color: centsColor }}>
            {tunerData.active
              ? `${tunerData.cents > 0 ? "+" : ""}${tunerData.cents}¢`
              : "—"}
          </span>
        </div>

        {/* Frequency */}
        <div className="tuner-freq">
          {tunerData.active ? `${tunerData.frequency.toFixed(1)} Hz` : "— Hz"}
        </div>
      </div>
    </div>
  );
}
