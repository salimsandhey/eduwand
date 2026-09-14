import React from "react";

export function PrivacyPolicyPage() {
  const lastUpdated = "September 14, 2026";

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
          <a href="/login" style={styles.navLink}>Admin Portal &rarr;</a>
        </div>
      </header>

      <main style={styles.main}>
        <div style={styles.heroCard}>
          <span style={styles.badge}>Official Policy</span>
          <h1 style={styles.title}>Privacy Policy</h1>
          <p style={styles.effectiveDate}>Last updated: {lastUpdated} &bull; Applicable to EduWand Mobile App (<code>com.eduwand.app</code>) & Web Services</p>
          <p style={styles.leadText}>
            EduWand (&ldquo;we&rdquo;, &ldquo;us&rdquo;, or &ldquo;our&rdquo;), developed by Fovea Infotech for LessonForge, is committed to safeguarding the privacy and security of educational institutions, teachers, staff, counsellors, students, and parents. This Privacy Policy describes our practices concerning the collection, use, disclosure, and protection of personal and educational information.
          </p>
        </div>

        <div style={styles.quickNav}>
          <strong style={{ fontSize: 13, color: "var(--text-secondary)" }}>Table of Contents:</strong>
          <div style={styles.tocGrid}>
            <a href="#scope" style={styles.tocLink}>1. Scope &amp; User Roles</a>
            <a href="#collection" style={styles.tocLink}>2. Information We Collect</a>
            <a href="#permissions" style={styles.tocLink}>3. Device Permissions</a>
            <a href="#use" style={styles.tocLink}>4. How We Use Data</a>
            <a href="#ai" style={styles.tocLink}>5. AI Processing &amp; Privacy</a>
            <a href="#children" style={styles.tocLink}>6. Children &amp; Student Privacy</a>
            <a href="#sharing" style={styles.tocLink}>7. Sharing &amp; Third Parties</a>
            <a href="#retention" style={styles.tocLink}>8. Security &amp; Retention</a>
            <a href="#deletion" style={styles.tocLink}>9. Account &amp; Data Deletion</a>
            <a href="#contact" style={styles.tocLink}>10. Contact Information</a>
          </div>
        </div>

        <div style={styles.contentCard}>
          {/* Section 1 */}
          <section id="scope" style={styles.section}>
            <h2 style={styles.sectionTitle}>1. Scope and User Roles</h2>
            <p style={styles.paragraph}>
              EduWand is an enterprise educational platform featuring an <strong>Enrolment Growth Engine</strong> and an <strong>AI-Powered Classroom Module</strong>. Our application is utilized by:
            </p>
            <ul style={styles.list}>
              <li><strong>School Administrators &amp; Trust Leadership:</strong> Overseeing school performance, staff access, and admissions operations.</li>
              <li><strong>Front Desk &amp; Admissions Counsellors:</strong> Managing incoming student enquiries, parent communications, and admissions pipelines.</li>
              <li><strong>Teachers:</strong> Creating curriculum-aligned lesson plans, distributing assignments, reviewing homework, and logging student observations.</li>
              <li><strong>Students:</strong> Accessing learning materials, submitting assignments (online or via handwritten work photos), and viewing grades.</li>
              <li><strong>Parents / Guardians:</strong> Receiving automated progress updates and notifications regarding admissions and school activities.</li>
            </ul>
          </section>

          {/* Section 2 */}
          <section id="collection" style={styles.section}>
            <h2 style={styles.sectionTitle}>2. Information We Collect</h2>
            <p style={styles.paragraph}>
              We collect information to deliver high-quality, personalized, and administrative educational services:
            </p>
            <div style={styles.subCard}>
              <h3 style={styles.subTitle}>A. Information Provided Directly by Users or Schools</h3>
              <ul style={styles.list}>
                <li><strong>Account Credentials:</strong> Full name, institutional email address, phone number, encrypted passwords, and user role.</li>
                <li><strong>Admissions &amp; Enquiry Data:</strong> Prospective student name, guardian contact details, grade of interest, source of enquiry, meeting notes, and admissions stage.</li>
                <li><strong>Academic &amp; Classroom Content:</strong> Class sections, subjects, lesson plans, flashcards, assignments, question banks, answer keys, teacher feedback, and student submissions.</li>
              </ul>
            </div>

            <div style={styles.subCard}>
              <h3 style={styles.subTitle}>B. Information Collected Automatically</h3>
              <ul style={styles.list}>
                <li><strong>App Usage &amp; Logs:</strong> Timestamps of actions, error reports, and audit logs to prevent unauthorized access and maintain system uptime.</li>
                <li><strong>Device Information:</strong> Device model, operating system version, and general network state necessary for technical performance and debugging.</li>
              </ul>
            </div>
          </section>

          {/* Section 3 */}
          <section id="permissions" style={styles.section}>
            <h2 style={styles.sectionTitle}>3. Device Permissions (Android / iOS)</h2>
            <p style={styles.paragraph}>
              The EduWand mobile app (<code>com.eduwand.app</code>) requests specific device permissions strictly when required for specific educational features:
            </p>
            <div style={styles.tableWrapper}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Permission</th>
                    <th style={styles.th}>Feature / Purpose</th>
                    <th style={styles.th}>Data Handling</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style={styles.td}><strong>Camera</strong> (<code>android.permission.CAMERA</code>)</td>
                    <td style={styles.td}>Allows students to photograph paper assignments/worksheets for submission; allows staff to capture lead/student profile photos.</td>
                    <td style={styles.td}>Images are transmitted via encrypted HTTPS to secure cloud storage (Cloudinary) and accessed solely by authorized teachers and school staff.</td>
                  </tr>
                  <tr>
                    <td style={styles.td}><strong>Photo Library / Media</strong></td>
                    <td style={styles.td}>Allows selecting documents, certificates, or images from the device library to attach to an enquiry or assignment.</td>
                    <td style={styles.td}>Only user-selected files are uploaded. We never scan or access other media in your device library.</td>
                  </tr>
                  <tr>
                    <td style={styles.td}><strong>Microphone / Audio</strong> (<code>android.permission.RECORD_AUDIO</code>)</td>
                    <td style={styles.td}>Enables voice-assisted transcription or voice notes in classroom tools where explicitly activated by the user.</td>
                    <td style={styles.td}>Audio is processed only when the user taps a record action; no background listening or audio surveillance occurs.</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          {/* Section 4 */}
          <section id="use" style={styles.section}>
            <h2 style={styles.sectionTitle}>4. How We Use Your Information</h2>
            <ul style={styles.list}>
              <li><strong>Facilitating School Operations:</strong> Managing admissions workflows, enquiries, student admissions confirmations, and staff assignments.</li>
              <li><strong>Classroom Teaching &amp; Learning:</strong> Assisting teachers in generating lesson plans, tracking curriculum attainment against Bloom&rsquo;s taxonomy, and grading assignments.</li>
              <li><strong>Communications:</strong> Sending SMS, WhatsApp, or email updates to parents and students regarding admissions updates or academic notifications, in accordance with applicable messaging consent.</li>
              <li><strong>Security &amp; Audit:</strong> Verifying user authentication, enforcing role-based tenant isolation, and recording tamper-evident audit logs.</li>
            </ul>
          </section>

          {/* Section 5 */}
          <section id="ai" style={styles.section}>
            <h2 style={styles.sectionTitle}>5. AI Processing &amp; Privacy Safeguards</h2>
            <p style={styles.paragraph}>
              EduWand incorporates assistive artificial intelligence (via trusted AI providers including Google Gemini and Amazon Bedrock). We adhere to strict ethical and data privacy principles:
            </p>
            <ul style={styles.list}>
              <li><strong>No Commercial Profiling:</strong> We never use student data or learning metrics for commercial behavioral advertising, credit scoring, or public ranking.</li>
              <li><strong>Teacher Authority &amp; Fallback Design:</strong> AI suggestions (e.g. difficulty distribution, suggested grades, draft answer keys) require explicit teacher review and approval. Teacher edits are authoritative and override AI output everywhere.</li>
              <li><strong>No Model Training on Private Student Work:</strong> Data submitted to AI models for OCR transcription or assignment grading is processed via enterprise APIs and is not used to train public foundation models.</li>
            </ul>
          </section>

          {/* Section 6 */}
          <section id="children" style={styles.section}>
            <h2 style={styles.sectionTitle}>6. Children and Student Privacy (COPPA &amp; DPDP Act 2023)</h2>
            <p style={styles.paragraph}>
              Because EduWand is used in K-12 school environments:
            </p>
            <ul style={styles.list}>
              <li><strong>Institutional Authorization:</strong> Student accounts and data are provisioned either directly by the participating educational institution or through invitation codes issued by verified teachers.</li>
              <li><strong>Compliance with Indian DPDP Act 2023 (Section 9):</strong> We do not conduct behavioral monitoring of children or direct targeted advertisements to minors. Parental consent mechanisms are facilitated in coordination with school administration.</li>
              <li><strong>Parental Review:</strong> Parents and guardians have the right to review, correct, or request deletion of their child&rsquo;s personal information through their school or by contacting us.</li>
            </ul>
          </section>

          {/* Section 7 */}
          <section id="sharing" style={styles.section}>
            <h2 style={styles.sectionTitle}>7. Sharing &amp; Third-Party Service Providers</h2>
            <p style={styles.paragraph}>
              We do <strong>not</strong> sell, rent, or trade personal or educational data. We share information only with:
            </p>
            <ul style={styles.list}>
              <li><strong>Your School / Trust:</strong> Authorized staff members within the institution have role-restricted access to relevant student and operational data.</li>
              <li><strong>Cloud Infrastructure Providers:</strong> Highly secure enterprise service providers (AWS Mumbai region, Cloudinary media storage) operating under data protection agreements.</li>
              <li><strong>Communications Gateways:</strong> DLT-compliant SMS gateways and transactional email providers (e.g. AWS SES) strictly to deliver school-related messages.</li>
              <li><strong>Legal Compliance:</strong> When required by court order, statutory regulation, or applicable law to protect safety and security.</li>
            </ul>
          </section>

          {/* Section 8 */}
          <section id="retention" style={styles.section}>
            <h2 style={styles.sectionTitle}>8. Data Security and Retention</h2>
            <p style={styles.paragraph}>
              We employ industry-standard administrative, physical, and technological security controls:
            </p>
            <ul style={styles.list}>
              <li><strong>Data in Transit:</strong> 256-bit TLS/HTTPS encryption for all communication between mobile clients, web browsers, and backend servers.</li>
              <li><strong>Tenant Isolation:</strong> Logical separation ensuring one school cannot access or view another school&rsquo;s student or staff data.</li>
              <li><strong>Retention:</strong> Academic records are maintained for the duration of the school&rsquo;s active subscription or as mandated by statutory educational retention regulations.</li>
            </ul>
          </section>

          {/* Section 9 - MANDATORY GOOGLE PLAY REQUIREMENT */}
          <section id="deletion" style={styles.section}>
            <div style={styles.deletionCard}>
              <div style={styles.deletionHeader}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--accent)" }}>
                  <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  <line x1="10" y1="11" x2="10" y2="17" />
                  <line x1="14" y1="11" x2="14" y2="17" />
                </svg>
                <h2 style={{ ...styles.sectionTitle, margin: 0, color: "var(--accent-dark)" }}>9. Account and Data Deletion Policy</h2>
              </div>
              <p style={styles.paragraph}>
                In compliance with Google Play Developer Policies and data protection regulations, users have the right to request deletion of their account and associated personal data.
              </p>
              
              <h3 style={{ ...styles.subTitle, marginTop: 16 }}>How to Request Account &amp; Data Deletion:</h3>
              <ol style={{ ...styles.list, paddingLeft: 22 }}>
                <li>
                  <strong>Direct In-App Deletion:</strong> Teachers, staff, and students can navigate to <strong>More &gt; Profile &gt; Delete Account</strong> in the EduWand mobile application to initiate deletion.
                </li>
                <li>
                  <strong>Web / Email Request:</strong> You may submit an account deletion request at any time by emailing our Data Protection Officer at:
                  <div style={{ margin: "8px 0" }}>
                    <a href="mailto:privacy@eduwand.com?subject=Account%20and%20Data%20Deletion%20Request" style={styles.emailBadge}>
                      privacy@eduwand.com
                    </a>
                  </div>
                  Please provide your registered full name, phone number, school name, and registered email address.
                </li>
              </ol>

              <h3 style={{ ...styles.subTitle, marginTop: 16 }}>Data Handling Upon Deletion:</h3>
              <ul style={styles.list}>
                <li><strong>Immediate Revocation:</strong> Your login credentials, session tokens, and active permissions are invalidated immediately.</li>
                <li><strong>Personal Data Purge:</strong> Within 30 days of verified request, personal identifiers (name, phone, personal email, profile photo, and device tokens) are permanently removed or anonymized from active databases.</li>
                <li><strong>School Institutional Records:</strong> If you are a student or teacher attached to an active school, your historical academic grades and exam records may be retained in anonymized format or as required by the school&rsquo;s statutory educational record-keeping laws.</li>
              </ul>
            </div>
          </section>

          {/* Section 10 */}
          <section id="contact" style={styles.section}>
            <h2 style={styles.sectionTitle}>10. Contact Information</h2>
            <p style={styles.paragraph}>
              If you have any questions, concerns, or requests regarding this Privacy Policy or our data handling practices, please contact:
            </p>
            <div style={styles.contactBox}>
              <p style={{ margin: "0 0 6px 0", fontWeight: 700, color: "var(--text-primary)" }}>EduWand Privacy &amp; Data Governance</p>
              <p style={{ margin: "0 0 4px 0", color: "var(--text-secondary)" }}>LessonForge &bull; Fovea Infotech</p>
              <p style={{ margin: "0 0 4px 0", color: "var(--text-secondary)" }}>
                Email: <a href="mailto:privacy@eduwand.com" style={{ color: "var(--accent)", fontWeight: 600 }}>privacy@eduwand.com</a>
              </p>
              <p style={{ margin: "0 0 4px 0", color: "var(--text-secondary)" }}>
                Support: <a href="mailto:support@eduwand.com" style={{ color: "var(--accent)", fontWeight: 600 }}>support@eduwand.com</a>
              </p>
              <p style={{ margin: 0, color: "var(--text-muted)", fontSize: 13 }}>
                India Office: Mumbai, Maharashtra, India
              </p>
            </div>
          </section>
        </div>
      </main>

      <footer style={styles.footer}>
        <div style={styles.footerInner}>
          <p style={{ margin: 0, fontSize: 13, color: "var(--text-muted)" }}>
            &copy; {new Date().getFullYear()} EduWand &bull; LessonForge &bull; Fovea Infotech. All rights reserved.
          </p>
          <div style={{ display: "flex", gap: 16 }}>
            <a href="#scope" style={styles.footerLink}>Back to top &uarr;</a>
            <a href="/login" style={styles.footerLink}>Admin Login</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    backgroundColor: "var(--bg-page)",
    color: "var(--text-primary)",
    fontFamily: "'Poppins', system-ui, -apple-system, sans-serif",
    display: "flex",
    flexDirection: "column",
  },
  header: {
    backgroundColor: "var(--bg-card)",
    borderBottom: "1px solid var(--border)",
    position: "sticky",
    top: 0,
    zIndex: 10,
    boxShadow: "0 2px 8px rgba(0,0,0,0.03)",
  },
  headerContent: {
    maxWidth: 960,
    margin: "0 auto",
    padding: "16px 24px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  logoRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
  },
  logoBadge: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: "var(--accent-wash)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  brandTitle: {
    fontSize: 18,
    fontWeight: 800,
    color: "var(--accent)",
    display: "block",
    lineHeight: 1.2,
  },
  brandSubtitle: {
    fontSize: 11,
    fontWeight: 600,
    color: "var(--text-muted)",
    display: "block",
    textTransform: "uppercase",
    letterSpacing: "0.5px",
  },
  navLink: {
    fontSize: 13,
    fontWeight: 600,
    color: "var(--accent)",
    textDecoration: "none",
  },
  main: {
    maxWidth: 960,
    width: "100%",
    margin: "0 auto",
    padding: "36px 24px 64px 24px",
    flex: 1,
  },
  heroCard: {
    backgroundColor: "var(--bg-card)",
    border: "1px solid var(--border)",
    borderRadius: 16,
    padding: "36px 32px",
    marginBottom: 24,
    boxShadow: "var(--shadow-card)",
  },
  badge: {
    display: "inline-block",
    backgroundColor: "var(--accent-wash)",
    color: "var(--accent)",
    fontWeight: 700,
    fontSize: 11,
    padding: "4px 10px",
    borderRadius: 999,
    textTransform: "uppercase",
    letterSpacing: "0.5px",
    marginBottom: 12,
  },
  title: {
    fontSize: 32,
    fontWeight: 800,
    color: "var(--text-primary)",
    margin: "0 0 8px 0",
    letterSpacing: "-0.5px",
  },
  effectiveDate: {
    fontSize: 13,
    color: "var(--text-muted)",
    margin: "0 0 16px 0",
  },
  leadText: {
    fontSize: 15,
    lineHeight: 1.6,
    color: "var(--text-secondary)",
    margin: 0,
  },
  quickNav: {
    backgroundColor: "var(--bg-card)",
    border: "1px solid var(--border)",
    borderRadius: 12,
    padding: "20px 24px",
    marginBottom: 28,
  },
  tocGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
    gap: "10px 16px",
    marginTop: 12,
  },
  tocLink: {
    fontSize: 13,
    color: "var(--accent)",
    textDecoration: "none",
    fontWeight: 500,
  },
  contentCard: {
    backgroundColor: "var(--bg-card)",
    border: "1px solid var(--border)",
    borderRadius: 16,
    padding: "40px 36px",
    boxShadow: "var(--shadow-card)",
  },
  section: {
    marginBottom: 40,
    scrollMarginTop: 80,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 700,
    color: "var(--text-primary)",
    margin: "0 0 16px 0",
    borderBottom: "1px solid var(--border)",
    paddingBottom: 8,
  },
  subCard: {
    backgroundColor: "#FAF9F5",
    border: "1px solid var(--border)",
    borderRadius: 10,
    padding: "16px 20px",
    marginBottom: 16,
  },
  subTitle: {
    fontSize: 15,
    fontWeight: 700,
    color: "var(--text-primary)",
    margin: "0 0 10px 0",
  },
  paragraph: {
    fontSize: 14,
    lineHeight: 1.7,
    color: "var(--text-secondary)",
    margin: "0 0 14px 0",
  },
  list: {
    margin: "0 0 14px 0",
    paddingLeft: 20,
    fontSize: 14,
    lineHeight: 1.7,
    color: "var(--text-secondary)",
  },
  tableWrapper: {
    overflowX: "auto",
    marginTop: 14,
    marginBottom: 14,
    borderRadius: 8,
    border: "1px solid var(--border)",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: 13,
    textAlign: "left",
  },
  th: {
    backgroundColor: "var(--accent-wash)",
    color: "var(--accent-dark)",
    fontWeight: 700,
    padding: "12px 14px",
    borderBottom: "1px solid var(--border)",
  },
  td: {
    padding: "12px 14px",
    borderBottom: "1px solid var(--border)",
    color: "var(--text-secondary)",
    verticalAlign: "top",
    lineHeight: 1.5,
  },
  deletionCard: {
    backgroundColor: "#FDF4FA",
    border: "1px solid rgba(124, 0, 90, 0.2)",
    borderRadius: 12,
    padding: "24px 28px",
  },
  deletionHeader: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    marginBottom: 12,
  },
  emailBadge: {
    display: "inline-block",
    backgroundColor: "var(--accent)",
    color: "#fff",
    padding: "6px 14px",
    borderRadius: 6,
    textDecoration: "none",
    fontWeight: 600,
    fontSize: 13,
  },
  contactBox: {
    backgroundColor: "#FAF9F5",
    border: "1px solid var(--border)",
    borderRadius: 10,
    padding: "18px 22px",
    marginTop: 12,
  },
  footer: {
    backgroundColor: "var(--bg-card)",
    borderTop: "1px solid var(--border)",
    padding: "24px",
    marginTop: "auto",
  },
  footerInner: {
    maxWidth: 960,
    margin: "0 auto",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 16,
  },
  footerLink: {
    color: "var(--accent)",
    fontSize: 13,
    textDecoration: "none",
    fontWeight: 500,
  },
};
