import { useEffect, useState } from "react";
import { marked } from "marked";
import { api } from "../api/client";
import type { ContentPage } from "../api/client";
import { ContactCards } from "../components/ContactCards";

// Renders one of the platform's public pages (Privacy Policy, Terms of
// Service, About, Contact) straight from ContentPage in the database - the
// same source the mobile app's Legal screens read. Editing a clause is a
// platform_admin save in Content Pages, not a rebuild of this dashboard.
const NAV_LINKS: { key: string; label: string; path: string }[] = [
  { key: "privacy_policy", label: "Privacy Policy", path: "/privacy" },
  { key: "terms_of_service", label: "Terms of Service", path: "/terms" },
  { key: "about", label: "About", path: "/about" },
  { key: "contact", label: "Contact", path: "/contact" },
];

export function PublicContentPage({ contentKey }: { contentKey: string }) {
  const [page, setPage] = useState<ContentPage | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setPage(null);
    setError(null);
    api
      .getContentPage(contentKey)
      .then((result) => {
        if (!cancelled) setPage(result);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load this page");
      });
    return () => {
      cancelled = true;
    };
  }, [contentKey]);

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <div style={styles.headerContent}>
          <div style={styles.logoRow}>
            <div style={styles.logoBadge}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--accent)" }}>
                <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
                <path d="M6 12v5c0 2 2 3 6 3s6-1 6-3v-5" />
              </svg>
            </div>
            <div>
              <span style={styles.brandTitle}>EduWand</span>
              <span style={styles.brandSubtitle}>by LessonForge</span>
            </div>
          </div>
          <nav style={styles.headerNav}>
            {NAV_LINKS.map((link) => (
              <a key={link.key} href={link.path} style={{ ...styles.navLink, ...(link.key === contentKey ? styles.navLinkActive : {}) }}>
                {link.label}
              </a>
            ))}
            <a href="/login" style={styles.navLink}>
              Admin Portal &rarr;
            </a>
          </nav>
        </div>
      </header>

      <main style={styles.main}>
        {error ? (
          <div style={styles.contentCard}>
            <p style={{ color: "var(--status-critical)" }}>{error}</p>
          </div>
        ) : !page ? (
          <div style={styles.contentCard}>
            <p style={{ color: "var(--text-muted)" }}>Loading…</p>
          </div>
        ) : (
          <>
            <div style={styles.heroCard}>
              <h1 style={styles.title}>{page.title}</h1>
              <p style={styles.effectiveDate}>Last updated: {new Date(page.updatedAt).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}</p>
            </div>
            {contentKey === "contact" && page.fields ? (
              <>
                {page.bodyMarkdown.trim() ? <p style={styles.leadText}>{page.bodyMarkdown.trim()}</p> : null}
                <ContactCards fields={page.fields} />
              </>
            ) : (
              <div style={styles.contentCard}>
                {/* Content is authored by platform_admin, not arbitrary users - safe to render as HTML. */}
                <div className="markdown-body" style={styles.markdownBody} dangerouslySetInnerHTML={{ __html: marked.parse(page.bodyMarkdown, { async: false }) as string }} />
              </div>
            )}
          </>
        )}
      </main>

      <footer style={styles.footer}>
        <div style={styles.footerInner}>
          <p style={{ margin: 0, fontSize: 13, color: "var(--text-muted)" }}>&copy; {new Date().getFullYear()} EduWand &bull; LessonForge &bull; Fovea Infotech. All rights reserved.</p>
          <div style={{ display: "flex", gap: 16 }}>
            <a href="/login" style={styles.footerLink}>Admin Login</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { minHeight: "100vh", backgroundColor: "var(--bg-page)", color: "var(--text-primary)", fontFamily: "'Poppins', system-ui, -apple-system, sans-serif", display: "flex", flexDirection: "column" },
  header: { backgroundColor: "var(--bg-card)", borderBottom: "1px solid var(--border)", position: "sticky", top: 0, zIndex: 10, boxShadow: "0 2px 8px rgba(0,0,0,0.03)" },
  headerContent: { maxWidth: 860, margin: "0 auto", padding: "16px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 },
  logoRow: { display: "flex", alignItems: "center", gap: 12 },
  logoBadge: { width: 40, height: 40, borderRadius: 10, backgroundColor: "var(--accent-wash)", display: "flex", alignItems: "center", justifyContent: "center" },
  brandTitle: { fontSize: 18, fontWeight: 800, color: "var(--accent)", display: "block", lineHeight: 1.2 },
  brandSubtitle: { fontSize: 11, fontWeight: 600, color: "var(--text-muted)", display: "block", textTransform: "uppercase", letterSpacing: "0.5px" },
  headerNav: { display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" },
  navLink: { fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", textDecoration: "none" },
  navLinkActive: { color: "var(--accent)" },
  main: { maxWidth: 860, width: "100%", margin: "0 auto", padding: "36px 24px 64px 24px", flex: 1 },
  heroCard: { backgroundColor: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 16, padding: "32px", marginBottom: 24, boxShadow: "var(--shadow-card)" },
  title: { fontSize: 30, fontWeight: 800, color: "var(--text-primary)", margin: "0 0 8px 0", letterSpacing: "-0.5px" },
  effectiveDate: { fontSize: 13, color: "var(--text-muted)", margin: 0 },
  leadText: { fontSize: 15, lineHeight: 1.6, color: "var(--text-secondary)", margin: "0 0 24px 0" },
  contentCard: { backgroundColor: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 16, padding: "40px 36px", boxShadow: "var(--shadow-card)" },
  // marked's output is plain h2/p/ul/table/etc - styled with plain CSS
  // selectors here rather than per-tag inline styles, since the HTML comes
  // from markdown we don't control the exact node shape of.
  markdownBody: { fontSize: 14, lineHeight: 1.7, color: "var(--text-secondary)" },
  footer: { backgroundColor: "var(--bg-card)", borderTop: "1px solid var(--border)", padding: "24px", marginTop: "auto" },
  footerInner: { maxWidth: 860, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 16 },
  footerLink: { color: "var(--accent)", fontSize: 13, textDecoration: "none", fontWeight: 500 },
};
