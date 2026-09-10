export function capitalizeFirst(text?: string | null): string {
  if (!text) return "";
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function formatEnumLabel(value?: string | null): string {
  if (!value) return "";
  return value.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}
