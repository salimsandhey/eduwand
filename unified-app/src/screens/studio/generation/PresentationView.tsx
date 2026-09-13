import { useRef, useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, Modal, Dimensions, Image, ImageBackground } from "react-native";
import PagerView from "react-native-pager-view";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../../theme/ThemeContext";
import { radius, spacing, typography } from "../../../theme/tokens";
import { PresentationContent, PresentationColorScheme } from "./content";
import { NumberedEditCard, EditActionRow } from "./NumberedEditCard";

interface Props {
  content: PresentationContent;
  editable: boolean;
  onChange: (content: PresentationContent) => void;
}

const COLOR_SCHEMES: Record<PresentationColorScheme, { background: string; accent: string; text: string; mutedText: string }> = {
  indigo: { background: "#2A2B6A", accent: "#8C7CFF", text: "#FFFFFF", mutedText: "#C7C4F5" },
  coral: { background: "#7A2E2E", accent: "#FF8A7A", text: "#FFFFFF", mutedText: "#F3C9C4" },
  forest: { background: "#1F3D2E", accent: "#6FD79B", text: "#FFFFFF", mutedText: "#BFE3CE" },
  slate: { background: "#2B2F36", accent: "#9FB4C7", text: "#FFFFFF", mutedText: "#C7D1DA" },
};

const STEP_PREFIX_RE = /^step\s*\d+[:.\-)]?\s*/i;

function stripStepPrefix(title: string): string {
  return title.replace(STEP_PREFIX_RE, "").trim() || title;
}

