import { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, Modal, useWindowDimensions, Image, ImageBackground } from "react-native";
import PagerView from "react-native-pager-view";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../../theme/ThemeContext";
import { radius, spacing, typography } from "../../../theme/tokens";
import { lockLandscape, lockPortrait } from "../../../utils/safeOrientation";
import { PresentationContent, PresentationColorScheme, PresentationSlideLayout, MediaItem } from "./content";
import { NumberedEditCard, EditActionRow } from "./NumberedEditCard";
import { pickIconForText } from "./topicIcons";

interface Props {
  content: PresentationContent;
  editable: boolean;
  onChange: (content: PresentationContent) => void;
  // Where to load an "image" slide's picture from (an uploaded image, or a
  // rendered PDF page) - supplied by the screen, which knows the topic + token.
  mediaUrl?: (item: MediaItem) => string;
}

// What an "image" slide shows: the picture's URL and its credit line.
type SlideMedia = { url: string; attribution: string | null } | null;

type Scheme = { background: string; accent: string; text: string; mutedText: string };
// Legacy-only render layouts - no longer generated, but old "more_visual"
// rows with a saved photo still need to render as they were built. Not part
// of PresentationSlideLayout (the current, generatable set).
type RenderLayout = PresentationSlideLayout | "image-left" | "image-right";

const COLOR_SCHEMES: Record<PresentationColorScheme, Scheme> = {
  indigo: { background: "#2A2B6A", accent: "#8C7CFF", text: "#FFFFFF", mutedText: "#C7C4F5" },
  coral: { background: "#7A2E2E", accent: "#FF8A7A", text: "#FFFFFF", mutedText: "#F3C9C4" },
  forest: { background: "#1F3D2E", accent: "#6FD79B", text: "#FFFFFF", mutedText: "#BFE3CE" },
  slate: { background: "#2B2F36", accent: "#9FB4C7", text: "#FFFFFF", mutedText: "#C7D1DA" },
};

const STEP_PREFIX_RE = /^step\s*\d+[:.\-)]?\s*/i;

function stripStepPrefix(title: string): string {
  return title.replace(STEP_PREFIX_RE, "").trim() || title;
}

// Old generations (and an occasionally-disobedient model) can still carry a
// leading "[Understand]"-style Bloom's Taxonomy tag meant for internal
// objectives lists, not a rendered slide headline - pull it out and show it
// as a small pill instead of raw brackets inline with the title.
const BLOOM_TAG_RE = /^\[(Remember|Understand|Apply|Analyze|Evaluate|Create)\]\s*/i;
function splitBloomTag(title: string): { tag: string | null; title: string } {
  const match = title.match(BLOOM_TAG_RE);
  if (!match) return { tag: null, title };
  return { tag: match[1], title: title.slice(match[0].length) };
}

function displayTitle(rawTitle: string, isInstructional: boolean): string {
  const clean = splitBloomTag(rawTitle).title;
  return isInstructional ? stripStepPrefix(clean) : clean;
}

// Legacy generations predate the `layout` field, or predate the photo
// removal (old "more_visual" rows saved "image-left"/"image-right", which
// are no longer part of PresentationSlideLayout but still need to render as
// they were built). Everything else falls back to plain bullets. Matches the
// same fallback in backend/src/lib/pptxExport.ts so a fresh export looks
// like this preview (for anything still in the current layout set).
const KNOWN_LAYOUTS = new Set<string>([
  "title", "bullets", "stat", "quote", "divider", "stat-grid", "timeline", "icon-grid", "image",
  "big_statement", "definition", "compare_2col", "process_flow", "step", "card_grid", "table", "callout",
  "recap_bridge", "closing_recap",
]);

function resolveLayout(slide: PresentationContent["slides"][number]): RenderLayout {
  const raw = slide.layout as string | undefined;
  if (raw === "image-left" || raw === "image-right") return raw;
  if (raw && KNOWN_LAYOUTS.has(raw)) return raw as RenderLayout;
  return slide.imageUrl ? "image-right" : "bullets";
}

const LAYOUT_ICONS: Record<RenderLayout, keyof typeof Ionicons.glyphMap> = {
  image: "images-outline",
  title: "text-outline",
  bullets: "list-outline",
  "image-right": "image-outline",
  "image-left": "image-outline",
  stat: "stats-chart-outline",
  quote: "chatbox-ellipses-outline",
  divider: "remove-outline",
  "stat-grid": "grid-outline",
  timeline: "git-commit-outline",
  "icon-grid": "apps-outline",
  big_statement: "flash-outline",
  definition: "book-outline",
  compare_2col: "swap-horizontal-outline",
  process_flow: "arrow-forward-circle-outline",
  step: "footsteps-outline",
  card_grid: "grid-outline",
  table: "list-outline",
  callout: "warning-outline",
  recap_bridge: "arrow-undo-outline",
  closing_recap: "checkmark-done-outline",
};

// Every size inside the full-screen slideshow is computed from this instead
// of a fixed px value - the box itself (see Slideshow's boxWidth/boxHeight)
// is already sized per-device, but content inside it was still using fixed
// StyleSheet numbers, which is exactly what overflowed the box and got
// clipped top/bottom on phones smaller than whatever the numbers were tuned
// against. REFERENCE_BOX_WIDTH is the width these base numbers below were
// designed for; `scale` re-expresses every one of them as a fraction of the
// box actually available on this device, so a smaller box gets
// proportionally smaller text/padding instead of the same fixed size
// overflowing it. Clamped so extremes (a tiny phone, a large tablet) don't
// make text illegibly small or absurdly large.
const REFERENCE_BOX_WIDTH = 700;
const MIN_SCALE = 0.68;
const MAX_SCALE = 1.4;
function boxScale(boxWidth: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, boxWidth / REFERENCE_BOX_WIDTH));
}
function sz(base: number, scale: number): number {
  return Math.round(base * scale);
}

