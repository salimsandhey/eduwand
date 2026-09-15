// Shared curated icon set - keyword-matches a piece of content (a slide
// title, a flashcard's front text, ...) to one of a small bundled icon set,
// for a decorative touch without needing a per-item AI-generated image.
// Originally lived only in PresentationView.tsx; extracted here once a
// second consumer (FlashcardsView.tsx) needed the same picker. Keep this in
// sync with backend/scripts/generate-icon-assets.ts and
// backend/src/lib/pptxExport.ts's ICON_KEYWORDS (same "duplicated small
// table, kept in sync manually" pattern already used for COLOR_SCHEMES /
// COLOR_SCHEME_PRESETS - the backend can't import from this RN file, or
// vice versa). Metro needs static require() calls - can't build this map
// from a variable path.
export const ICON_SOURCES: Record<string, number> = {
  "book-outline": require("../../../../assets/icons/book-outline.png"),
  "flask-outline": require("../../../../assets/icons/flask-outline.png"),
  "calculator-outline": require("../../../../assets/icons/calculator-outline.png"),
  "globe-outline": require("../../../../assets/icons/globe-outline.png"),
  "bulb-outline": require("../../../../assets/icons/bulb-outline.png"),
  "library-outline": require("../../../../assets/icons/library-outline.png"),
  "time-outline": require("../../../../assets/icons/time-outline.png"),
  "trophy-outline": require("../../../../assets/icons/trophy-outline.png"),
  "help-circle-outline": require("../../../../assets/icons/help-circle-outline.png"),
  "checkmark-circle-outline": require("../../../../assets/icons/checkmark-circle-outline.png"),
  "star-outline": require("../../../../assets/icons/star-outline.png"),
  "leaf-outline": require("../../../../assets/icons/leaf-outline.png"),
  "planet-outline": require("../../../../assets/icons/planet-outline.png"),
  "school-outline": require("../../../../assets/icons/school-outline.png"),
};
const ICON_KEYWORDS: [string, string][] = [
  ["science", "flask-outline"], ["experiment", "flask-outline"], ["chemistry", "flask-outline"],
  ["water", "flask-outline"], ["reaction", "flask-outline"], ["process", "flask-outline"],
  ["cell", "flask-outline"], ["oxygen", "flask-outline"], ["carbon", "flask-outline"], ["gas", "flask-outline"],
  ["math", "calculator-outline"], ["calculat", "calculator-outline"], ["number", "calculator-outline"],
  ["history", "time-outline"], ["time", "time-outline"], ["past", "time-outline"],
  ["geography", "globe-outline"], ["world", "globe-outline"], ["earth", "globe-outline"], ["global", "globe-outline"],
  ["idea", "bulb-outline"], ["concept", "bulb-outline"], ["think", "bulb-outline"],
  ["energy", "bulb-outline"], ["light", "bulb-outline"], ["sunlight", "bulb-outline"], ["electric", "bulb-outline"],
  ["achieve", "trophy-outline"], ["goal", "trophy-outline"], ["success", "trophy-outline"], ["win", "trophy-outline"],
  ["question", "help-circle-outline"], ["quiz", "help-circle-outline"], ["why", "help-circle-outline"],
  ["define", "help-circle-outline"], ["explain", "help-circle-outline"], ["describe", "help-circle-outline"],
  ["correct", "checkmark-circle-outline"], ["check", "checkmark-circle-outline"], ["complete", "checkmark-circle-outline"],
  ["list", "checkmark-circle-outline"],
  ["star", "star-outline"], ["important", "star-outline"], ["key", "star-outline"], ["example", "star-outline"],
  ["nature", "leaf-outline"], ["plant", "leaf-outline"], ["biology", "leaf-outline"], ["environment", "leaf-outline"],
  ["space", "planet-outline"], ["planet", "planet-outline"], ["solar", "planet-outline"], ["astronomy", "planet-outline"],
  ["school", "school-outline"], ["class", "school-outline"], ["learn", "school-outline"],
];
const DEFAULT_ICON = "book-outline";

export function pickIconForText(text: string): number {
  const lower = text.toLowerCase();
  for (const [keyword, icon] of ICON_KEYWORDS) {
    if (lower.includes(keyword)) return ICON_SOURCES[icon];
  }
  return ICON_SOURCES[DEFAULT_ICON];
}

// Real educational content (e.g. "Chlorophyll", "Mitochondria") almost never
// contains one of the generic English keywords above, so plain keyword
// matching falls through to DEFAULT_ICON far more often than not - that's
// why every card in a deck was rendering the same "book" icon regardless of
// the keyword-list broadening above. For a per-card hero icon we want visual
// variety across a deck even when no keyword hits, so fall back to a
// deterministic rotation keyed by the card's position instead of a fixed
// default - keyword match still wins first when it's meaningful.
const ICON_ROTATION = [
  "flask-outline", "bulb-outline", "leaf-outline", "star-outline",
  "planet-outline", "trophy-outline", "globe-outline", "calculator-outline",
  "library-outline", "checkmark-circle-outline",
];

export function pickIconForCard(text: string, index: number): number {
  const lower = text.toLowerCase();
  for (const [keyword, icon] of ICON_KEYWORDS) {
    if (lower.includes(keyword)) return ICON_SOURCES[icon];
  }
  return ICON_SOURCES[ICON_ROTATION[index % ICON_ROTATION.length]];
}
