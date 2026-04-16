import { useState, useRef } from "react";
import { IconTrash } from "@tabler/icons-react";
import type { TrackState } from "../types";

interface Props {
  id: number;
  state: TrackState;
  queued: boolean;
  barsRemaining: number;
  onPress: () => void;
  onDelete: () => void;
}

const STATE_COLORS: Record<TrackState, string> = {
  empty: "#5a5a5a",
  recording: "#ff2222",
  playing: "#00ff44",
  muted: "#ff8800",
};

const STATE_GLOW: Record<TrackState, string> = {
  empty: "none",
  recording: "0 0 20px #ff2222, 0 0 40px #ff222266",
  playing: "0 0 20px #00ff44, 0 0 40px #00ff4466",
  muted: "0 0 12px #ff880066",
};

const STATE_LABELS: Record<TrackState, string> = {
  empty: "",
  recording: "● REC",
  playing: "▶ PLAYING",
  muted: "MUTED",
};

export function TrackPad({
  state,
  queued,
  barsRemaining,
  onPress,
  onDelete,
}: Props) {
  const [showDelete, setShowDelete] = useState(false);
  const [pressed, setPressed] = useState(false);
  const pressTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const handlePress = () => {
    setPressed(true);
    clearTimeout(pressTimer.current);
    pressTimer.current = setTimeout(() => setPressed(false), 150);
    onPress();
  };

  const handleDelete = (e: React.MouseEvent) => {
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
      {/* LED strip */}
      <div
        className={`track-led${queued ? " queued" : ""}`}
        style={{
          backgroundColor: queued ? "#ff8800" : STATE_COLORS[state],
          boxShadow: queued ? "0 0 12px #ff8800" : STATE_GLOW[state],
        }}
      />

      {/* Rubber footswitch pad */}
      <button
        className={`track-pad ${state} ${pressed ? "pressed" : ""} ${queued ? "queued" : ""}`}
        onClick={handlePress}
      >
        <div className="pad-surface">
          <div className="pad-grip-lines">
            <div className="grip-line" />
            <div className="grip-line" />
            <div className="grip-line" />
          </div>
          {queued ? (
            <span
              className="track-pad-label queued-label"
              style={{ color: "#ff8800" }}
            >
              {barsRemaining}
            </span>
          ) : STATE_LABELS[state] ? (
            <span
              className="track-pad-label"
              style={{ color: STATE_COLORS[state] }}
            >
              {STATE_LABELS[state]}
            </span>
          ) : null}
        </div>
      </button>

      {/* Delete button */}
      {(state === "playing" || state === "muted") && (
        <button
          className={`track-delete ${showDelete ? "confirm" : ""}`}
          onClick={handleDelete}
        >
          {showDelete ? (
            <>
              <IconTrash size={12} /> DELETE
            </>
          ) : (
            <IconTrash size={12} />
          )}
        </button>
      )}
    </div>
  );
}
