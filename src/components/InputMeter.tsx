interface Props {
  level: number;
}

export function InputMeter({ level }: Props) {
  const bars = 12;
  const activeCount = Math.floor(level * bars);

  return (
    <div className="input-meter">
      <span className="input-meter-label">INPUT</span>
      <div className="input-meter-bars">
        {Array.from({ length: bars }).map((_, i) => {
          const isActive = i < activeCount;
          const color = i < 8 ? '#00ff44' : i < 10 ? '#ffaa00' : '#ff3333';
          return (
            <div
              key={i}
              className="input-meter-bar"
              style={{
                backgroundColor: isActive ? color : '#2a2a2a',
                boxShadow: isActive ? `0 0 4px ${color}` : 'none',
              }}
            />
          );
        })}
      </div>
    </div>
  );
}
