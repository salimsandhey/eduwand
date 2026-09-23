import type { ReactNode } from "react";

// Renders ContentPage.fields (key "contact") as tappable icon cards - the
// same structured data the mobile app's ContactScreen reads, just laid out
// for a browser. Order and labels intentionally mirror ContactScreen.tsx.
interface Row {
  key: string;
  icon: ReactNode;
  label: string;
  value: string;
  href?: string;
}

function MailIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
    </svg>
  );
}
function PhoneIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.362 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.338 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  );
}
function ChatIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  );
}
function PinIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}
function ClockIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </svg>
  );
}

function buildRows(fields: Record<string, string>): Row[] {
  const rows: Row[] = [];
  if (fields.email) rows.push({ key: "email", icon: <MailIcon />, label: "Email", value: fields.email, href: `mailto:${fields.email}` });
  if (fields.phone) rows.push({ key: "phone", icon: <PhoneIcon />, label: "Call", value: fields.phone, href: `tel:${fields.phone.replace(/\s/g, "")}` });
  if (fields.whatsapp)
    rows.push({ key: "whatsapp", icon: <ChatIcon />, label: "WhatsApp", value: fields.whatsapp, href: `https://wa.me/${fields.whatsapp.replace(/[^0-9]/g, "")}` });
  if (fields.address) rows.push({ key: "address", icon: <PinIcon />, label: "Office", value: fields.address });
  if (fields.hours) rows.push({ key: "hours", icon: <ClockIcon />, label: "Hours", value: fields.hours });
  return rows;
}

export function ContactCards({ fields }: { fields: Record<string, string> }) {
  const rows = buildRows(fields);
  if (!rows.length) return <p style={{ color: "var(--text-muted)" }}>No contact details yet.</p>;

  return (
    <div style={styles.grid}>
      {rows.map((row) => {
        const inner = (
          <>
            <div style={styles.icon}>{row.icon}</div>
            <div>
              <div style={styles.label}>{row.label}</div>
              <div style={styles.value}>{row.value}</div>
            </div>
          </>
        );
        return row.href ? (
          <a key={row.key} href={row.href} style={{ ...styles.card, ...styles.cardLink }}>
            {inner}
          </a>
        ) : (
          <div key={row.key} style={styles.card}>
            {inner}
          </div>
        );
      })}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 },
  card: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    backgroundColor: "var(--bg-card)",
    border: "1px solid var(--border)",
    borderRadius: 16,
    padding: "18px 20px",
    boxShadow: "var(--shadow-card)",
  },
  cardLink: { textDecoration: "none", color: "inherit", cursor: "pointer" },
  icon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: "var(--accent-wash)",
    color: "var(--accent)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  label: { fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.4px", color: "var(--text-muted)" },
  value: { marginTop: 2, fontSize: 14.5, fontWeight: 700, color: "var(--text-primary)" },
};
