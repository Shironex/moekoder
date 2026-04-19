import type { ComponentType, SVGProps } from 'react';

interface MetricProps {
  /** Lucide / custom icon component. Rendered at 10px inside the label row. */
  icon: ComponentType<SVGProps<SVGSVGElement> & { size?: number | string }>;
  /** Short uppercase label (e.g. "FPS", "Bitrate"). */
  label: string;
  /** Primary value (formatted upstream — Metric does not coerce). */
  value: string | number;
  /** Optional unit suffix ("kbps", "x", …). */
  unit?: string;
}

/**
 * One cell in the live metrics grid rendered during an encode. The value is
 * monospace-heavy by design; upstream is responsible for formatting it — the
 * primitive never truncates or rounds.
 */
export const Metric = ({ icon: Icon, label, value, unit }: MetricProps) => (
  <div className="metric">
    <div className="m-label">
      <Icon size={10} />
      {label}
    </div>
    <div className="m-value">
      {value}
      {unit && <span className="m-unit">{unit}</span>}
    </div>
  </div>
);
