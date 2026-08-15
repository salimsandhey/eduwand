// Semantic per-stage colors for enquiry status badges/chips, so the pipeline reads at
// a glance instead of every stage looking identical (dataviz skill guidance carried
// over: status color is a separate channel from the accent, never reused for "a
// series"). Tuned per-mode so each pair clears roughly 4.5:1 text-on-bg contrast.
// Text shades are darkened past their "obvious" hue to clear 4.5:1 against the
// badge background (verified with a WCAG relative-luminance check) - these are
// small, bold badge labels, so the small-text threshold applies, not the 3:1
// large-text one.
const LIGHT: Record<string, { bg: string; text: string }> = {
  new: { bg: "#F4F4F4", text: "#191919" },
  contacted: { bg: "#EFEFEF", text: "#2B2B2B" },
  visit: { bg: "#FAF1F1", text: "#7B2D2B" },
  application: { bg: "#F7F7F7", text: "#1F1F1F" },
  admitted: { bg: "#ECECEC", text: "#1A1A1A" },
  enrolled: { bg: "#151515", text: "#FFFFFF" },
  lost: { bg: "#F6E5E5", text: "#922E2E" },
};

const DARK: Record<string, { bg: string; text: string }> = {
  new: { bg: "#1C1C1C", text: "#F4F4F4" },
  contacted: { bg: "#232323", text: "#E9E9E9" },
  visit: { bg: "#351B1B", text: "#F2D6D6" },
  application: { bg: "#2A2A2A", text: "#EFEFEF" },
  admitted: { bg: "#303030", text: "#FFFFFF" },
  enrolled: { bg: "#7B2D2B", text: "#FFFFFF" },
  lost: { bg: "#4A2020", text: "#F0B0B0" },
};

export function getStatusColor(status: string, mode: "light" | "dark") {
  const table = mode === "dark" ? DARK : LIGHT;
  return table[status] ?? table.new;
}
