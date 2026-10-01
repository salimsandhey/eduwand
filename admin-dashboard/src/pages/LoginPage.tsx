import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useFormErrors } from "../hooks/useForm";
import { rules } from "../utils/validation";
import { FieldError, invalidInput } from "../components/FieldError";
import { hasWebsite, websiteUrl } from "../utils/website";

const HIGHLIGHTS = [
  { title: "Schools & trusts", body: "Manage every school, class and staff member from one place." },
  { title: "Admissions & enquiries", body: "Track leads from first enquiry to confirmed admission." },
  { title: "AI usage & billing", body: "Keep plans, credits and AI spend under control." },
];

const css = `
.login-page { min-height: 100vh; display: flex; background: #fff; }
.login-form-side { flex: 1 1 50%; display: flex; flex-direction: column; justify-content: center; align-items: center; padding: 40px 24px; }
.login-brand-side {
  flex: 1 1 50%; position: relative; overflow: hidden; color: #fff;
  display: flex; flex-direction: column; justify-content: center; padding: 64px;
  background: linear-gradient(145deg, #7c005a 0%, #5b0042 60%, #3d002d 100%);
}
.login-brand-side::before, .login-brand-side::after { content: ""; position: absolute; border-radius: 50%; pointer-events: none; }
.login-brand-side::before { width: 420px; height: 420px; top: -140px; right: -120px; background: radial-gradient(circle, rgba(251,170,10,0.35), transparent 70%); }
.login-brand-side::after { width: 380px; height: 380px; bottom: -160px; left: -120px; background: radial-gradient(circle, rgba(255,255,255,0.12), transparent 70%); }
.login-input:focus { border-color: var(--accent) !important; box-shadow: 0 0 0 3px var(--accent-wash) !important; }
.login-submit:hover:not(:disabled) { background: var(--accent-dark) !important; box-shadow: 0 8px 20px rgba(124,0,90,0.28); }
.login-submit:disabled { opacity: 0.7; cursor: default; }
.login-eye:hover { color: var(--accent) !important; transform: none; }
@media (max-width: 900px) { .login-brand-side { display: none; } }
`;