export function PresentationView({ content, editable, onChange }: Props) {
  const { colors } = useTheme();
  const [presentingIndex, setPresentingIndex] = useState<number | null>(null);
  // School format has no fixed preset - the school's own brand colors take
  // the place of a COLOR_SCHEMES entry (falls back to the default preset if
  // the school somehow has no branding configured when this renders).
  const scheme =
    content.template === "school_format" && (content.primaryColor || content.secondaryColor)
      ? {
          background: content.primaryColor ?? COLOR_SCHEMES.indigo.background,
          accent: content.secondaryColor ?? COLOR_SCHEMES.indigo.accent,
          text: "#FFFFFF",
          mutedText: "#E3E3F0",
        }
      : COLOR_SCHEMES[content.colorScheme ?? "indigo"];
  const isInstructional = content.template === "instructional";
  const logoUrl = content.template === "school_format" ? content.logoUrl : null;

  function updateSlide(i: number, patch: Partial<PresentationContent["slides"][number]>) {
    const slides = [...content.slides];
    slides[i] = { ...slides[i], ...patch };
    onChange({ ...content, slides });
  }
  function removeSlide(i: number) {
    onChange({ ...content, slides: content.slides.filter((_, idx) => idx !== i) });
  }
  function addSlide() {
    onChange({ ...content, slides: [...content.slides, { title: "New slide", bullets: ["Key point"] }] });
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
                <Text style={[styles.slideTitle, { color: colors.textPrimary }]}>{slide.title}</Text>
                {slide.bullets.map((b, bi) => (
                  <View key={bi} style={styles.bulletRow}>
                    <View style={[styles.bulletDot, { backgroundColor: colors.accent }]} />
                    <Text style={[styles.bulletText, { color: colors.textSecondary }]}>{b}</Text>
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
          const tileInner = (
            <>
              {isInstructional ? (
                <View style={[styles.stepBadge, { backgroundColor: scheme.accent }]}>
                  <Text style={styles.stepBadgeText}>STEP {i + 1}</Text>
                </View>
              ) : (
                <Text style={[styles.tileNumber, { color: scheme.mutedText }]}>{i + 1}</Text>
              )}
              {logoUrl ? <Image source={{ uri: logoUrl }} style={styles.tileLogo} resizeMode="contain" /> : null}
              <Text style={[styles.tileTitle, { color: slide.imageUrl ? "#FFFFFF" : scheme.text }]} numberOfLines={3}>
                {isInstructional ? stripStepPrefix(slide.title) : slide.title}
              </Text>
              <Text style={[styles.tileBullet, { color: slide.imageUrl ? "#EDEDED" : scheme.mutedText }]} numberOfLines={2}>
                {slide.bullets[0] ?? ""}
              </Text>
            </>
          );
          return slide.imageUrl ? (
            <Pressable key={i} style={({ pressed }) => [styles.tile, pressed && { opacity: 0.85 }]} onPress={() => setPresentingIndex(i)} accessibilityRole="button" accessibilityLabel={`Open slide ${i + 1}`}>
              <ImageBackground source={{ uri: slide.imageUrl }} style={StyleSheet.absoluteFillObject} imageStyle={styles.tileImageRadius}>
                <View style={[StyleSheet.absoluteFillObject, styles.tileImageOverlay, styles.tileImageRadius]} />
              </ImageBackground>
              {tileInner}
            </Pressable>
          ) : (
            <Pressable
              key={i}
              style={({ pressed }) => [styles.tile, { backgroundColor: scheme.background }, pressed && { opacity: 0.85 }]}
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
              logoUrl={logoUrl ?? null}
              onClose={() => setPresentingIndex(null)}
            />
          ) : null}
        </GestureHandlerRootView>
      </Modal>
    </View>
  );
}

function Slideshow({
  slides,
  initialIndex,
  isInstructional,
  scheme,
  logoUrl,
  onClose,
}: {
  slides: PresentationContent["slides"];
  initialIndex: number;
  isInstructional: boolean;
  scheme: { background: string; accent: string; text: string; mutedText: string };
  logoUrl: string | null;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(initialIndex);
  const screenHeight = Dimensions.get("window").height;
  const pagerRef = useRef<PagerView>(null);

  function goTo(newIndex: number) {
    const clamped = Math.max(0, Math.min(slides.length - 1, newIndex));
    pagerRef.current?.setPage(clamped);
  }

  return (
    <View style={[styles.slideshowRoot, { backgroundColor: scheme.background }]}>
      <PagerView
        ref={pagerRef}
        style={{ flex: 1 }}
        initialPage={initialIndex}
        onPageSelected={(e) => setIndex(e.nativeEvent.position)}
      >
        {slides.map((slide, i) => (
          <View key={i} style={[styles.slidePage, { minHeight: screenHeight }, !slide.imageUrl && { backgroundColor: scheme.background }]}>
            {slide.imageUrl ? (
              <ImageBackground source={{ uri: slide.imageUrl }} style={StyleSheet.absoluteFillObject}>
                <View style={[StyleSheet.absoluteFillObject, styles.slideImageOverlay]} />
              </ImageBackground>
            ) : null}
            {logoUrl ? <Image source={{ uri: logoUrl }} style={styles.slideshowLogo} resizeMode="contain" /> : null}
            {isInstructional ? (
              <View style={[styles.stepBadgeLarge, { backgroundColor: scheme.accent }]}>
                <Text style={styles.stepBadgeLargeText}>STEP {i + 1}</Text>
              </View>
            ) : null}
            <Text style={[styles.slideshowTitle, { color: slide.imageUrl ? "#FFFFFF" : scheme.text }]}>
              {isInstructional ? stripStepPrefix(slide.title) : slide.title}
            </Text>
            <View style={styles.slideshowBulletList}>
              {slide.bullets.map((b, bi) => (
                <View key={bi} style={styles.slideshowBulletRow}>
                  <View style={[styles.slideshowBulletDot, { backgroundColor: scheme.accent }]} />
                  <Text style={[styles.slideshowBulletText, { color: slide.imageUrl ? "#F0F0F0" : scheme.mutedText }]}>{b}</Text>
                </View>
              ))}
            </View>

            {/* Tap zones live inside each page (not overlaid on top of the
                whole PagerView) so a plain tap navigates without stealing
                the native pager's own swipe-gesture recognition. */}
            <Pressable
              style={styles.tapZoneLeft}
              onPress={() => goTo(i - 1)}
              accessibilityRole="button"
              accessibilityLabel="Previous slide"
            />
            <Pressable
              style={styles.tapZoneRight}
              onPress={() => goTo(i + 1)}
              accessibilityRole="button"
              accessibilityLabel="Next slide"
            />
          </View>
        ))}
      </PagerView>

      <Pressable style={styles.closeButton} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close presentation">
        <Ionicons name="close" size={22} color="#FFFFFF" />
      </Pressable>

      <View style={styles.slideshowFooter}>
        <Text style={[styles.slideCounter, { color: scheme.mutedText }]}>{index + 1} / {slides.length}</Text>
      </View>
    </View>
  );
}

function SlideEditor({
  initial,
  colors,
  onCancel,
  onDone,
}: {
  initial: { title: string; bullets: string[] };
  colors: any;
  onCancel: () => void;
  onDone: (v: { title: string; bullets: string[] }) => void;
}) {
  const [title, setTitle] = useState(initial.title);
  const [bulletsText, setBulletsText] = useState(initial.bullets.join("\n"));
  return (
    <View>
      <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Title</Text>
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
  bulletRow: { flexDirection: "row", alignItems: "flex-start", gap: 8, marginBottom: 4 },
  bulletDot: { width: 5, height: 5, borderRadius: 3, marginTop: 7 },
  bulletText: { flex: 1, fontSize: 13, lineHeight: 19 },
  fieldLabel: { fontSize: 11, fontFamily: typography.semiBold, textTransform: "uppercase" },
  input: { borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13 },
  multilineInput: { borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13, minHeight: 70, textAlignVertical: "top" },
  addButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderWidth: 1.5, borderStyle: "dashed", borderRadius: radius.md, paddingVertical: 12, marginTop: spacing.xs },
  addButtonText: { fontSize: 14, fontFamily: typography.semiBold },

  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  tile: { width: "47%", minHeight: 140, borderRadius: 16, padding: 14, justifyContent: "flex-end" },
  tileNumber: { position: "absolute", top: 12, left: 14, fontSize: 12, fontFamily: typography.bold },
  tileTitle: { fontSize: 14, fontFamily: typography.bold, marginTop: 20 },
  tileBullet: { fontSize: 11, marginTop: 6, lineHeight: 15 },
  stepBadge: { position: "absolute", top: 12, left: 12, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  stepBadgeText: { fontSize: 9, fontFamily: typography.bold, color: "#111111", letterSpacing: 0.3 },

  slideshowRoot: { flex: 1 },
  slidePage: { flex: 1, alignItems: "flex-start", justifyContent: "center", paddingHorizontal: 32, paddingVertical: 60 },
  stepBadgeLarge: { borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6, marginBottom: 18 },
  stepBadgeLargeText: { fontSize: 12, fontFamily: typography.bold, color: "#111111", letterSpacing: 0.5 },
  slideshowTitle: { fontSize: 28, lineHeight: 34, fontFamily: typography.bold, marginBottom: 24 },
  // alignSelf: "stretch" is load-bearing here, not decoration - slidePage
  // uses alignItems: "flex-start" (so the step badge/title hug their content
  // instead of stretching full-width), which means every direct child
  // shrink-wraps to its own content width by default. Without this override,
  // this list collapses to zero width, and the flex:1 bullet text below has
  // nothing to grow into - it silently renders at ~0px (dot visible, text
  // isn't) instead of erroring.
  slideshowBulletList: { gap: 14, alignSelf: "stretch" },
  slideshowBulletRow: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  slideshowBulletDot: { width: 8, height: 8, borderRadius: 4, marginTop: 8 },
  slideshowBulletText: { flex: 1, fontSize: 17, lineHeight: 25 },
  tapZoneLeft: { position: "absolute", top: 0, bottom: 0, left: 0, width: "35%" },
  tapZoneRight: { position: "absolute", top: 0, bottom: 0, right: 0, width: "35%" },
  closeButton: { position: "absolute", top: 50, right: 20, width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center" },
  slideshowFooter: { position: "absolute", bottom: 30, alignSelf: "center" },
  slideCounter: { fontSize: 13, fontFamily: typography.semiBold },
});
