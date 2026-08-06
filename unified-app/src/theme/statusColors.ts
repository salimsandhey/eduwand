// Semantic per-stage colors for enquiry status badges/chips, so the pipeline reads at
// a glance instead of every stage looking identical (dataviz skill guidance carried
// over: status color is a separate channel from the accent, never reused for "a
// series"). Tuned per-mode so each pair clears roughly 4.5:1 text-on-bg contrast.
// Text shades are darkened past their "obvious" hue to clear 4.5:1 against the
// badge background (verified with a WCAG relative-luminance check) - these are
// small, bold badge labels, so the small-text threshold applies, not the 3:1
// large-text one.
const LIGHT: Record<string, { bg: string; text: string }> = {
  new: { bg: "#E3EEFC", text: "#1D5BBF" },
  contacted: { bg: "#FDF0DA", text: "#8A5A00" },
  visit: { bg: "#EFE6FB", text: "#6B3FC7" },
  application: { bg: "#DFF3F1", text: "#0A6359" },
  admitted: { bg: "#E1F5E4", text: "#146B39" },
  enrolled: { bg: "#D9F2E8", text: "#086647" },
  lost: { bg: "#FBE3E2", text: "#A3291B" },
};

const DARK: Record<string, { bg: string; text: string }> = {
  new: { bg: "#122A46", text: "#7FB3F5" },
  contacted: { bg: "#33280F", text: "#F0BE64" },
  visit: { bg: "#271A3D", text: "#B79AF0" },
  application: { bg: "#0E2E2A", text: "#5FD9C9" },
  admitted: { bg: "#123322", text: "#3AC47A" },
  enrolled: { bg: "#0E3324", text: "#3DE0A8" },
  lost: { bg: "#3A1613", text: "#F0796F" },
};

export function getStatusColor(status: string, mode: "light" | "dark") {
  const table = mode === "dark" ? DARK : LIGHT;
  return table[status] ?? table.new;
}
