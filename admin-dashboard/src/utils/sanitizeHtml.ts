import DOMPurify from "dompurify";

// Markdown pages are authored by admins but shown to the public (and previewed
// to other admins), and marked() passes raw HTML straight through. Anything
// rendered with dangerouslySetInnerHTML must go through this first, or a
// <script>/onerror payload in a page body runs in every viewer's session -
// including an admin's, whose access token lives in localStorage.
DOMPurify.addHook("afterSanitizeAttributes", (node) => {
  if (node.tagName === "A") {
    node.setAttribute("rel", "noopener noreferrer");
    if (node.getAttribute("target")) node.setAttribute("target", "_blank");
  }
});

export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, { USE_PROFILES: { html: true }, FORBID_TAGS: ["style", "form", "input", "button", "iframe", "object", "embed"] });
}
