export function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div style={styles.tile}>
      <span style={styles.value}>{value}</span>
      <span style={styles.label}>{label}</span>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  tile: {
    background: "var(--bg-card)",
    border: "1px solid var(--border)",
    borderTop: "3px solid var(--accent)",
    borderRadius: 18,
    padding: "20px 22px",
    flex: 1,
    minWidth: 160,
    boxShadow: "var(--shadow-card)",
  },
  value: { display: "block", fontSize: 34, lineHeight: 1, fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-1px" },
  label: { display: "block", fontSize: 12, fontWeight: 700, color: "var(--text-muted)", marginTop: 8, textTransform: "uppercase", letterSpacing: "0.5px" },
};
