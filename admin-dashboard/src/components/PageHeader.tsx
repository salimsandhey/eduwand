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
    <div className="ui-page-header" style={styles.row}>
      <div>
        <h1 className="ui-page-title" style={styles.title}>{title}</h1>
        {subtitle ? <p style={styles.subtitle}>{subtitle}</p> : null}
      </div>
      {action ? <div className="ui-page-action" style={styles.action}>{action}</div> : null}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  row: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 16,
    marginBottom: 30,
    flexWrap: "wrap",
  },
  title: { fontSize: 32, lineHeight: 1.1, fontWeight: 800, margin: 0, color: "var(--text-primary)", letterSpacing: "-1px" },
  subtitle: { fontSize: 14, lineHeight: 1.5, color: "var(--text-muted)", marginTop: 8, marginBottom: 0, fontWeight: 500 },
  action: { flexShrink: 0 },
};
