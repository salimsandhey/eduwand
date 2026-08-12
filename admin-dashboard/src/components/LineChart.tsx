import { useState } from "react";
import type { CSSProperties } from "react";

// Trend-over-time, 2 series -> line chart, categorical color, per the dataviz
// skill (choosing-a-form.md). Mark spec (marks-and-anatomy.md): 2px lines,
// >=8px end markers with a 2px surface-color ring, a legend for >=2 series,
// direct end-value labels, hairline recessive gridlines. Hover crosshair +
// tooltip per interaction.md - a line chart ships interactive by default.
interface LineChartSeries {
  label: string;
  color: string;
  values: number[];
}

const VIEW_W = 600;
const VIEW_H = 220;
const PAD = { top: 20, right: 10, bottom: 28, left: 10 };
const PLOT_W = VIEW_W - PAD.left - PAD.right;
const PLOT_H = VIEW_H - PAD.top - PAD.bottom;

export function LineChart({
  series,
  xLabels,
  valueFormatter = (v) => String(v),
}: {
  series: LineChartSeries[];
  xLabels: string[];
  valueFormatter?: (value: number) => string;
}) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const n = xLabels.length;
  const max = Math.max(1, ...series.flatMap((s) => s.values));

  function x(i: number) {
    return PAD.left + (n <= 1 ? PLOT_W / 2 : (i / (n - 1)) * PLOT_W);
  }
  function y(v: number) {
    return PAD.top + PLOT_H - (v / max) * PLOT_H;
  }

  function handleMove(e: React.MouseEvent<SVGRectElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / rect.width) * VIEW_W;
    const i = Math.round(((relX - PAD.left) / PLOT_W) * (n - 1));
    setHoverIndex(Math.min(n - 1, Math.max(0, i)));
  }

  const gridLines = [0, 0.5, 1];

  return (
    <div style={{ position: "relative" }}>
      <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} style={{ width: "100%", height: "auto", display: "block", overflow: "visible" }}>
        {gridLines.map((frac) => (
          <line
            key={frac}
            x1={PAD.left}
            x2={VIEW_W - PAD.right}
            y1={PAD.top + PLOT_H * (1 - frac)}
            y2={PAD.top + PLOT_H * (1 - frac)}
            stroke="var(--gridline)"
            strokeWidth={1}
          />
        ))}

        {xLabels.map((label, i) => (
          <text
            key={label + i}
            x={x(i)}
            y={VIEW_H - 6}
            textAnchor="middle"
            fontSize={10}
            fill="var(--text-muted)"
          >
            {label}
          </text>
        ))}

        {series.map((s) => {
          const points = s.values.map((v, i) => `${x(i)},${y(v)}`).join(" ");
          const lastIndex = s.values.length - 1;
          return (
            <g key={s.label}>
              <polyline points={points} fill="none" stroke={s.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
              <circle cx={x(lastIndex)} cy={y(s.values[lastIndex])} r={5} fill={s.color} stroke="var(--bg-card)" strokeWidth={2} />
              <text x={x(lastIndex) + 8} y={y(s.values[lastIndex]) + 4} fontSize={12} fontWeight={700} fill="var(--text-primary)">
                {valueFormatter(s.values[lastIndex])}
              </text>
            </g>
          );
        })}

        {hoverIndex !== null ? (
          <g>
            <line x1={x(hoverIndex)} x2={x(hoverIndex)} y1={PAD.top} y2={PAD.top + PLOT_H} stroke="var(--border)" strokeWidth={1} />
            {series.map((s) => (
              <circle key={s.label} cx={x(hoverIndex)} cy={y(s.values[hoverIndex])} r={5} fill={s.color} stroke="var(--bg-card)" strokeWidth={2} />
            ))}
          </g>
        ) : null}

        <rect
          x={PAD.left}
          y={PAD.top}
          width={PLOT_W}
          height={PLOT_H}
          fill="transparent"
          onMouseMove={handleMove}
          onMouseLeave={() => setHoverIndex(null)}
        />
      </svg>

      <div style={styles.legend}>
        {series.map((s) => (
          <span key={s.label} style={styles.legendItem}>
            <span style={{ ...styles.legendSwatch, background: s.color }} />
            {s.label}
          </span>
        ))}
      </div>

      {hoverIndex !== null ? (
        <div
          style={{
            ...styles.tooltip,
            left: `${(x(hoverIndex) / VIEW_W) * 100}%`,
          }}
        >
          <div style={styles.tooltipHeader}>{xLabels[hoverIndex]}</div>
          {series.map((s) => (
            <div key={s.label} style={styles.tooltipRow}>
              <span style={{ ...styles.tooltipKey, background: s.color }} />
              <span style={styles.tooltipLabel}>{s.label}</span>
              <span style={styles.tooltipValue}>{valueFormatter(s.values[hoverIndex])}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  legend: { display: "flex", gap: 16, marginTop: 4, flexWrap: "wrap" },
  legendItem: { display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-secondary)", fontWeight: 600 },
  legendSwatch: { width: 12, height: 2, borderRadius: 1, display: "inline-block" },
  tooltip: {
    position: "absolute",
    top: 10,
    transform: "translateX(-50%)",
    background: "var(--bg-card)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    padding: "8px 10px",
    boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
    pointerEvents: "none",
    minWidth: 130,
  },
  tooltipHeader: { fontSize: 11, fontWeight: 700, color: "var(--text-muted)", marginBottom: 4 },
  tooltipRow: { display: "flex", alignItems: "center", gap: 6, fontSize: 12 },
  tooltipKey: { width: 10, height: 2, borderRadius: 1, display: "inline-block", flexShrink: 0 },
  tooltipLabel: { color: "var(--text-secondary)", flex: 1 },
  tooltipValue: { color: "var(--text-primary)", fontWeight: 700 },
};
