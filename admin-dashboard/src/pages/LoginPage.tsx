import { useState } from "react";
import { useAuth } from "../context/AuthContext";

export function LoginPage() {
  const { login, isLoading, error } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [emailFocused, setEmailFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);

  return (
    <div style={styles.page}>
      <form
        style={{ ...styles.card, boxShadow: "0 10px 30px rgba(0,0,0,0.03)" }}
        onSubmit={(e) => {
          e.preventDefault();
          login(email, password);
        }}
      >
        <div style={styles.logoBlock}>
          <div style={styles.logoOuter}>
            <div style={styles.logoInner}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--accent)" }}>
                <path d="M22 10v6M2 10l10-5 10 5-10 5z"/>
                <path d="M6 12v5c0 2 2 3 6 3s6-1 6-3v-5"/>
              </svg>
            </div>
          </div>
          <h1 style={styles.title}>EduWand Admin</h1>
        </div>

        <label style={styles.label}>Email Address</label>
        <input
          style={{
            ...styles.input,
            borderColor: emailFocused ? "var(--accent)" : "var(--border)",
            boxShadow: emailFocused ? "0 0 0 3px var(--accent-wash)" : "none",
          }}
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onFocus={() => setEmailFocused(true)}
          onBlur={() => setEmailFocused(false)}
          autoComplete="username"
          placeholder="Enter your email"
        />

        <label style={styles.label}>Password</label>
        <input
          style={{
            ...styles.input,
            borderColor: passwordFocused ? "var(--accent)" : "var(--border)",
            boxShadow: passwordFocused ? "0 0 0 3px var(--accent-wash)" : "none",
          }}
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onFocus={() => setPasswordFocused(true)}
          onBlur={() => setPasswordFocused(false)}
          autoComplete="current-password"
          placeholder="Enter password"
        />

        {error ? <p style={styles.error}>{error}</p> : null}

        <button type="submit" style={styles.button} disabled={isLoading}>
          {isLoading ? "Logging in…" : "Log in"}
        </button>
      </form>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "radial-gradient(circle at 50% 50%, #FAF8F1 0%, var(--bg-page) 100%)",
  },
  card: {
    background: "var(--bg-card)",
    border: "1px solid var(--border)",
    borderRadius: 16,
    padding: "36px 32px",
    width: 360,
  },
  logoBlock: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    marginBottom: 28,
  },
  logoOuter: {
    padding: 6,
    borderRadius: "50%",
    border: "1px solid var(--border)",
    marginBottom: 12,
  },
  logoInner: {
    width: 48,
    height: 48,
    borderRadius: "50%",
    backgroundColor: "var(--accent-wash)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontSize: 22, fontWeight: 800, margin: 0, color: "var(--text-primary)", letterSpacing: "-0.5px" },
  label: { display: "block", fontSize: 12, fontWeight: 700, color: "var(--text-secondary)", marginBottom: 6, marginTop: 14 },
  input: {
    width: "100%",
    padding: "10px 14px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    fontSize: 14,
    outline: "none",
    transition: "all 0.2s ease-in-out",
  },
  error: { color: "var(--status-critical)", fontSize: 13, marginTop: 12, textAlign: "center", fontWeight: 600 },
  button: {
    width: "100%",
    marginTop: 24,
    padding: "12px",
    borderRadius: 8,
    border: "none",
    background: "var(--accent)",
    color: "#fff",
    fontWeight: 700,
    cursor: "pointer",
    fontSize: 14,
    transition: "opacity 0.2s",
  },
};