// One scaled-style object per render, keyed by `scale` - every numeric style
// value that previously lived as a fixed number in the StyleSheet at the
// bottom of this file for full-screen slide content now comes from here
// instead, computed relative to the actual box size.
function useScaledSlideStyles(scale: number) {
  return useMemo(
    () => ({
      slidePageInner: { paddingHorizontal: sz(28, scale), paddingVertical: sz(24, scale) },
      slideCenterBox: { paddingHorizontal: sz(24, scale) },
      titleLayoutText: { fontSize: sz(26, scale), lineHeight: sz(32, scale) },
      statText: { fontSize: sz(52, scale) },
      statCaption: { fontSize: sz(14, scale), marginTop: sz(10, scale) },
      quoteText: { fontSize: sz(20, scale), lineHeight: sz(27, scale) },
      quoteAttribution: { fontSize: sz(13, scale), marginTop: sz(10, scale) },
      slideshowTitle: { fontSize: sz(20, scale), lineHeight: sz(25, scale), marginBottom: sz(14, scale) },
      slideshowBulletList: { gap: sz(10, scale) },
      slideshowBulletDot: { width: sz(6, scale), height: sz(6, scale), borderRadius: sz(3, scale), marginTop: sz(7, scale) },
      slideshowBulletText: { fontSize: sz(13, scale), lineHeight: sz(19, scale) },
      slideshowLogo: { top: sz(16, scale), right: sz(16, scale), width: sz(28, scale), height: sz(28, scale) },
      slideFooterLabel: { fontSize: sz(9, scale), bottom: sz(8, scale), right: sz(16, scale) },
      stepBadgeLarge: { paddingHorizontal: sz(12, scale), paddingVertical: sz(5, scale), marginBottom: sz(12, scale), borderRadius: 999 },
      stepBadgeLargeText: { fontSize: sz(10, scale) },
      bloomBadge: { borderRadius: sz(6, scale), paddingHorizontal: sz(8, scale), paddingVertical: sz(4, scale), marginBottom: sz(8, scale) },
      bloomBadgeText: { fontSize: sz(9, scale) },
      statGridRow: { gap: sz(10, scale), marginTop: sz(4, scale) },
      statGridBox: { borderRadius: sz(10, scale), paddingVertical: sz(12, scale), paddingHorizontal: sz(6, scale) },
      statGridValue: { fontSize: sz(20, scale) },
      statGridLabel: { fontSize: sz(9, scale), marginTop: sz(4, scale) },
      statGridParagraph: { fontSize: sz(11, scale), lineHeight: sz(16, scale), marginTop: sz(12, scale) },
      timelineRow: { gap: sz(8, scale), marginTop: sz(4, scale) },
      timelineCircle: { width: sz(22, scale), height: sz(22, scale), borderRadius: sz(11, scale) },
      timelineCircleText: { fontSize: sz(10, scale) },
      timelineLine: { height: sz(2, scale) },
      timelineCard: { borderRadius: sz(8, scale), padding: sz(8, scale), marginTop: sz(8, scale), minHeight: sz(80, scale) },
      timelineTitle: { fontSize: sz(11, scale) },
      timelineTag: { fontSize: sz(9, scale), marginTop: sz(3, scale) },
      timelineDescription: { fontSize: sz(9, scale), marginTop: sz(3, scale), lineHeight: sz(13, scale) },
      iconGridRow: { gap: sz(10, scale), marginTop: sz(4, scale) },
      iconGridCard: { borderRadius: sz(10, scale), padding: sz(10, scale) },
      iconGridBadge: { width: sz(36, scale), height: sz(36, scale), borderRadius: sz(18, scale), marginBottom: sz(8, scale) },
      iconGridBadgeImage: { width: sz(18, scale), height: sz(18, scale) },
      iconGridTitle: { fontSize: sz(12, scale) },
      iconGridDescription: { fontSize: sz(10, scale), marginTop: sz(4, scale), lineHeight: sz(14, scale) },
      imageSplitText: { paddingHorizontal: sz(18, scale), paddingVertical: sz(18, scale) },
    }),
    [scale]
  );
}