export function LoginPage() {
  const { login, isLoading, error } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Sign-in only needs the password to be present - existing accounts may
  // pre-date the current password rules.
  const v = useFormErrors({ email, password }, { email: rules.email(), password: rules.required("Password") });

  return (
    <div className="login-page">
      <style>{css}</style>

      <div className="login-form-side">
        <form
          style={styles.form}
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            if (v.submit()) login(email.trim(), password);
          }}
        >
          <img src="/eduwand-logo.png" alt="EduWand" style={styles.logo} />

          <h1 style={styles.title}>Welcome back</h1>
          <p style={styles.subtitle}>Sign in to the EduWand admin dashboard.</p>

          <label style={styles.label} htmlFor="login-email">Email address</label>
          <input
            id="login-email"
            className="login-input"
            style={{ ...styles.input, ...invalidInput(!!v.error("email")) }}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onBlur={() => v.blur("email")}
            autoComplete="username"
            maxLength={254}
            aria-invalid={!!v.error("email")}
            placeholder="you@school.com"
          />
          <FieldError message={v.error("email")} />

          <label style={styles.label} htmlFor="login-password">Password</label>
          <div style={{ position: "relative" }}>
            <input
              id="login-password"
              className="login-input"
              style={{ ...styles.input, paddingRight: 44, ...invalidInput(!!v.error("password")) }}
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onBlur={() => v.blur("password")}
              autoComplete="current-password"
              maxLength={128}
              aria-invalid={!!v.error("password")}
              placeholder="Enter your password"
            />
            <button
              type="button"
              className="login-eye"
              style={styles.eye}
              onClick={() => setShowPassword((s) => !s)}
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                {showPassword ? (
                  <>
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                    <path d="M1 1l22 22" />
                  </>
                ) : (
                  <>
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </>
                )}
              </svg>
            </button>
          </div>
          <FieldError message={v.error("password")} />

          {error ? <p style={styles.error} role="alert">{error}</p> : null}

          <button type="submit" className="login-submit" style={styles.button} disabled={isLoading}>
            {isLoading ? "Signing in…" : "Sign in"}
          </button>

          {hasWebsite ? (
            <p style={styles.footer}>
              <a href={websiteUrl("/privacy")} style={styles.footerLink}>Privacy Policy</a>
            </p>
          ) : null}
        </form>
      </div>

      <aside className="login-brand-side">
        <div style={{ position: "relative", zIndex: 1, maxWidth: 440 }}>
          <span style={styles.badge}>Admin Console</span>
          <h2 style={styles.brandTitle}>Run your schools with clarity.</h2>
          <p style={styles.brandLead}>
            Everything your team needs to manage schools, admissions and AI-powered teaching, in one dashboard.
          </p>
          <ul style={styles.list}>
            {HIGHLIGHTS.map((h) => (
              <li key={h.title} style={styles.listItem}>
                <span style={styles.check} aria-hidden>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                </span>
                <span>
                  <strong style={{ display: "block", fontSize: 15 }}>{h.title}</strong>
                  <span style={{ fontSize: 13, opacity: 0.8 }}>{h.body}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  form: { width: "100%", maxWidth: 380 },
  logo: { height: 44, width: "auto", display: "block", marginBottom: 40 },
  title: { fontSize: 28, fontWeight: 700, margin: 0, color: "var(--text-primary)", letterSpacing: "-0.5px" },
  subtitle: { margin: "8px 0 28px", fontSize: 14, color: "var(--text-muted)" },
  label: { display: "block", fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6, marginTop: 16 },
  input: {
    width: "100%",
    padding: "12px 14px",
    borderRadius: 10,
    border: "1px solid var(--border)",
    background: "#fff",
    fontSize: 14,
    outline: "none",
    transition: "border-color 0.2s, box-shadow 0.2s",
  },
  eye: {
    position: "absolute",
    right: 6,
    top: "50%",
    transform: "translateY(-50%)",
    width: 36,
    height: 36,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    border: "none",
    background: "transparent",
    color: "var(--text-muted)",
    cursor: "pointer",
    borderRadius: 8,
  },
  error: {
    color: "var(--status-critical)",
    background: "#fdeeee",
    border: "1px solid #f5c9c9",
    borderRadius: 8,
    padding: "10px 12px",
    fontSize: 13,
    marginTop: 16,
    fontWeight: 500,
  },
  button: {
    width: "100%",
    marginTop: 28,
    padding: "13px",
    borderRadius: 10,
    border: "none",
    background: "var(--accent)",
    color: "#fff",
    fontWeight: 600,
    cursor: "pointer",
    fontSize: 15,
  },
  footer: { textAlign: "center", marginTop: 28 },
  footerLink: { color: "var(--text-muted)", fontSize: 12, textDecoration: "none" },
  badge: {
    display: "inline-block",
    padding: "6px 14px",
    borderRadius: 999,
    background: "rgba(255,255,255,0.14)",
    border: "1px solid rgba(255,255,255,0.22)",
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: "0.04em",
    marginBottom: 24,
  },
  brandTitle: { fontSize: 38, lineHeight: 1.15, fontWeight: 700, margin: "0 0 16px", letterSpacing: "-1px" },
  brandLead: { fontSize: 15, lineHeight: 1.6, opacity: 0.85, margin: "0 0 36px" },
  list: { listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 20 },
  listItem: { display: "flex", gap: 14, alignItems: "flex-start" },
  check: {
    flexShrink: 0,
    width: 28,
    height: 28,
    borderRadius: "50%",
    background: "rgba(251,170,10,0.95)",
    color: "#3d002d",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
};
