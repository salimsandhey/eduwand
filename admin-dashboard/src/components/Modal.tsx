import { useEffect } from "react";
import type { ReactNode, CSSProperties } from "react";
import { createPortal } from "react-dom";

export function Modal({
  title,
  onClose,
  children,
  width = 640,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  width?: number;
}) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return createPortal(
    <div style={styles.backdrop} onClick={onClose}>
      <div
        style={{ ...styles.dialog, maxWidth: width }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div style={styles.header}>
          <h2 style={styles.title}>{title}</h2>
          <button style={styles.closeButton} onClick={onClose} aria-label="Close" type="button">
            ×
          </button>
        </div>
        <div style={styles.content}>{children}</div>
      </div>
    </div>,
    document.body
  );
}

/** Standard footer action row for modal forms - Cancel + primary submit button, pinned to the bottom. */
export function ModalFooter({ children }: { children: ReactNode }) {
  return <div style={styles.footer}>{children}</div>;
}

const styles: Record<string, CSSProperties> = {
  backdrop: {
    position: "fixed",
    inset: 0,
    background: "rgba(31, 31, 31, 0.5)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    zIndex: 1000,
  },
  dialog: {
    background: "var(--bg-card)",
    borderRadius: 20,
    boxShadow: "0 24px 64px rgba(0,0,0,0.28)",
    width: "100%",
    maxHeight: "min(720px, 90vh)",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "20px 24px",
    borderBottom: "1px solid var(--border)",
    flexShrink: 0,
  },
  title: {
    margin: 0,
    fontSize: 18,
    fontWeight: 800,
    color: "var(--text-primary)",
    letterSpacing: "-0.3px",
  },
  closeButton: {
    background: "var(--bg-page)",
    border: "1px solid var(--border)",
    borderRadius: 999,
    width: 32,
    height: 32,
    lineHeight: "28px",
    textAlign: "center",
    fontSize: 20,
    color: "var(--text-secondary)",
    cursor: "pointer",
    padding: 0,
    flexShrink: 0,
  },
  content: {
    padding: 24,
    overflowY: "auto",
  },
  footer: {
    display: "flex",
    justifyContent: "flex-end",
    gap: 10,
    padding: "16px 24px",
    borderTop: "1px solid var(--border)",
    flexShrink: 0,
  },
};