export function PresentationView({ content, editable, onChange, mediaUrl }: Props) {
  const { colors } = useTheme();
  const [presentingIndex, setPresentingIndex] = useState<number | null>(null);
  const mediaById = useMemo(() => new Map((content.media ?? []).map((item) => [item.id, item])), [content.media]);
  function mediaFor(slide: PresentationContent["slides"][number]): SlideMedia {
    const item = slide.mediaId ? mediaById.get(slide.mediaId) : undefined;
    return item && mediaUrl ? { url: mediaUrl(item), attribution: item.attribution } : null;
  }
  // School branding, when present, takes the place of a fixed COLOR_SCHEMES
  // preset - independent of `template` now (branding applies by default,
  // see GenerationSetupScreen.tsx), falls back to the picked preset otherwise.
  const scheme: Scheme =
    content.primaryColor || content.secondaryColor
      ? {
          background: content.primaryColor ?? COLOR_SCHEMES.indigo.background,
          accent: content.secondaryColor ?? COLOR_SCHEMES.indigo.accent,
          text: "#FFFFFF",
          mutedText: "#E3E3F0",
        }
      : COLOR_SCHEMES[content.colorScheme ?? "indigo"];
  const isInstructional = content.template === "instructional";
  const logoUrl = content.logoUrl ?? null;

  function updateSlide(i: number, patch: Partial<PresentationContent["slides"][number]>) {
    const slides = [...content.slides];
    slides[i] = { ...slides[i], ...patch };
    onChange({ ...content, slides });
  }
  function removeSlide(i: number) {
    onChange({ ...content, slides: content.slides.filter((_, idx) => idx !== i) });
  }
  function addSlide() {
    onChange({ ...content, slides: [...content.slides, { layout: "bullets", title: "New slide", bullets: ["Key point"] }] });
  }

  if (editable) {
    return (
      <View>
        {content.slides.map((slide, i) => (
          <NumberedEditCard
            key={i}
            index={i}
            editable={editable}
            onRemove={editable && content.slides.length > 1 ? () => removeSlide(i) : undefined}
            renderView={() => (
              <View>
                <View style={styles.editLayoutTag}>
                  <Ionicons name={LAYOUT_ICONS[resolveLayout(slide)]} size={11} color={colors.textMuted} />
                  <Text style={[styles.editLayoutTagText, { color: colors.textMuted }]}>{resolveLayout(slide)}</Text>
                </View>
                <Text style={[styles.slideTitle, { color: colors.textPrimary }]}>{splitBloomTag(slide.title).title}</Text>
                {slide.bullets.map((b, bi) => (
                  <View key={bi} style={styles.bulletRow}>
                    <View style={[styles.bulletDot, { backgroundColor: colors.accent }]} />
                    <Text style={[styles.bulletText, { color: colors.textSecondary }]}>{b}</Text>
                  </View>
                ))}
                {(slide.items ?? []).map((item, ii) => (
                  <View key={ii} style={styles.bulletRow}>
                    <View style={[styles.bulletDot, { backgroundColor: colors.accent }]} />
                    <Text style={[styles.bulletText, { color: colors.textSecondary }]}>
                      {item.title}{item.description ? ` - ${item.description}` : ""}
                    </Text>
                  </View>
                ))}
              </View>
            )}
            renderEditor={(done, cancel) => (
              <SlideEditor initial={slide} colors={colors} onCancel={cancel} onDone={(v) => { updateSlide(i, v); done(); }} />
            )}
          />
        ))}
        <Pressable style={[styles.addButton, { borderColor: colors.accent }]} onPress={addSlide} accessibilityRole="button">
          <Ionicons name="add" size={16} color={colors.accent} />
          <Text style={[styles.addButtonText, { color: colors.accent }]}>Add slide</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View>
      <View style={styles.grid}>
        {content.slides.map((slide, i) => {
          const layout = resolveLayout(slide);
          const media = layout === "image" ? mediaFor(slide) : null;
          const tileImageUrl = media?.url ?? (layout === "image-left" || layout === "image-right" ? slide.imageUrl : undefined);
          const hasImage = !!tileImageUrl;
          const previewLine = slide.bullets[0] ?? slide.items?.[0]?.title ?? "";
          // Only the image layouts still need the single caption line under
          // the title - "bullets" now gets its own mini bullet-list visual
          // instead (see TileVisual), so repeating bullets[0] again below
          // the title would just be redundant.
          const showCaption = layout === "image-left" || layout === "image-right";
          const tileInner = (
            <>
              <View style={styles.tileTopRow}>
                {isInstructional ? (
                  <View style={[styles.stepBadge, { backgroundColor: scheme.accent }]}>
                    <Text style={styles.stepBadgeText}>STEP {i + 1}</Text>
                  </View>
                ) : (
                  <Text style={[styles.tileNumber, { color: hasImage ? "#FFFFFF" : scheme.mutedText }]}>{i + 1}</Text>
                )}
                {logoUrl ? <Image source={{ uri: logoUrl }} style={styles.tileLogo} resizeMode="contain" /> : null}
              </View>
              {!hasImage ? <TileVisual layout={layout} slide={slide} scheme={scheme} /> : <View style={{ flex: 1 }} />}
              <View>
                <Text style={[styles.tileTitle, { color: hasImage ? "#FFFFFF" : scheme.text }]} numberOfLines={2}>
                  {displayTitle(slide.title, isInstructional)}
                </Text>
                {showCaption ? (
                  <Text style={[styles.tileBullet, { color: hasImage ? "#EDEDED" : scheme.mutedText }]} numberOfLines={2}>
                    {previewLine}
                  </Text>
                ) : null}
              </View>
            </>
          );
          return hasImage ? (
            <Pressable key={i} style={({ pressed }) => [styles.tile, pressed && { opacity: 0.85 }]} onPress={() => setPresentingIndex(i)} accessibilityRole="button" accessibilityLabel={`Open slide ${i + 1}`}>
              <ImageBackground source={{ uri: tileImageUrl }} style={StyleSheet.absoluteFill} imageStyle={styles.tileImageRadius}>
                <View style={[StyleSheet.absoluteFill, styles.tileImageOverlay, styles.tileImageRadius]} />
              </ImageBackground>
              {tileInner}
            </Pressable>
          ) : (
            <Pressable
              key={i}
              style={({ pressed }) => [
                styles.tile,
                { backgroundColor: layout === "divider" ? scheme.accent : scheme.background },
                pressed && { opacity: 0.85 },
              ]}
              onPress={() => setPresentingIndex(i)}
              accessibilityRole="button"
              accessibilityLabel={`Open slide ${i + 1}`}
            >
              {tileInner}
            </Pressable>
          );
        })}
      </View>

      <Modal visible={presentingIndex !== null} animationType="fade" onRequestClose={() => setPresentingIndex(null)}>
        <GestureHandlerRootView style={{ flex: 1 }}>
          {presentingIndex !== null ? (
            <Slideshow
              slides={content.slides}
              initialIndex={presentingIndex}
              isInstructional={isInstructional}
              scheme={scheme}
              logoUrl={logoUrl}
              footerLabel={content.footerLabel ?? null}
              mediaFor={mediaFor}
              onClose={() => setPresentingIndex(null)}
            />
          ) : null}
        </GestureHandlerRootView>
      </Modal>
    </View>
  );
}

// Fills the middle of a tile with something that actually represents the
// slide's layout, instead of a plain text line - a stat-grid slide gets
// mini boxes, a timeline gets mini dots, etc., matching what the full-screen
// view shows for that layout, just shrunk down. "bullets"/image layouts are
// left alone (the caption line under the title already represents them).
function TileVisual({
  layout,
  slide,
  scheme,
}: {
  layout: RenderLayout;
  slide: PresentationContent["slides"][number];
  scheme: Scheme;
}) {
  const items = slide.items ?? [];

  if (layout === "stat") {
    return (
      <View style={styles.tileVisual}>
        <Text style={[styles.tileStatValue, { color: scheme.accent }]} numberOfLines={1}>{splitBloomTag(slide.title).title}</Text>
      </View>
    );
  }

  if (layout === "quote") {
    return (
      <View style={styles.tileVisual}>
        <Text style={[styles.tileQuoteMark, { color: scheme.accent, opacity: 0.5 }]}>"</Text>
      </View>
    );
  }

  if (layout === "stat-grid") {
    return (
      <View style={styles.tileVisual}>
        <View style={styles.tileGridRow}>
          {items.slice(0, 3).map((item, ii) => (
            <View key={ii} style={[styles.tileGridBox, { borderColor: scheme.accent }]}>
              <Text style={[styles.tileGridBoxText, { color: scheme.accent }]} numberOfLines={1}>{item.title}</Text>
            </View>
          ))}
        </View>
      </View>
    );
  }

  if (layout === "timeline") {
    const steps = items.slice(0, 4);
    return (
      <View style={styles.tileVisual}>
        <View style={styles.tileGridRow}>
          {steps.map((_, ii) => (
            <View key={ii} style={styles.tileGridRow}>
              <View style={[styles.tileTimelineDot, { backgroundColor: scheme.accent }]}>
                <Text style={{ fontSize: 8, fontFamily: typography.bold, color: "#FFFFFF" }}>{ii + 1}</Text>
              </View>
              {ii < steps.length - 1 ? <View style={[styles.tileTimelineLine, { backgroundColor: scheme.accent }]} /> : null}
            </View>
          ))}
        </View>
      </View>
    );
  }

  if (layout === "icon-grid") {
    const cards = items.slice(0, 3);
    return (
      <View style={styles.tileVisual}>
        <View style={styles.tileGridRow}>
          {cards.map((card, ii) => (
            <View key={ii} style={[styles.tileIconCircle, { backgroundColor: scheme.accent }]}>
              <Image source={pickIconForText(card.title)} style={styles.tileIconImage} resizeMode="contain" />
            </View>
          ))}
        </View>
      </View>
    );
  }

  if (layout === "title" || layout === "divider") {
    return (
      <View style={styles.tileVisual}>
        <View style={[styles.tileAccentBar, { backgroundColor: layout === "divider" ? "#FFFFFF" : scheme.accent }]} />
      </View>
    );
  }

  // "bullets" (the default/fallback layout too) - a mini version of the
  // actual bullet list instead of one truncated caption line.
  const bullets = slide.bullets.slice(0, 3);
  if (bullets.length === 0) return null;
  return (
    <View style={[styles.tileVisual, styles.tileBulletMiniList]}>
      {bullets.map((b, ii) => (
        <View key={ii} style={styles.tileBulletMiniRow}>
          <View style={[styles.tileBulletMiniDot, { backgroundColor: scheme.accent }]} />
          <Text style={[styles.tileBulletMiniText, { color: scheme.mutedText }]} numberOfLines={1}>{b}</Text>
        </View>
      ))}
    </View>
  );
}

function SlideContent({
  slide,
  scheme,
  logoUrl,
  isInstructional,
  index,
  scale,
  media,
}: {
  slide: PresentationContent["slides"][number];
  scheme: Scheme;
  logoUrl: string | null;
  isInstructional: boolean;
  index: number;
  scale: number;
  media: SlideMedia;
}) {
  const layout = resolveLayout(slide);
  const { tag: bloomTag, title: cleanTitle } = splitBloomTag(slide.title);
  const title = isInstructional ? stripStepPrefix(cleanTitle) : cleanTitle;
  const showLogo = !!logoUrl && layout !== "image-left" && layout !== "image-right";
  const items = slide.items ?? [];
  const ss = useScaledSlideStyles(scale);

  const stepBadge = isInstructional ? (
    <View style={[styles.stepBadgeLarge, ss.stepBadgeLarge, { backgroundColor: scheme.accent }]}>
      <Text style={[styles.stepBadgeLargeText, ss.stepBadgeLargeText]}>STEP {index + 1}</Text>
    </View>
  ) : null;
  // Same visual language as the STEP badge - shown in place of the old
  // inline "[Understand]"-style bracket prefix, only on layouts with a
  // top-anchored headline (not centered hero text like title/stat/quote).
  const bloomBadge = bloomTag && !isInstructional ? (
    <View style={[styles.bloomBadge, ss.bloomBadge, { backgroundColor: scheme.accent }]}>
      <Text style={[styles.bloomBadgeText, ss.bloomBadgeText]}>{bloomTag.toUpperCase()}</Text>
    </View>
  ) : null;

  if (layout === "image") {
    // The teacher's own image / PDF page, shown as-is: caption on top, the
    // picture scaled to fit (never cropped or stretched), credit line under it.
    return (
      <View style={[styles.slidePageInner, ss.slidePageInner, { flex: 1 }]}>
        {title ? <Text style={[styles.slideshowTitle, ss.slideshowTitle, { color: scheme.text, marginBottom: sz(8, scale) }]} numberOfLines={2}>{title}</Text> : null}
        {media ? (
          <Image source={{ uri: media.url }} style={{ flex: 1 }} resizeMode="contain" />
        ) : (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ color: scheme.mutedText, fontSize: sz(12, scale) }}>This image is no longer available.</Text>
          </View>
        )}
        {media?.attribution ? (
          <Text style={{ color: scheme.accent, fontSize: sz(9, scale), fontStyle: "italic", textAlign: "center", marginTop: sz(6, scale) }} numberOfLines={1}>
            {media.attribution}
          </Text>
        ) : null}
        {showLogo ? <Image source={{ uri: logoUrl! }} style={[styles.slideshowLogo, ss.slideshowLogo]} resizeMode="contain" /> : null}
      </View>
    );
  }

  if (layout === "title") {
    return (
      <View style={[styles.slideCenterBox, ss.slideCenterBox]}>
        {stepBadge}
        <Text style={[styles.titleLayoutText, ss.titleLayoutText, { color: scheme.text }]}>{title}</Text>
        {showLogo ? <Image source={{ uri: logoUrl! }} style={[styles.slideshowLogo, ss.slideshowLogo]} resizeMode="contain" /> : null}
      </View>
    );
  }

  if (layout === "divider") {
    return (
      <View style={[styles.slideCenterBox, ss.slideCenterBox, { backgroundColor: scheme.accent }]}>
        <Text style={[styles.titleLayoutText, ss.titleLayoutText, { color: "#FFFFFF" }]}>{title}</Text>
      </View>
    );
  }

  if (layout === "stat") {
    return (
      <View style={[styles.slideCenterBox, ss.slideCenterBox]}>
        <Text style={[styles.statText, ss.statText, { color: scheme.text }]}>{title}</Text>
        {slide.bullets[0] ? <Text style={[styles.statCaption, ss.statCaption, { color: scheme.mutedText }]}>{slide.bullets[0]}</Text> : null}
        {showLogo ? <Image source={{ uri: logoUrl! }} style={[styles.slideshowLogo, ss.slideshowLogo]} resizeMode="contain" /> : null}
      </View>
    );
  }

  if (layout === "quote") {
    return (
      <View style={[styles.slideCenterBox, ss.slideCenterBox]}>
        <Text style={[styles.quoteText, ss.quoteText, { color: scheme.text }]}>"{title}"</Text>
        {slide.bullets[0] ? <Text style={[styles.quoteAttribution, ss.quoteAttribution, { color: scheme.mutedText }]}>- {slide.bullets[0]}</Text> : null}
        {showLogo ? <Image source={{ uri: logoUrl! }} style={[styles.slideshowLogo, ss.slideshowLogo]} resizeMode="contain" /> : null}
      </View>
    );
  }

  if (layout === "stat-grid") {
    return (
      <View style={[styles.slidePageInner, ss.slidePageInner]}>
        {bloomBadge}
        <Text style={[styles.slideshowTitle, ss.slideshowTitle, { color: scheme.text }]}>{title}</Text>
        <View style={[styles.statGridRow, ss.statGridRow]}>
          {items.slice(0, 5).map((item, ii) => (
            <View key={ii} style={[styles.statGridBox, ss.statGridBox, { borderColor: scheme.accent }]}>
              <Text style={[styles.statGridValue, ss.statGridValue, { color: scheme.accent }]}>{item.title}</Text>
              {item.description ? <Text style={[styles.statGridLabel, ss.statGridLabel, { color: scheme.mutedText }]} numberOfLines={2}>{item.description}</Text> : null}
            </View>
          ))}
        </View>
        {slide.bullets.length ? (
          <Text style={[styles.statGridParagraph, ss.statGridParagraph, { color: scheme.mutedText }]}>{slide.bullets.join(" ")}</Text>
        ) : null}
        {showLogo ? <Image source={{ uri: logoUrl! }} style={[styles.slideshowLogo, ss.slideshowLogo]} resizeMode="contain" /> : null}
      </View>
    );
  }

  if (layout === "timeline") {
    const steps = items.slice(0, 6);
    return (
      <View style={[styles.slidePageInner, ss.slidePageInner]}>
        {bloomBadge}
        <Text style={[styles.slideshowTitle, ss.slideshowTitle, { color: scheme.text }]}>{title}</Text>
        <View style={[styles.timelineRow, ss.timelineRow]}>
          {steps.map((step, ii) => (
            <View key={ii} style={styles.timelineCol}>
              <View style={styles.timelineCircleRow}>
                <View style={[styles.timelineCircle, ss.timelineCircle, { backgroundColor: scheme.accent }]}>
                  <Text style={[styles.timelineCircleText, ss.timelineCircleText]}>{ii + 1}</Text>
                </View>
                {ii < steps.length - 1 ? <View style={[styles.timelineLine, ss.timelineLine, { backgroundColor: scheme.accent }]} /> : null}
              </View>
              <View style={[styles.timelineCard, ss.timelineCard, { borderColor: scheme.accent }]}>
                <Text style={[styles.timelineTitle, ss.timelineTitle, { color: scheme.text }]} numberOfLines={2}>{step.title}</Text>
                {step.tag ? <Text style={[styles.timelineTag, ss.timelineTag, { color: scheme.accent }]}>{step.tag}</Text> : null}
                {step.description ? <Text style={[styles.timelineDescription, ss.timelineDescription, { color: scheme.mutedText }]} numberOfLines={4}>{step.description}</Text> : null}
              </View>
            </View>
          ))}
        </View>
        {showLogo ? <Image source={{ uri: logoUrl! }} style={[styles.slideshowLogo, ss.slideshowLogo]} resizeMode="contain" /> : null}
      </View>
    );
  }

  if (layout === "icon-grid") {
    const cards = items.slice(0, 4);
    return (
      <View style={[styles.slidePageInner, ss.slidePageInner]}>
        {bloomBadge}
        <Text style={[styles.slideshowTitle, ss.slideshowTitle, { color: scheme.text }]}>{title}</Text>
        <View style={[styles.iconGridRow, ss.iconGridRow]}>
          {cards.map((card, ii) => (
            <View key={ii} style={[styles.iconGridCard, ss.iconGridCard, { borderColor: scheme.accent }]}>
              <View style={[styles.iconGridBadge, ss.iconGridBadge, { backgroundColor: scheme.accent }]}>
                <Image source={pickIconForText(card.title)} style={[styles.iconGridBadgeImage, ss.iconGridBadgeImage]} resizeMode="contain" />
              </View>
              <Text style={[styles.iconGridTitle, ss.iconGridTitle, { color: scheme.text }]} numberOfLines={2}>{card.title}</Text>
              {card.description ? <Text style={[styles.iconGridDescription, ss.iconGridDescription, { color: scheme.mutedText }]} numberOfLines={4}>{card.description}</Text> : null}
            </View>
          ))}
        </View>
        {showLogo ? <Image source={{ uri: logoUrl! }} style={[styles.slideshowLogo, ss.slideshowLogo]} resizeMode="contain" /> : null}
      </View>
    );
  }

  if (layout === "image-left" || layout === "image-right") {
    const imageOnLeft = layout === "image-left";
    const textSide = (
      <View style={[styles.imageSplitText, ss.imageSplitText]}>
        {stepBadge}
        <Text style={[styles.slideshowTitle, ss.slideshowTitle, { color: scheme.text }]}>{title}</Text>
        <View style={[styles.slideshowBulletList, ss.slideshowBulletList]}>
          {slide.bullets.map((b, bi) => (
            <View key={bi} style={styles.slideshowBulletRow}>
              <View style={[styles.slideshowBulletDot, ss.slideshowBulletDot, { backgroundColor: scheme.accent }]} />
              <Text style={[styles.slideshowBulletText, ss.slideshowBulletText, { color: scheme.mutedText }]}>{b}</Text>
            </View>
          ))}
        </View>
      </View>
    );
    const imageSide = slide.imageUrl ? (
      <Image source={{ uri: slide.imageUrl }} style={styles.imageSplitImage} resizeMode="cover" />
    ) : (
      <View style={[styles.imageSplitImage, { backgroundColor: scheme.accent }]} />
    );
    return (
      <View style={styles.imageSplitRow}>
        {imageOnLeft ? imageSide : textSide}
        {imageOnLeft ? textSide : imageSide}
      </View>
    );
  }

  // "bullets" - the default/fallback layout.
  return (
    <View style={[styles.slidePageInner, ss.slidePageInner]}>
      {stepBadge}
      {bloomBadge}
      <Text style={[styles.slideshowTitle, ss.slideshowTitle, { color: scheme.text }]}>{title}</Text>
      <View style={[styles.slideshowBulletList, ss.slideshowBulletList]}>
        {slide.bullets.map((b, bi) => (
          <View key={bi} style={styles.slideshowBulletRow}>
            <View style={[styles.slideshowBulletDot, ss.slideshowBulletDot, { backgroundColor: scheme.accent }]} />
            <Text style={[styles.slideshowBulletText, ss.slideshowBulletText, { color: scheme.mutedText }]}>{b}</Text>
          </View>
        ))}
      </View>
      {showLogo ? <Image source={{ uri: logoUrl! }} style={[styles.slideshowLogo, ss.slideshowLogo]} resizeMode="contain" /> : null}
    </View>
  );
}

