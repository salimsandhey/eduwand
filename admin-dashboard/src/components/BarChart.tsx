// Horizontal bar chart per the dataviz skill's mark spec: bars capped at 24px thick,
// 4px rounded data-end (square at the baseline), value labeled at the tip, a 2px
// surface gap between bars, recessive hairline track. Each row is already directly
// labeled by category, so no separate legend box is needed - the label IS the
// identity channel here (see marks-and-anatomy.md: "a single series needs no legend
// box" / labels supplement, they don't require duplicating into a legend when the
// category name already rides the bar).
interface BarChartRow {
  label: string;
  value: number;
  color: string;
}

export function BarChart({
  data,
  valueFormatter = (v) => String(v),
}: {
  data: BarChartRow[];
  valueFormatter?: (value: number) => string;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {data.map((row) => (
        <div key={row.label} style={styles.row}>
          <span style={styles.label}>{row.label}</span>
          <div style={styles.track}>
            <div
              style={{
                ...styles.fill,
                width: `${Math.max(2, (row.value / max) * 100)}%`,
                background: row.color,
              }}
            />
          </div>
          <span style={styles.value}>{valueFormatter(row.value)}</span>
        </div>
      ))}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  row: { display: "flex", alignItems: "center", gap: 12 },
  label: { width: 110, fontSize: 13, color: "var(--text-secondary)", textTransform: "capitalize", flexShrink: 0 },
  track: {
    flex: 1,
    height: 20,
    background: "var(--bg-page)",
    borderRadius: 4,
    overflow: "hidden",
  },
  fill: {
    height: "100%",
    borderTopLeftRadius: 0,
    borderBottomLeftRadius: 0,
    borderTopRightRadius: 4,
    borderBottomRightRadius: 4,
    transition: "width 0.2s ease",
  },
  value: { width: 48, fontSize: 13, fontWeight: 600, color: "var(--text-primary)", textAlign: "right", flexShrink: 0 },
};
