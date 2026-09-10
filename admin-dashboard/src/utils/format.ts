// Shared display-label formatting for snake_case enum-like values coming
// back from the API (e.g. "front_desk" -> "Front Desk", "visit_scheduled"
// -> "Visit Scheduled"). Mirrors unified-app/src/utils/text.ts's
// formatEnumLabel so both frontends render these values consistently.
export function formatEnumLabel(value?: string | null): string {
  if (!value) return "";
  return value.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}
