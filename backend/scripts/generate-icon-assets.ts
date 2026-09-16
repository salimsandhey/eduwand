// One-off script - not part of the build/runtime. Rasterizes a curated set
// of Ionicons (the icon family already used everywhere else in this app,
// MIT licensed - see node_modules/ionicons) into white-on-transparent PNGs
// for presentation icon badges, since no icon-image pipeline existed before.
// Run with: npx tsx scripts/generate-icon-assets.ts
// Writes to both backend/src/assets/icons (server pptx export) and
// unified-app/assets/icons (mobile in-app preview) - the same files, kept in
// sync by re-running this script if the curated icon list ever changes.
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import path from "path";
import { Resvg } from "@resvg/resvg-js";

const ICONS = [
  "book-outline",
  "flask-outline",
  "calculator-outline",
  "globe-outline",
  "bulb-outline",
  "library-outline",
  "time-outline",
  "trophy-outline",
  "help-circle-outline",
  "checkmark-circle-outline",
  "star-outline",
  "leaf-outline",
  "planet-outline",
  "school-outline",
];

const SIZE = 256;
const SVG_SOURCE_DIR = path.resolve(__dirname, "../../node_modules/ionicons/dist/collection/components/icon/svg");
const OUT_DIRS = [
  path.resolve(__dirname, "../src/assets/icons"),
  path.resolve(__dirname, "../../unified-app/assets/icons"),
];

for (const dir of OUT_DIRS) mkdirSync(dir, { recursive: true });

for (const name of ICONS) {
  const rawSvg = readFileSync(path.join(SVG_SOURCE_DIR, `${name}.svg`), "utf8");
  // Ionicons outline SVGs style their paths via CSS classes
  // (ionicon-fill-none / ionicon-stroke-width) that only resolve inside the
  // Ionicons web component - a standalone SVG file has no such stylesheet,
  // so inline the equivalent explicit attributes before rasterizing.
  const inlined = rawSvg.replace(
    /class="ionicon-fill-none ionicon-stroke-width"/g,
    'fill="none" stroke="#FFFFFF" stroke-width="32"'
  );
  const resvg = new Resvg(inlined, { fitTo: { mode: "width", value: SIZE } });
  const png = resvg.render().asPng();
  for (const dir of OUT_DIRS) {
    writeFileSync(path.join(dir, `${name}.png`), png);
  }
  console.log("generated", name);
}
