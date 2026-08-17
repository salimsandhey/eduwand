// Semantic per-stage colors for enquiry status badges/chips, so the pipeline reads at
// a glance instead of every stage looking identical (dataviz skill guidance carried
// over: status color is a separate channel from the accent, never reused for "a
// series"). Tuned per-mode so each pair clears roughly 4.5:1 text-on-bg contrast.
// Text shades are darkened past their "obvious" hue to clear 4.5:1 against the
// badge background (verified with a WCAG relative-luminance check) - these are
// small, bold badge labels, so the small-text threshold applies, not the 3:1
// large-text one.
const LIGHT: Record<string, { bg: string; text: string }> = {
  new: { bg: "#F7E6F2", text: "#7C005A" },
  contacted: { bg: "#FFF1D0", text: "#7A5100" },
  visit: { bg: "#DFFAF8", text: "#14736D" },
  application: { bg: "#F4F1E8", text: "#1F1F1F" },
  admitted: { bg: "#FFE3EA", text: "#9B1F3B" },
  enrolled: { bg: "#1F1F1F", text: "#FFFFFF" },
  lost: { bg: "#FFE3EA", text: "#A51839" },
};

const DARK: Record<string, { bg: string; text: string }> = {
  new: { bg: "#3B1230", text: "#FFD9F1" },
  contacted: { bg: "#3A2B12", text: "#FFD98A" },
  visit: { bg: "#143B39", text: "#A9FFF9" },
  application: { bg: "#33302A", text: "#F4F1E8" },
  admitted: { bg: "#44202A", text: "#FFC0CD" },
  enrolled: { bg: "#7C005A", text: "#FFFFFF" },
  lost: { bg: "#4A1F2A", text: "#FFC0CD" },
};

export function getStatusColor(status: string, mode: "light" | "dark") {
  const table = mode === "dark" ? DARK : LIGHT;
  return table[status] ?? table.new;
}
