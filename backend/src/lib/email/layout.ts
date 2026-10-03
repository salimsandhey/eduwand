// Branded HTML + plain-text layout shared by every EduWand email. Templates
// (templates.ts) describe *what* to say; this decides how it looks. Inline
// styles and table layout only - that is what mail clients reliably render.
//
// The look follows the product theme (admin-dashboard/src/theme.css and the
// app's design tokens): deep plum accent, warm ivory background, white cards,
// amber highlight, Poppins where the client allows web fonts. The header is a
// plum band with the white EduWand logo, finished with the brand's
// amber-to-coral-to-plum gradient strip (the colours of the logo's "e").

export const BRAND = {
  name: "EduWand",
  tagline: "Magic in Learning. Precision in Growth.",
  accent: "#7C005A",
  accentDark: "#5B0042",
  accentSoft: "#F7E6F2",
  highlight: "#FBAA0A",
  coral: "#FB5F7E",
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

const TONE_COLORS: Record<EmailTone, { bar: string; wash: string; border: string }> = {
  default: { bar: BRAND.highlight, wash: BRAND.accentSoft, border: "#EBCFE2" },
  success: { bar: BRAND.good, wash: "#E3F6E3", border: "#BFE6BF" },
  warning: { bar: BRAND.warning, wash: "#FFF3D6", border: "#F6DB9C" },
  alert: { bar: BRAND.critical, wash: "#FDEBEB", border: "#F3C4C4" },
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
  // Where the logo images are loaded from, instead of the configured public
  // address. The admin dashboard's preview uses this to show them from itself.
  assetBase?: string;
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

function emailImageUrl(file: string, assetBase?: string): string | null {
  const base = assetBase ?? process.env.EMAIL_ASSET_URL?.trim().replace(/\/+$/, "") ?? (publicWebUrl() ? `${publicWebUrl()}/email` : null);
  return base ? `${base}/${file}` : null;
}

// Plum with a soft diagonal gradient where the client supports it; the bgcolor
// attribute is what Outlook and other older clients fall back to.
const PLUM_BG = `background:${BRAND.accent};background-image:linear-gradient(135deg,${BRAND.accent} 0%,${BRAND.accentDark} 100%);`;

function headerHtml(senderContext: string | undefined, assetBase: string | undefined): string {
  const logo = emailImageUrl("logo-white.png", assetBase);
  const mark = logo
    ? `<img src="${escapeHtml(logo)}" width="164" height="36" alt="${BRAND.name}" style="display:block;border:0;outline:none;text-decoration:none;width:164px;height:36px;">`
    : `<span style="font-size:26px;font-weight:800;letter-spacing:-0.5px;color:#FFFFFF;">Edu<span style="color:${BRAND.highlight};">Wand</span></span>`;

  return `<tr><td class="px" bgcolor="${BRAND.accent}" style="${PLUM_BG}border-radius:20px 20px 0 0;padding:26px 36px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
          <td align="left" style="vertical-align:middle;">${mark}</td>
          ${
            senderContext
              ? `<td align="right" style="vertical-align:middle;"><span style="display:inline-block;padding:5px 12px;border-radius:999px;background:#8F2A71;border:1px solid #A24A87;font-size:12px;line-height:1.3;font-weight:600;color:#FBE9F5;">${escapeHtml(senderContext)}</span></td>`
              : ""
          }
        </tr></table>
      </td></tr>
      <tr><td bgcolor="${BRAND.highlight}" height="5" style="background:${BRAND.highlight};background-image:linear-gradient(90deg,${BRAND.highlight} 0%,${BRAND.coral} 55%,${BRAND.accent} 100%);height:5px;line-height:5px;font-size:0;">&nbsp;</td></tr>`;
}

function footerHtml(senderContext: string | undefined, assetBase: string | undefined): string {
  const icon = emailImageUrl("icon.png", assetBase);
  const web = publicWebUrl();
  const linkStyle = `color:${BRAND.accent};text-decoration:none;font-weight:600;`;
  const links = web
    ? `<a href="${escapeHtml(web)}/privacy" style="${linkStyle}">Privacy</a> &nbsp;&middot;&nbsp; <a href="${escapeHtml(web)}/terms" style="${linkStyle}">Terms</a> &nbsp;&middot;&nbsp; <a href="${escapeHtml(web)}/contact" style="${linkStyle}">Contact</a><br><br>`
    : "";

  return `<tr><td align="center" class="px" style="padding:30px 36px 8px;font-size:12px;line-height:1.7;color:${BRAND.muted};">
        ${icon ? `<img src="${escapeHtml(icon)}" width="32" height="32" alt="" style="display:inline-block;border:0;width:32px;height:32px;margin:0 0 10px;"><br>` : ""}
        <span style="font-size:13px;font-weight:700;color:${BRAND.accent};">${BRAND.tagline}</span><br><br>
        ${links}
        ${senderContext ? `Sent on behalf of ${escapeHtml(senderContext)} through ${BRAND.name}.<br>` : ""}
        You're receiving this because of activity on your ${BRAND.name} account. If this wasn't you, you can ignore this email.<br>
        &copy; ${new Date().getFullYear()} ${BRAND.name}
      </td></tr>`;
}

export function renderEmail(subject: string, content: EmailContent): RenderedEmail {
  const { heading, paragraphs, code, details, cta, note, preheader, senderContext, tone = "default", assetBase } = content;
  const hello = greeting(content.recipientName);
  const toneColors = TONE_COLORS[tone];

  const paragraphHtml = paragraphs
    .map((p) => `<p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:${BRAND.textSecondary};">${escapeHtml(p)}</p>`)
    .join("");

  const codeHtml = code
    ? `<div style="margin:26px 0;text-align:center;">
        <div style="font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:${BRAND.muted};margin:0 0 10px;">Your code</div>
        <div style="display:inline-block;padding:18px 30px;background:${BRAND.accentSoft};border:2px dashed #D9A6C6;border-radius:16px;font-size:36px;line-height:1.1;font-weight:700;letter-spacing:10px;color:${BRAND.accent};font-family:'Courier New',monospace;">${escapeHtml(code)}</div>
      </div>`
    : "";

  const detailsHtml = details?.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:22px 0;border:1px solid ${BRAND.border};border-radius:16px;border-collapse:separate;overflow:hidden;background:${BRAND.ivory};">
        ${details
          .map(
            (d, i) => `<tr>
              <td style="padding:13px 20px;font-size:11.5px;font-weight:600;letter-spacing:0.4px;text-transform:uppercase;color:${BRAND.muted};${i > 0 ? `border-top:1px solid ${BRAND.border};` : ""}width:38%;vertical-align:top;">${escapeHtml(d.label)}</td>
              <td style="padding:13px 20px;font-size:14.5px;font-weight:600;color:${BRAND.text};${i > 0 ? `border-top:1px solid ${BRAND.border};` : ""}word-break:break-word;">${escapeHtml(d.value)}</td>
            </tr>`
          )
          .join("")}
      </table>`
    : "";

  // A table-cell button (with a bgcolor) so Outlook shows it as a button too.
  // The plain link underneath is for clients that block or restyle buttons.
  const ctaHtml = cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:30px auto 10px;"><tr>
        <td align="center" bgcolor="${BRAND.accent}" style="background:${BRAND.accent};background-image:linear-gradient(135deg,${BRAND.accent} 0%,${BRAND.accentDark} 100%);border-radius:14px;box-shadow:0 8px 18px rgba(124,0,90,0.28);">
          <a href="${escapeHtml(cta.url)}" style="display:inline-block;padding:16px 38px;color:#FFFFFF;text-decoration:none;font-size:15.5px;font-weight:700;border-radius:14px;">${escapeHtml(cta.label)} &rarr;</a>
        </td>
      </tr></table>
      <p style="margin:0 0 6px;text-align:center;font-size:12px;line-height:1.6;color:${BRAND.muted};word-break:break-all;">Button not working? Open this link: <a href="${escapeHtml(cta.url)}" style="color:${BRAND.accent};">${escapeHtml(cta.url)}</a></p>`
    : "";

  const noteHtml = note
    ? `<div style="margin:26px 0 0;padding:14px 18px;background:${BRAND.ivory};border:1px solid ${BRAND.border};border-left:4px solid ${BRAND.highlight};border-radius:10px;font-size:13px;line-height:1.65;color:${BRAND.muted};">${escapeHtml(note)}</div>`
    : "";

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${escapeHtml(subject)}</title>
<style>
  @media only screen and (max-width:620px) {
    .outer { padding:16px 8px !important; }
    .px { padding-left:22px !important; padding-right:22px !important; }
    .card { padding:28px 22px 26px !important; }
    .h1 { font-size:22px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:${BRAND.background};">
<span style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(preheader ?? heading)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${BRAND.background}" class="outer" style="background:${BRAND.background};padding:36px 12px;">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;font-family:${FONT_STACK};">
      ${headerHtml(senderContext, assetBase)}
      <tr><td class="card" bgcolor="${BRAND.card}" style="background:${BRAND.card};border:1px solid ${BRAND.border};border-top:0;border-radius:0 0 20px 20px;padding:36px 36px 34px;box-shadow:0 12px 32px rgba(75,33,55,0.08);">
        <div style="height:4px;width:44px;background:${toneColors.bar};border-radius:2px;margin:0 0 20px;"></div>
        <h1 class="h1" style="margin:0 0 20px;font-size:25px;line-height:1.3;font-weight:700;letter-spacing:-0.3px;color:${BRAND.text};">${escapeHtml(heading)}</h1>
        <p style="margin:0 0 16px;font-size:15px;line-height:1.7;font-weight:600;color:${BRAND.text};">${escapeHtml(hello)}</p>
        ${paragraphHtml}
        ${codeHtml}
        ${detailsHtml}
        ${ctaHtml}
        ${noteHtml}
      </td></tr>
      ${footerHtml(senderContext, assetBase)}
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
