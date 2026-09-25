// Branded HTML + plain-text layout shared by every EduWand email. Templates
// (templates.ts) describe *what* to say; this decides how it looks. Inline
// styles and table layout only - that is what mail clients reliably render.
//
// The look follows the product theme (admin-dashboard/src/theme.css and the
// app's design tokens): deep plum accent, warm ivory background, white cards,
// amber highlight, Poppins where the client allows web fonts. The header is a
// plum band with the white EduWand logo.

export const BRAND = {
  name: "EduWand",
  accent: "#7C005A",
  accentDark: "#5B0042",
  accentSoft: "#F7E6F2",
  highlight: "#FBAA0A",
  text: "#1F1F1F",
  textSecondary: "#3A3437",
  muted: "#756C72",
  border: "#E4DED0",
  background: "#F4F1E8",
  card: "#FFFFFF",
  ivory: "#FAF8F2",
  good: "#0CA30C",
  warning: "#FAB219",
  critical: "#D03B3B",
} as const;

// What kind of message it is: colours the small accent bar over the heading, so
// good news, a heads-up and a problem are told apart before a word is read.
export type EmailTone = "default" | "success" | "warning" | "alert";

const TONE_COLORS: Record<EmailTone, string> = {
  default: BRAND.highlight,
  success: BRAND.good,
  warning: BRAND.warning,
  alert: BRAND.critical,
};

const FONT_STACK = "'Poppins',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

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
  tone?: EmailTone;
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

// Where the hosted email images and the public pages live. Mail clients can only
// show an image from a public https address, so without one the header falls
// back to a plain-text wordmark on the same plum band. Set PUBLIC_WEB_URL to the
// website (e.g. https://eduwand.flipoo.in); EMAIL_ASSET_URL overrides just the
// images. The BILLING_URL / APP_URL origin is used if neither is set.
export function publicWebUrl(): string | null {
  const explicit = process.env.PUBLIC_WEB_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  for (const candidate of [process.env.BILLING_URL, process.env.APP_URL]) {
    try {
      if (candidate) return new URL(candidate).origin;
    } catch {
      // Not a usable URL - try the next one.
    }
  }
  return null;
}

function emailImageUrl(file: string): string | null {
  const base = process.env.EMAIL_ASSET_URL?.trim().replace(/\/+$/, "") ?? (publicWebUrl() ? `${publicWebUrl()}/email` : null);
  return base ? `${base}/${file}` : null;
}

function headerHtml(senderContext: string | undefined): string {
  const logo = emailImageUrl("logo-white.png");
  const mark = logo
    ? `<img src="${escapeHtml(logo)}" width="172" height="38" alt="${BRAND.name}" style="display:block;border:0;outline:none;text-decoration:none;width:172px;height:38px;">`
    : `<span style="font-size:24px;font-weight:800;letter-spacing:-0.5px;color:#FFFFFF;">Edu<span style="color:${BRAND.highlight};">Wand</span></span>`;

  return `<tr><td bgcolor="${BRAND.accent}" style="background:${BRAND.accent};border-radius:18px 18px 0 0;padding:22px 30px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
          <td align="left" style="vertical-align:middle;">${mark}</td>
          ${
            senderContext
              ? `<td align="right" style="vertical-align:middle;font-size:12.5px;line-height:1.4;color:#F3D6EA;">${escapeHtml(senderContext)}</td>`
              : ""
          }
        </tr></table>
      </td></tr>
      <tr><td bgcolor="${BRAND.highlight}" height="4" style="background:${BRAND.highlight};height:4px;line-height:4px;font-size:0;">&nbsp;</td></tr>`;
}

