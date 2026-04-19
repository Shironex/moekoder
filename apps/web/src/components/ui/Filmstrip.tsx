interface FilmstripProps {
  /** Completion percentage, 0-100. Controls how many frames light up. */
  pct: number;
  /** Total frame count (defaults to 12, matching the design prototype). */
  count?: number;
}

/**
 * Horizontal filmstrip progress with top + bottom sprocket rows. The "active"
 * frame is the one the encode is currently rendering into — it pulses via a
 * CSS `scan` keyframe defined in `primitives.css`.
 */
export const Filmstrip = ({ pct, count = 12 }: FilmstripProps) => {
  const clamped = Math.max(0, Math.min(100, pct));
  const activeIdx = Math.floor((clamped / 100) * count);
  const frames = Array.from({ length: count }, (_, i) => i);
  return (
    <div className="filmstrip">
      <div className="filmstrip-sprockets top">
        {frames.map(i => (
          <div key={i} className="hole" />
        ))}
      </div>
      {frames.map(i => {
        const state = i < activeIdx ? 'done' : i === activeIdx ? 'active' : '';
        return (
          <div key={i} className={`frame ${state}`} style={{ animationDelay: `${i * 0.05}s` }}>
            <span className="frame-num">{String(i + 1).padStart(2, '0')}</span>
          </div>
        );
      })}
      <div className="filmstrip-sprockets bot">
        {frames.map(i => (
          <div key={i} className="hole" />
        ))}
      </div>
    </div>
  );
};
