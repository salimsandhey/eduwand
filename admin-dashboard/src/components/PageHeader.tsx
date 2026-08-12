import type { ReactNode, CSSProperties } from "react";

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div style={styles.row}>
      <div>
        <h1 style={styles.title}>{title}</h1>
        {subtitle ? <p style={styles.subtitle}>{subtitle}</p> : null}
      </div>
      {action ? <div style={styles.action}>{action}</div> : null}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  row: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 16,
    marginBottom: 24,
    flexWrap: "wrap",
  },
  title: { fontSize: 28, fontWeight: 800, margin: 0, color: "var(--text-primary)", letterSpacing: "-0.5px" },
  subtitle: { fontSize: 14, color: "var(--text-secondary)", marginTop: 6, marginBottom: 0 },
  action: { flexShrink: 0 },
};
