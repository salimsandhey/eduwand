import { useState } from "react";
import { useAuth } from "../context/AuthContext";

// Matches backend/prisma/seed.ts. Dev-only - stripped from production builds by
// import.meta.env.DEV (false once built with `vite build`).
const DEV_ACCOUNTS = [
  { label: "Platform admin", email: "platform@eduwand.local" },
  { label: "Admin (Dev School)", email: "admin@dev.eduwand.local" },
  { label: "Admin (Dev School 2)", email: "admin2@dev.eduwand.local" },
  { label: "Leadership (trust-scoped)", email: "leadership@dev.eduwand.local" },
];
const DEV_PASSWORD = "password123";

export function LoginPage() {
  const { login, isLoading, error } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  return (
    <div style={styles.page}>
      <form
        style={styles.card}
        onSubmit={(e) => {
          e.preventDefault();
          login(email, password);
        }}
      >
        <h1 style={styles.title}>EduWand Admin</h1>
        <label style={styles.label}>Email</label>
        <input
          style={styles.input}
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="username"
        />
        <label style={styles.label}>Password</label>
        <input
          style={styles.input}
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
        />
        {error ? <p style={styles.error}>{error}</p> : null}
        <button type="submit" style={styles.button} disabled={isLoading}>
          {isLoading ? "Logging in…" : "Log in"}
        </button>

        {import.meta.env.DEV ? (
          <div style={styles.devSection}>
            <p style={styles.devLabel}>Dev quick-fill (fills the fields above, then press Log in)</p>
            <div style={styles.devButtonRow}>
              {DEV_ACCOUNTS.map((acct) => (
                <button
                  key={acct.email}
                  type="button"
                  style={styles.devButton}
                  onClick={() => {
                    setEmail(acct.email);
                    setPassword(DEV_PASSWORD);
                  }}
                >
                  {acct.label}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </form>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" },
  card: {
    background: "var(--bg-card)",
    border: "1px solid var(--border)",
    borderRadius: 12,
    padding: 32,
    width: 340,
  },
  title: { fontSize: 20, marginBottom: 24, textAlign: "center" },
  label: { display: "block", fontSize: 13, color: "var(--text-secondary)", marginBottom: 6, marginTop: 12 },
  input: {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    fontSize: 14,
  },
  error: { color: "var(--status-critical)", fontSize: 13, marginTop: 12, textAlign: "center" },
  button: {
    width: "100%",
    marginTop: 24,
    padding: "12px",
    borderRadius: 8,
    border: "none",
    background: "var(--accent)",
    color: "#fff",
    fontWeight: 600,
    cursor: "pointer",
  },
  devSection: { marginTop: 24, borderTop: "1px solid var(--border)", paddingTop: 16 },
  devLabel: { fontSize: 12, color: "var(--text-muted)", textAlign: "center", marginBottom: 10 },
  devButtonRow: { display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "center" },
  devButton: {
    border: "1px solid var(--accent)",
    color: "var(--accent-dark)",
    background: "var(--accent-wash)",
    borderRadius: 16,
    padding: "6px 12px",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
  },
};
