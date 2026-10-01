import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { createPortal } from "react-dom";

export interface RowAction {
  label: string;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
}

const MENU_WIDTH = 190;

// A "⋯" button that opens a small menu of actions for a table row, so a row
// carries one control instead of a wrapped cluster of buttons. The menu is
// fixed-positioned from the trigger so a scrolling table/card can't clip it.
export function RowActions({
  actions,
  label = "Row actions",
  disabled = false,
}: {
  actions: RowAction[];
  label?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const menuHeight = menuRef.current?.offsetHeight ?? actions.length * 40 + 12;
    const fitsBelow = rect.bottom + 6 + menuHeight <= window.innerHeight;
    setPos({
      top: fitsBelow ? rect.bottom + 6 : Math.max(8, rect.top - 6 - menuHeight),
      left: Math.min(Math.max(8, rect.right - MENU_WIDTH), window.innerWidth - MENU_WIDTH - 8),
    });
  }, [open, actions.length]);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (menuRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      close();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        close();
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        style={styles.trigger}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        title={label}
      >
        <svg width={18} height={18} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <circle cx="12" cy="5" r="1.8" />
          <circle cx="12" cy="12" r="1.8" />
          <circle cx="12" cy="19" r="1.8" />
        </svg>
      </button>
      {open
        ? createPortal(
            <div ref={menuRef} role="menu" style={{ ...styles.menu, top: pos?.top ?? -9999, left: pos?.left ?? -9999 }}>
              {actions.map((action) => (
                <button
                  key={action.label}
                  type="button"
                  role="menuitem"
                  className="ui-menu-item"
                  style={{ ...styles.item, color: action.danger ? "var(--status-critical)" : "var(--text-primary)" }}
                  disabled={action.disabled}
                  onClick={() => {
                    setOpen(false);
                    action.onClick();
                  }}
                >
                  {action.label}
                </button>
              ))}
            </div>,
            document.body
          )
        : null}
    </>
  );
}

const styles: Record<string, CSSProperties> = {
  trigger: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 34,
    height: 34,
    padding: 0,
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "#fff",
    color: "var(--text-secondary)",
    cursor: "pointer",
  },
  menu: {
    position: "fixed",
    width: MENU_WIDTH,
    padding: 6,
    background: "#fff",
    border: "1px solid var(--border)",
    borderRadius: 12,
    boxShadow: "0 12px 32px rgba(0,0,0,0.16)",
    zIndex: 1100,
  },
  item: {
    display: "block",
    width: "100%",
    padding: "9px 12px",
    border: "none",
    borderRadius: 8,
    background: "transparent",
    textAlign: "left",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
  },
};
