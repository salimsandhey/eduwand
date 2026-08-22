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
  borderRadius: 18,
  padding: 24,
  marginBottom: 18,
  boxShadow: "var(--shadow-card)",
};

const titleStyle: CSSProperties = {
  margin: "0 0 18px 0",
  fontSize: 16,
  fontWeight: 800,
  color: "var(--text-primary)",
  letterSpacing: "-0.2px",
};