function footerHtml(senderContext: string | undefined): string {
  const icon = emailImageUrl("icon.png");
  const web = publicWebUrl();
  const links = web
    ? `<a href="${escapeHtml(web)}/privacy" style="color:${BRAND.muted};text-decoration:underline;">Privacy</a> &nbsp;&middot;&nbsp; <a href="${escapeHtml(web)}/terms" style="color:${BRAND.muted};text-decoration:underline;">Terms</a> &nbsp;&middot;&nbsp; <a href="${escapeHtml(web)}/contact" style="color:${BRAND.muted};text-decoration:underline;">Contact</a><br>`
    : "";

  return `<tr><td align="center" style="padding:26px 12px 6px;font-size:12px;line-height:1.7;color:${BRAND.muted};">
        ${icon ? `<img src="${escapeHtml(icon)}" width="28" height="28" alt="" style="display:inline-block;border:0;width:28px;height:28px;margin:0 0 8px;"><br>` : ""}
        ${senderContext ? `Sent on behalf of ${escapeHtml(senderContext)} through ${BRAND.name}.<br>` : ""}
        You're receiving this because of activity on your ${BRAND.name} account. If this wasn't you, you can ignore this email.<br>
        ${links}
        &copy; ${new Date().getFullYear()} ${BRAND.name}
      </td></tr>`;
}

export function renderEmail(subject: string, content: EmailContent): RenderedEmail {
  const { heading, paragraphs, code, details, cta, note, preheader, senderContext, tone = "default" } = content;
  const hello = greeting(content.recipientName);
  const toneColor = TONE_COLORS[tone];

  const paragraphHtml = paragraphs
    .map((p) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.65;color:${BRAND.textSecondary};">${escapeHtml(p)}</p>`)
    .join("");

  const codeHtml = code
    ? `<div style="margin:24px 0;text-align:center;">
        <div style="display:inline-block;padding:16px 28px;background:${BRAND.accentSoft};border:1px solid #EBCFE2;border-radius:14px;font-size:34px;font-weight:700;letter-spacing:9px;color:${BRAND.accent};font-family:'Courier New',monospace;">${escapeHtml(code)}</div>
      </div>`
    : "";

  const detailsHtml = details?.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;border:1px solid ${BRAND.border};border-radius:14px;border-collapse:separate;overflow:hidden;background:${BRAND.ivory};">
        ${details
          .map(
            (d, i) => `<tr>
              <td style="padding:12px 18px;font-size:13px;color:${BRAND.muted};${i > 0 ? `border-top:1px solid ${BRAND.border};` : ""}width:38%;">${escapeHtml(d.label)}</td>
              <td style="padding:12px 18px;font-size:14px;font-weight:600;color:${BRAND.text};${i > 0 ? `border-top:1px solid ${BRAND.border};` : ""}">${escapeHtml(d.value)}</td>
            </tr>`
          )
          .join("")}
      </table>`
    : "";

  // A table-cell button (with a bgcolor) so Outlook shows it as a button too.
  const ctaHtml = cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:26px auto 8px;"><tr>
        <td align="center" bgcolor="${BRAND.accent}" style="background:${BRAND.accent};border-radius:12px;">
          <a href="${escapeHtml(cta.url)}" style="display:inline-block;padding:14px 32px;color:#FFFFFF;text-decoration:none;font-size:15px;font-weight:700;border-radius:12px;">${escapeHtml(cta.label)}</a>
        </td>
      </tr></table>`
    : "";

  const noteHtml = note
    ? `<p style="margin:22px 0 0;padding-top:16px;border-top:1px solid ${BRAND.border};font-size:12.5px;line-height:1.6;color:${BRAND.muted};">${escapeHtml(note)}</p>`
    : "";

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:${BRAND.background};">
<span style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(preheader ?? heading)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${BRAND.background}" style="background:${BRAND.background};padding:32px 12px;">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;font-family:${FONT_STACK};">
      ${headerHtml(senderContext)}
      <tr><td bgcolor="${BRAND.card}" style="background:${BRAND.card};border:1px solid ${BRAND.border};border-top:0;border-radius:0 0 18px 18px;padding:32px 30px 30px;box-shadow:0 8px 24px rgba(75,33,55,0.06);">
        <div style="height:4px;width:44px;background:${toneColor};border-radius:2px;margin:0 0 18px;"></div>
        <h1 style="margin:0 0 18px;font-size:22px;line-height:1.3;font-weight:700;color:${BRAND.text};">${escapeHtml(heading)}</h1>
        <p style="margin:0 0 14px;font-size:15px;line-height:1.65;color:${BRAND.text};">${escapeHtml(hello)}</p>
        ${paragraphHtml}
        ${codeHtml}
        ${detailsHtml}
        ${ctaHtml}
        ${noteHtml}
      </td></tr>
      ${footerHtml(senderContext)}
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
