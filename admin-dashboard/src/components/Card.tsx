import type { ReactNode, CSSProperties } from "react";

export function Card({ title, children, style }: { title?: string; children: ReactNode; style?: CSSProperties }) {
  return (
    <div style={{ ...cardStyle, ...style }}>
      {title ? <h3 style={titleStyle}>{title}</h3> : null}
      {children}
    </div>
  );
}

const cardStyle: CSSProperties = {
  background: "var(--bg-card)",
  border: "1px solid var(--border)",
  borderRadius: 12,
  padding: 20,
  marginBottom: 16,
};

const titleStyle: CSSProperties = {
  margin: "0 0 16px 0",
  fontSize: 15,
  fontWeight: 700,
  color: "var(--text-primary)",
};