function Slideshow({
  slides,
  initialIndex,
  isInstructional,
  scheme,
  logoUrl,
  footerLabel,
  mediaFor,
  onClose,
}: {
  slides: PresentationContent["slides"];
  initialIndex: number;
  isInstructional: boolean;
  scheme: Scheme;
  logoUrl: string | null;
  footerLabel: string | null;
  mediaFor: (slide: PresentationContent["slides"][number]) => SlideMedia;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(initialIndex);
  const pagerRef = useRef<PagerView>(null);

  // Lock to landscape while presenting - a 16:9 box letterboxed inside a
  // portrait phone screen comes out tiny (and, worse, its content overflows
  // the box and gets clipped by the box's overflow:"hidden"), since a
  // widescreen box is always short when width-constrained by a narrow
  // portrait screen. Rotating the device view itself gives the box the full
  // screen to work with, matching how a real presentation viewer behaves.
  useEffect(() => {
    lockLandscape();
    return () => {
      lockPortrait();
    };
  }, []);

  // useWindowDimensions (not a one-time Dimensions.get) - it re-renders when
  // the orientation lock above actually rotates the screen, so the box is
  // sized for the new landscape dimensions, not the portrait ones read before
  // rotation happened.
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const availableWidth = screenWidth - 32;
  const availableHeight = screenHeight - 90;
  const boxWidth = Math.min(availableWidth, availableHeight * (16 / 9));
  const boxHeight = boxWidth * (9 / 16);
  // Recomputed whenever the box's real, per-device width changes (screen
  // rotation, a different phone, a tablet) - every size inside a slide
  // scales off this, not a number tuned for one screen.
  const scale = boxScale(boxWidth);
  const ss = useScaledSlideStyles(scale);

  function goTo(newIndex: number) {
    const clamped = Math.max(0, Math.min(slides.length - 1, newIndex));
    pagerRef.current?.setPage(clamped);
  }

  return (
    <View style={styles.slideshowRoot}>
      <View style={[styles.slideshowBoxWrap, { height: screenHeight }]}>
        <View style={[styles.slideshowBox, { width: boxWidth, height: boxHeight, backgroundColor: scheme.background }]}>
          <PagerView ref={pagerRef} style={{ flex: 1 }} initialPage={initialIndex} onPageSelected={(e) => setIndex(e.nativeEvent.position)}>
            {slides.map((slide, i) => (
              <View key={i} style={styles.slidePageOuter}>
                <SlideContent slide={slide} scheme={scheme} logoUrl={logoUrl} isInstructional={isInstructional} index={i} scale={scale} media={mediaFor(slide)} />
                {/* Tap zones live inside each page (not overlaid on top of the
                    whole PagerView) so a plain tap navigates without stealing
                    the native pager's own swipe-gesture recognition. */}
                <Pressable style={styles.tapZoneLeft} onPress={() => goTo(i - 1)} accessibilityRole="button" accessibilityLabel="Previous slide" />
                <Pressable style={styles.tapZoneRight} onPress={() => goTo(i + 1)} accessibilityRole="button" accessibilityLabel="Next slide" />
              </View>
            ))}
          </PagerView>
          {footerLabel ? (
            <Text style={[styles.slideFooterLabel, ss.slideFooterLabel, { color: scheme.accent }]} numberOfLines={1}>{footerLabel}</Text>
          ) : null}
        </View>
      </View>

      <Pressable style={styles.closeButton} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close presentation">
        <Ionicons name="close" size={22} color="#FFFFFF" />
      </Pressable>

      <View style={styles.slideshowFooter}>
        <Text style={styles.slideCounter}>{index + 1} / {slides.length}</Text>
      </View>
    </View>
  );
}

const LAYOUT_PICKER_OPTIONS: PresentationSlideLayout[] = ["bullets", "title", "stat", "quote", "divider", "stat-grid", "timeline", "icon-grid"];

function SlideEditor({
  initial,
  colors,
  onCancel,
  onDone,
}: {
  initial: { layout?: PresentationSlideLayout; title: string; bullets: string[] };
  colors: any;
  onCancel: () => void;
  onDone: (v: { layout: PresentationSlideLayout; title: string; bullets: string[] }) => void;
}) {
  const resolved = resolveLayout(initial as PresentationContent["slides"][number]);
  const initialLayout: PresentationSlideLayout = resolved === "image-left" || resolved === "image-right" ? "bullets" : resolved;
  const [layout, setLayout] = useState<PresentationSlideLayout>(initialLayout);
  const [title, setTitle] = useState(initial.title);
  const [bulletsText, setBulletsText] = useState(initial.bullets.join("\n"));
  return (
    <View>
      <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Layout</Text>
      <View style={styles.layoutPickerRow}>
        {LAYOUT_PICKER_OPTIONS.map((l) => {
          const active = layout === l;
          return (
            <Pressable
              key={l}
              onPress={() => setLayout(l)}
              style={[styles.layoutPickerButton, { backgroundColor: active ? colors.accent : colors.surfaceRaised, borderColor: active ? colors.accent : colors.border }]}
              accessibilityRole="button"
              accessibilityLabel={l}
              accessibilityState={{ selected: active }}
            >
              <Ionicons name={LAYOUT_ICONS[l]} size={16} color={active ? colors.accentOn : colors.textMuted} />
            </Pressable>
          );
        })}
      </View>
      {layout === "stat-grid" || layout === "timeline" || layout === "icon-grid" ? (
        <Text style={[styles.layoutNote, { color: colors.textMuted }]}>
          Grid/timeline items aren't editable here yet - edit the title and bullets below, or regenerate for new items.
        </Text>
      ) : null}
      <Text style={[styles.fieldLabel, { color: colors.textMuted, marginTop: spacing.xs }]}>Title</Text>
      <TextInput style={[styles.input, { color: colors.textPrimary, borderColor: colors.border }]} value={title} onChangeText={setTitle} autoFocus />
      <Text style={[styles.fieldLabel, { color: colors.textMuted, marginTop: spacing.xs }]}>Bullets (one per line)</Text>
      <TextInput
        style={[styles.multilineInput, { color: colors.textPrimary, borderColor: colors.border }]}
        value={bulletsText}
        onChangeText={setBulletsText}
        multiline
      />
      <EditActionRow
        onCancel={onCancel}
        onDone={() =>
          onDone({
            layout,
            title: title.trim() || initial.title,
            bullets: bulletsText.split("\n").map((b) => b.trim()).filter(Boolean),
          })
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  slideTitle: { fontSize: 15, fontFamily: typography.bold, marginBottom: 6 },
  editLayoutTag: { flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 6 },
  editLayoutTagText: { fontSize: 10, fontFamily: typography.semiBold, textTransform: "uppercase", letterSpacing: 0.3 },
  bulletRow: { flexDirection: "row", alignItems: "flex-start", gap: 8, marginBottom: 4 },
  bulletDot: { width: 5, height: 5, borderRadius: 3, marginTop: 7 },
  bulletText: { flex: 1, fontSize: 13, lineHeight: 19 },
  fieldLabel: { fontSize: 11, fontFamily: typography.semiBold, textTransform: "uppercase" },
  layoutNote: { fontSize: 11, marginTop: 6, fontStyle: "italic" },
  input: { borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13 },
  multilineInput: { borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13, minHeight: 70, textAlignVertical: "top" },
  addButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderWidth: 1.5, borderStyle: "dashed", borderRadius: radius.md, paddingVertical: 12, marginTop: spacing.xs },
  addButtonText: { fontSize: 14, fontFamily: typography.semiBold },
  layoutPickerRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 6 },
  layoutPickerButton: { width: 34, height: 34, borderRadius: 10, borderWidth: 1, alignItems: "center", justifyContent: "center" },

  // Landscape (16:9) tiles, one per row - matches the exported deck's aspect ratio.
  grid: { gap: 10 },
  // justifyContent no longer "flex-end" - a mini visual (see TileVisual) now
  // fills the middle of the tile instead of leaving it blank, with the
  // top badge row and bottom title/caption as normal flex children around it.
  // space-between (not flex-end) - pins the top badge row and the bottom
  // title/caption to opposite edges regardless of whether there's a middle
  // TileVisual child, so the space between them is always actually used
  // instead of collapsing into one blank gap at the top.
  tile: { width: "100%", aspectRatio: 16 / 9, borderRadius: 16, padding: 14, justifyContent: "space-between", overflow: "hidden" },
  tileImageRadius: { borderRadius: 16 },
  tileImageOverlay: { backgroundColor: "rgba(0,0,0,0.38)" },
  tileTopRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
  tileLogo: { width: 28, height: 28 },
  tileNumber: { fontSize: 12, fontFamily: typography.bold },
  tileTitle: { fontSize: 16, fontFamily: typography.bold },
  tileBullet: { fontSize: 12, marginTop: 6, lineHeight: 16 },
  stepBadge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  stepBadgeText: { fontSize: 9, fontFamily: typography.bold, color: "#111111", letterSpacing: 0.3 },
  // Mini per-layout tile visuals (fills the space between the top badge row
  // and the bottom title/caption instead of leaving it blank).
  tileVisual: { flex: 1, alignItems: "center", justifyContent: "center" },
  tileStatValue: { fontSize: 30, fontFamily: typography.bold },
  tileQuoteMark: { fontSize: 46, fontFamily: typography.bold, lineHeight: 46 },
  tileGridRow: { flexDirection: "row", gap: 6, alignItems: "center" },
  tileGridBox: { width: 34, height: 26, borderRadius: 6, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  tileGridBoxText: { fontSize: 9, fontFamily: typography.bold },
  tileTimelineDot: { width: 14, height: 14, borderRadius: 7, alignItems: "center", justifyContent: "center" },
  tileTimelineLine: { width: 14, height: 2 },
  tileIconCircle: { width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  tileIconImage: { width: 13, height: 13, tintColor: "#FFFFFF" },
  tileAccentBar: { width: 32, height: 3, borderRadius: 2 },
  tileBulletMiniList: { alignItems: "flex-start", justifyContent: "center", gap: 5, alignSelf: "stretch" },
  tileBulletMiniRow: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "stretch" },
  tileBulletMiniDot: { width: 4, height: 4, borderRadius: 2 },
  tileBulletMiniText: { flex: 1, fontSize: 10, lineHeight: 13 },

  slideshowRoot: { flex: 1, backgroundColor: "#000000" },
  slideshowBoxWrap: { alignItems: "center", justifyContent: "center" },
  slideshowBox: { borderRadius: 8, overflow: "hidden" },
  slidePageOuter: { flex: 1 },
  slidePageInner: { flex: 1, alignItems: "flex-start", justifyContent: "center", paddingHorizontal: 28, paddingVertical: 24 },
  slideCenterBox: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 24 },
  titleLayoutText: { fontSize: 26, lineHeight: 32, fontFamily: typography.bold, textAlign: "center" },
  statText: { fontSize: 52, fontFamily: typography.bold, textAlign: "center" },
  statCaption: { fontSize: 14, marginTop: 10, textAlign: "center" },
  quoteText: { fontSize: 20, fontStyle: "italic", fontFamily: typography.semiBold, textAlign: "center", lineHeight: 27 },
  quoteAttribution: { fontSize: 13, marginTop: 10, textAlign: "center" },
  imageSplitRow: { flex: 1, flexDirection: "row" },
  imageSplitImage: { width: "50%", height: "100%" },
  imageSplitText: { width: "50%", height: "100%", justifyContent: "center", paddingHorizontal: 18, paddingVertical: 18 },
  stepBadgeLarge: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5, marginBottom: 12, alignSelf: "flex-start" },
  stepBadgeLargeText: { fontSize: 10, fontFamily: typography.bold, color: "#111111", letterSpacing: 0.4 },
  bloomBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, marginBottom: 8, alignSelf: "flex-start" },
  bloomBadgeText: { fontSize: 9, fontFamily: typography.bold, color: "#111111", letterSpacing: 0.4 },
  slideshowTitle: { fontSize: 20, lineHeight: 25, fontFamily: typography.bold, marginBottom: 14 },
  // alignSelf: "stretch" is load-bearing here, not decoration - the parent
  // uses alignItems: "flex-start" (so the step badge/title hug their content
  // instead of stretching full-width), which means every direct child
  // shrink-wraps to its own content width by default. Without this override,
  // this list collapses to zero width, and the flex:1 bullet text below has
  // nothing to grow into - it silently renders at ~0px (dot visible, text
  // isn't) instead of erroring.
  slideshowBulletList: { gap: 10, alignSelf: "stretch" },
  slideshowBulletRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  slideshowBulletDot: { width: 6, height: 6, borderRadius: 3, marginTop: 7 },
  slideshowBulletText: { flex: 1, fontSize: 13, lineHeight: 19 },
  slideshowLogo: { position: "absolute", top: 16, right: 16, width: 28, height: 28 },
  slideFooterLabel: { position: "absolute", bottom: 8, right: 16, fontSize: 9, fontFamily: typography.semiBold },

  // Stat-grid layout
  statGridRow: { flexDirection: "row", gap: 10, alignSelf: "stretch", marginTop: 4 },
  statGridBox: { flex: 1, borderWidth: 1, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 6, alignItems: "center" },
  statGridValue: { fontSize: 20, fontFamily: typography.bold },
  statGridLabel: { fontSize: 9, marginTop: 4, textAlign: "center" },
  statGridParagraph: { fontSize: 11, lineHeight: 16, marginTop: 12, alignSelf: "stretch" },

  // Timeline layout
  timelineRow: { flexDirection: "row", gap: 8, alignSelf: "stretch", marginTop: 4 },
  timelineCol: { flex: 1 },
  timelineCircleRow: { flexDirection: "row", alignItems: "center" },
  timelineCircle: { width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  timelineCircleText: { fontSize: 10, fontFamily: typography.bold, color: "#FFFFFF" },
  timelineLine: { flex: 1, height: 2 },
  timelineCard: { borderWidth: 1, borderRadius: 8, padding: 8, marginTop: 8, minHeight: 80 },
  timelineTitle: { fontSize: 11, fontFamily: typography.bold },
  timelineTag: { fontSize: 9, marginTop: 3, fontFamily: typography.semiBold },
  timelineDescription: { fontSize: 9, marginTop: 3, lineHeight: 13 },

  // Icon-grid layout
  iconGridRow: { flexDirection: "row", flexWrap: "wrap", gap: 10, alignSelf: "stretch", marginTop: 4 },
  iconGridCard: { flexGrow: 1, flexBasis: "45%", borderWidth: 1, borderRadius: 10, padding: 10, alignItems: "center" },
  iconGridBadge: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", marginBottom: 8 },
  iconGridBadgeImage: { width: 18, height: 18, tintColor: "#FFFFFF" },
  iconGridTitle: { fontSize: 12, fontFamily: typography.bold, textAlign: "center" },
  iconGridDescription: { fontSize: 10, marginTop: 4, textAlign: "center", lineHeight: 14 },

  tapZoneLeft: { position: "absolute", top: 0, bottom: 0, left: 0, width: "30%" },
  tapZoneRight: { position: "absolute", top: 0, bottom: 0, right: 0, width: "30%" },
  closeButton: { position: "absolute", top: 50, right: 20, width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center" },
  slideshowFooter: { position: "absolute", bottom: 20, alignSelf: "center" },
  slideCounter: { fontSize: 13, fontFamily: typography.semiBold, color: "#C7C4F5" },
});
