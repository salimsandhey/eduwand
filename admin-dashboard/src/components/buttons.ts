import type { CSSProperties } from "react";

// One set of button looks for the whole dashboard. Pages put these into their
// local `styles` object (e.g. `button: btn.primary`) so every button has the
// same height, radius and weight. Hover, focus ring and disabled state come
// from the global `button` rules in theme.css.

const base: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  boxSizing: "border-box",
  height: 40,
  padding: "0 16px",
  borderRadius: 10,
  border: "1px solid transparent",
  fontSize: 14,
  fontWeight: 600,
  lineHeight: 1,
  whiteSpace: "nowrap",
  cursor: "pointer",
};

const small: CSSProperties = { ...base, height: 32, padding: "0 12px", borderRadius: 8, fontSize: 13 };

export const btn = {
  primary: { ...base, background: "var(--accent)", borderColor: "var(--accent)", color: "#fff" } as CSSProperties,
  secondary: { ...base, background: "#fff", borderColor: "var(--border)", color: "var(--text-primary)" } as CSSProperties,
  danger: { ...base, background: "var(--status-critical)", borderColor: "var(--status-critical)", color: "#fff" } as CSSProperties,
  small: { ...small, background: "#fff", borderColor: "var(--border)", color: "var(--text-primary)" } as CSSProperties,
  smallDanger: { ...small, background: "#fff", borderColor: "#f0c8c8", color: "var(--status-critical)" } as CSSProperties,
  link: {
    ...base,
    height: "auto",
    padding: "2px 4px",
    borderRadius: 6,
    background: "transparent",
    color: "var(--accent)",
    fontSize: 13,
  } as CSSProperties,
};
