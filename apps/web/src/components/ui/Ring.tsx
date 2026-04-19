interface RingProps {
  /** Completion percentage, 0-100. Clamped on render. */
  pct: number;
  /** Preformatted ETA string (e.g. "2m 13s"). */
  eta: string;
}

const SIZE = 180;
const RADIUS = 78;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * Circular progress ring with a percentage / ETA center readout. The fill
 * arc uses `stroke-dasharray` + `stroke-dashoffset` so the shape animates
 * smoothly via the CSS transition declared on `.ring .ring-fill`.
 */
export const Ring = ({ pct, eta }: RingProps) => {
  const clamped = Math.max(0, Math.min(100, pct));
  const offset = CIRCUMFERENCE - (clamped / 100) * CIRCUMFERENCE;
  return (
    <div className="ring">
      <svg width={SIZE} height={SIZE}>
        <circle cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} className="ring-track" />
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          className="ring-fill"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="ring-center">
        <div className="ring-pct">{clamped.toFixed(1)}%</div>
        <div className="ring-eta">ETA · {eta}</div>
      </div>
    </div>
  );
};
