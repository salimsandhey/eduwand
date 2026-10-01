import DOMPurify from 'dompurify'

// Page bodies are written by EduWand admins but marked() lets raw HTML through,
// so everything rendered with dangerouslySetInnerHTML goes through this first.
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A') {
    node.setAttribute('rel', 'noopener noreferrer')
    if (node.getAttribute('target')) node.setAttribute('target', '_blank')
  }
})

export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ['style', 'form', 'input', 'button', 'iframe', 'object', 'embed'],
  })
}
