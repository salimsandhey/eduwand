// Branded HTML + plain-text layout shared by every EduWand email. Templates
// (templates.ts) describe *what* to say; this decides how it looks. Inline
// styles and table layout only - that is what mail clients reliably render.

export const BRAND = {
  name: "EduWand",
  accent: "#7C005A",
  accentSoft: "#F7E6F2",
  highlight: "#FBAA0A",
  text: "#221B20",
  muted: "#6F6570",
  border: "#E8E2D9",
  background: "#F7F5F1",
} as const;

export interface EmailDetail {
  label: string;
  value: string;
}

export interface EmailContent {
  // Inbox preview line (hidden in the body).
  preheader?: string;
  heading: string;
  // First name / display name - the greeting reads "Hi <name>,".
  recipientName?: string;
  paragraphs: string[];
  // A 6-digit code shown large and copyable.
  code?: string;
  // Label/value rows, e.g. class, teacher, score.
  details?: EmailDetail[];
  cta?: { label: string; url: string };
  // Small muted text under the main content.
  note?: string;
  // Shown in the header and footer so the mail reads as coming from the
  // recipient's own school/teacher, not just the platform.
  senderContext?: string;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function greeting(name: string | undefined): string {
  const first = name?.trim().split(/\s+/)[0];
  return first ? `Hi ${first},` : "Hello,";
}

export function renderEmail(subject: string, content: EmailContent): RenderedEmail {
  const { heading, paragraphs, code, details, cta, note, preheader, senderContext } = content;
  const hello = greeting(content.recipientName);

  const paragraphHtml = paragraphs
    .map((p) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:${BRAND.text};">${escapeHtml(p)}</p>`)
    .join("");

  const codeHtml = code
    ? `<div style="margin:22px 0;text-align:center;">
        <div style="display:inline-block;padding:14px 26px;background:${BRAND.accentSoft};border:1px solid ${BRAND.border};border-radius:12px;font-size:32px;font-weight:700;letter-spacing:8px;color:${BRAND.accent};font-family:'Courier New',monospace;">${escapeHtml(code)}</div>
      </div>`
    : "";

  const detailsHtml = details?.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0;border:1px solid ${BRAND.border};border-radius:12px;border-collapse:separate;overflow:hidden;">
        ${details
          .map(
            (d, i) => `<tr>
              <td style="padding:11px 16px;font-size:13px;color:${BRAND.muted};${i > 0 ? `border-top:1px solid ${BRAND.border};` : ""}width:38%;">${escapeHtml(d.label)}</td>
              <td style="padding:11px 16px;font-size:14px;font-weight:600;color:${BRAND.text};${i > 0 ? `border-top:1px solid ${BRAND.border};` : ""}">${escapeHtml(d.value)}</td>
            </tr>`
          )
          .join("")}
      </table>`
    : "";

  const ctaHtml = cta
    ? `<div style="margin:24px 0 8px;text-align:center;">
        <a href="${escapeHtml(cta.url)}" style="display:inline-block;padding:13px 28px;background:${BRAND.accent};color:#FFFFFF;text-decoration:none;font-size:15px;font-weight:700;border-radius:10px;">${escapeHtml(cta.label)}</a>
      </div>`
    : "";

  const noteHtml = note
    ? `<p style="margin:20px 0 0;font-size:12.5px;line-height:1.55;color:${BRAND.muted};">${escapeHtml(note)}</p>`
    : "";

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:${BRAND.background};">
<span style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(preheader ?? heading)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.background};padding:28px 12px;">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
      <tr><td style="padding:0 4px 14px;">
        <span style="font-size:22px;font-weight:800;letter-spacing:-0.4px;color:${BRAND.accent};">Edu<span style="color:${BRAND.highlight};">Wand</span></span>
        ${senderContext ? `<span style="font-size:12.5px;color:${BRAND.muted};"> &nbsp;·&nbsp; ${escapeHtml(senderContext)}</span>` : ""}
      </td></tr>
      <tr><td style="background:#FFFFFF;border:1px solid ${BRAND.border};border-radius:16px;padding:30px 28px;">
        <div style="height:4px;width:44px;background:${BRAND.highlight};border-radius:2px;margin:0 0 18px;"></div>
        <h1 style="margin:0 0 16px;font-size:21px;line-height:1.3;color:${BRAND.text};">${escapeHtml(heading)}</h1>
        <p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:${BRAND.text};">${escapeHtml(hello)}</p>
        ${paragraphHtml}
        ${codeHtml}
        ${detailsHtml}
        ${ctaHtml}
        ${noteHtml}
      </td></tr>
      <tr><td style="padding:18px 8px 0;text-align:center;font-size:12px;line-height:1.6;color:${BRAND.muted};">
        ${senderContext ? `Sent on behalf of ${escapeHtml(senderContext)} through ${BRAND.name}.<br>` : ""}
        You're receiving this because of activity on your ${BRAND.name} account. If this wasn't you, you can ignore this email.<br>
        &copy; ${new Date().getFullYear()} ${BRAND.name}
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;

  const textParts: string[] = [heading, "", hello, "", ...paragraphs.flatMap((p) => [p, ""])];
  if (code) textParts.push(`Your code: ${code}`, "");
  if (details?.length) textParts.push(...details.map((d) => `${d.label}: ${d.value}`), "");
  if (cta) textParts.push(`${cta.label}: ${cta.url}`, "");
  if (note) textParts.push(note, "");
  textParts.push("--", senderContext ? `${BRAND.name} · ${senderContext}` : BRAND.name);

  return { subject, html, text: textParts.join("\n") };
}
