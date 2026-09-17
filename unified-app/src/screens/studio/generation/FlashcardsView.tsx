import { useRef, useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, Animated, Image, LayoutAnimation } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../../theme/ThemeContext";
import { radius, spacing, typography } from "../../../theme/tokens";
import { FlashcardsContent } from "./content";
import { NumberedEditCard, EditActionRow } from "./NumberedEditCard";
import { pickIconForText, pickIconForCard } from "./topicIcons";

interface Props {
  content: FlashcardsContent;
  editable: boolean;
  onChange: (content: FlashcardsContent) => void;
}

// A card's front is almost always phrased as a generic question ("What is
// ...?", "Why does ...?"), which rarely contains any of pickIconForText's
// topic keywords - matching against it alone meant nearly every card fell
// through to the default "book" icon. keyTerms (when present) are real
// topic nouns pulled from the answer specifically for icon-matching; the
// back/front text is only a fallback for cards generated before that field
// existed.
function heroIconText(card: FlashcardsContent["cards"][number]): string {
  return [...(card.keyTerms ?? []), card.back, card.front].join(" ");
}

// Old generations (and an occasionally-disobedient model) can still carry a
// leading "[Understand]"-style Bloom's Taxonomy tag meant for internal
// objectives lists, not literal card text - pull it out and show it as a
// small pill instead of raw brackets. Same fix already applied to
// presentation slide titles - see splitBloomTag in PresentationView.tsx.
const BLOOM_TAG_RE = /^\[(Remember|Understand|Apply|Analyze|Evaluate|Create)\]\s*/i;
function splitBloomTag(text: string): { tag: string | null; text: string } {
  const match = text.match(BLOOM_TAG_RE);
  if (!match) return { tag: null, text };
  return { tag: match[1], text: text.slice(match[0].length) };
}

// Front/back badge colors - fixed hex, not theme tokens, same "small curated
// palette hardcoded alongside the theme" precedent already used for
// presentation color schemes elsewhere in this app. Distinct hues (not just
// the one accent color) are what let a glance tell you which face you're on.
const FRONT_COLOR = "#6C5CE7";
const BACK_COLOR = "#2FAE66";

export function FlashcardsView({ content, editable, onChange }: Props) {
  const { colors, cardShadow } = useTheme();

  function updateCard(i: number, patch: Partial<FlashcardsContent["cards"][number]>) {
    const cards = [...content.cards];
    cards[i] = { ...cards[i], ...patch };
    onChange({ ...content, cards });
  }
  function removeCard(i: number) {
    onChange({ ...content, cards: content.cards.filter((_, idx) => idx !== i) });
  }
  function addCard() {
    onChange({ ...content, cards: [...content.cards, { front: "New question", back: "New answer" }] });
  }

  // Editing stays a scrollable list (bulk-editing many cards benefits from
  // seeing them all at once) - only the read/study view becomes a one-card-
  // at-a-time deck, which is what studying from flashcards actually looks
  // like (and was the point of the client's flip-animation ask in the first
  // place - a wall of cards flipping independently didn't read as a deck).
  if (editable) {
    return (
      <View>
        {content.cards.map((card, i) => (
          <NumberedEditCard
            key={i}
            index={i}
            editable
            onRemove={content.cards.length > 1 ? () => removeCard(i) : undefined}
            renderView={() => <FlipCard card={card} colors={colors} cardShadow={cardShadow} />}
            renderEditor={(done, cancel) => (
              <CardEditor initial={card} colors={colors} onCancel={cancel} onDone={(v) => { updateCard(i, v); done(); }} />
            )}
          />
        ))}
        <Pressable style={[styles.addButton, { borderColor: colors.accent }]} onPress={addCard} accessibilityRole="button">
          <Ionicons name="add" size={16} color={colors.accent} />
          <Text style={[styles.addButtonText, { color: colors.accent }]}>Add flashcard</Text>
        </Pressable>
      </View>
    );
  }

  return <FlashcardDeck cards={content.cards} colors={colors} cardShadow={cardShadow} />;
}

function FlashcardDeck({ cards, colors, cardShadow }: { cards: FlashcardsContent["cards"]; colors: any; cardShadow: object }) {
  const [index, setIndex] = useState(0);
  const total = cards.length;

  function go(next: number) {
    if (next < 0 || next >= total) return;
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setIndex(next);
  }

  return (
    <View>
      <View style={styles.deckHeaderRow}>
        <Text style={[styles.deckHeaderText, { color: colors.textPrimary }]}>Card {index + 1} of {total}</Text>
        <View style={styles.dotsRow}>
          {cards.map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                { backgroundColor: i === index ? colors.accent : colors.border },
                i === index && styles.dotActive,
              ]}
            />
          ))}
        </View>
      </View>

      <FlipCard key={index} card={cards[index]} colors={colors} cardShadow={cardShadow} showIcon iconIndex={index} />

      <View style={styles.navRow}>
        <Pressable
          onPress={() => go(index - 1)}
          disabled={index === 0}
          style={({ pressed }) => [styles.navButton, { borderColor: colors.border }, (index === 0 || pressed) && { opacity: 0.4 }]}
          accessibilityRole="button"
          accessibilityLabel="Previous flashcard"
        >
          <Ionicons name="arrow-back" size={16} color={colors.textPrimary} />
          <Text style={[styles.navButtonText, { color: colors.textPrimary }]}>Previous</Text>
        </Pressable>
        <Text style={[styles.navCounter, { color: colors.textMuted }]}>{index + 1} / {total}</Text>
        <Pressable
          onPress={() => go(index + 1)}
          disabled={index === total - 1}
          style={({ pressed }) => [styles.navButton, styles.navButtonPrimary, { backgroundColor: colors.accent }, (index === total - 1 || pressed) && { opacity: 0.4 }]}
          accessibilityRole="button"
          accessibilityLabel="Next flashcard"
        >
          <Text style={[styles.navButtonText, { color: colors.accentOn }]}>Next</Text>
          <Ionicons name="arrow-forward" size={16} color={colors.accentOn} />
        </Pressable>
      </View>
    </View>
  );
}

// A real card flip (front/back faces rotating on the Y axis, like a physical
// card turning over) rather than just swapping the text in place - the front
// and back are the same-sized box stacked on top of each other, each rotated
// 180deg apart, with backfaceVisibility: "hidden" so only whichever face is
// currently turned toward the viewer actually renders; animating the shared
// rotation value between 0 and 180deg is what makes it look like the card is
// physically turning over.
//
// The container's height tracks whichever face is CURRENTLY showing (not
// the taller of the two) - sizing to the max of both used to leave the
// shorter face sitting in a box padded out to fit the longer one, which is
// exactly the "too much empty space" complaint. LayoutAnimation (triggered
// by the caller on flip/navigation) smooths the resize instead of a jump cut.
function FlipCard({
  card,
  colors,
  cardShadow,
  showIcon,
  iconIndex,
}: {
  card: FlashcardsContent["cards"][number];
  colors: any;
  cardShadow: object;
  showIcon?: boolean;
  iconIndex?: number;
}) {
  const [showBack, setShowBack] = useState(false);
  const flip = useRef(new Animated.Value(0)).current;
  const [frontHeight, setFrontHeight] = useState(0);
  const [backHeight, setBackHeight] = useState(0);
  const activeHeight = Math.max(showBack ? backHeight : frontHeight, 120);

  function toggle() {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    Animated.spring(flip, {
      toValue: showBack ? 0 : 1,
      friction: 8,
      tension: 10,
      useNativeDriver: true,
    }).start();
    setShowBack((v) => !v);
  }

  const frontRotateY = flip.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "180deg"] });
  const backRotateY = flip.interpolate({ inputRange: [0, 1], outputRange: ["180deg", "360deg"] });

  const front = splitBloomTag(card.front);
  const back = splitBloomTag(card.back);

  return (
    <Pressable onPress={toggle} accessibilityRole="button" accessibilityLabel="Flip flashcard">
      <View style={[styles.flipCardStack, { height: activeHeight }]}>
        <Animated.View
          style={[
            styles.flipFace,
            cardShadow,
            { backgroundColor: colors.surface, borderColor: colors.border, transform: [{ perspective: 1200 }, { rotateY: frontRotateY }] },
          ]}
          pointerEvents={showBack ? "none" : "auto"}
          onLayout={(e) => setFrontHeight(e.nativeEvent.layout.height)}
        >
          <View style={styles.faceHeaderRow}>
            <View style={[styles.faceBadge, { backgroundColor: FRONT_COLOR }]}>
              <Text style={styles.faceBadgeText}>Q</Text>
            </View>
            <Ionicons name="sync-outline" size={14} color={colors.textMuted} />
          </View>
          {showIcon ? (
            <View style={[styles.faceIconWrap, { backgroundColor: colors.accentSoft }]}>
              <View style={[styles.faceIconInner, { backgroundColor: FRONT_COLOR }]}>
                <Image source={pickIconForCard(heroIconText(card), iconIndex ?? 0)} style={styles.faceIconImage} resizeMode="contain" />
              </View>
            </View>
          ) : null}
          {front.tag ? (
            <View style={[styles.bloomBadge, { backgroundColor: colors.accentSoft }]}>
              <Text style={[styles.bloomBadgeText, { color: colors.accent }]}>{front.tag.toUpperCase()}</Text>
            </View>
          ) : null}
          <Text style={[styles.cardText, { color: colors.textPrimary }]}>{front.text}</Text>
          <View style={[styles.faceDivider, { borderColor: colors.border }]} />
          <View style={styles.flipHintRow}>
            <Ionicons name="sync-outline" size={12} color={FRONT_COLOR} />
            <Text style={[styles.flipHintText, { color: FRONT_COLOR }]}>Tap to reveal</Text>
          </View>
        </Animated.View>
        <Animated.View
          style={[
            styles.flipFace,
            styles.flipFaceBack,
            cardShadow,
            { backgroundColor: colors.surface, borderColor: colors.border, transform: [{ perspective: 1200 }, { rotateY: backRotateY }] },
          ]}
          pointerEvents={showBack ? "auto" : "none"}
          onLayout={(e) => setBackHeight(e.nativeEvent.layout.height)}
        >
          <View style={styles.faceHeaderRow}>
            <View style={[styles.faceBadge, { backgroundColor: BACK_COLOR }]}>
              <Text style={styles.faceBadgeText}>A</Text>
            </View>
            <Ionicons name="sync-outline" size={14} color={colors.textMuted} />
          </View>
          {back.tag ? (
            <View style={[styles.bloomBadge, { backgroundColor: colors.accentSoft }]}>
              <Text style={[styles.bloomBadgeText, { color: colors.accent }]}>{back.tag.toUpperCase()}</Text>
            </View>
          ) : null}
          <Text style={[styles.cardText, { color: colors.textPrimary }]}>{back.text}</Text>
          {card.keyTerms && card.keyTerms.length > 0 ? (
            <View style={styles.keyTermsRow}>
              {card.keyTerms.slice(0, 3).map((term, ti) => (
                <View key={ti} style={styles.keyTermRow}>
                  {ti > 0 ? <Ionicons name="arrow-forward" size={12} color={colors.textMuted} style={styles.keyTermArrow} /> : null}
                  <View style={styles.keyTermItem}>
                    <View style={[styles.keyTermIconWrap, { backgroundColor: colors.accentSoft }]}>
                      <Image source={pickIconForText(term)} style={[styles.keyTermIconImage, { tintColor: BACK_COLOR }]} resizeMode="contain" />
                    </View>
                    <Text style={[styles.keyTermLabel, { color: colors.textMuted }]} numberOfLines={1}>{term}</Text>
                  </View>
                </View>
              ))}
            </View>
          ) : null}
          <View style={[styles.faceDivider, { borderColor: colors.border }]} />
          <View style={styles.flipHintRow}>
            <Ionicons name="sync-outline" size={12} color={BACK_COLOR} />
            <Text style={[styles.flipHintText, { color: BACK_COLOR }]}>Tap to see question again</Text>
          </View>
        </Animated.View>
      </View>
    </Pressable>
  );
}

function CardEditor({
  initial,
  colors,
  onCancel,
  onDone,
}: {
  initial: { front: string; back: string };
  colors: any;
  onCancel: () => void;
  onDone: (v: { front: string; back: string }) => void;
}) {
  const [front, setFront] = useState(initial.front);
  const [back, setBack] = useState(initial.back);
  return (
    <View>
      <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Front</Text>
      <TextInput
        style={[styles.multilineInput, { color: colors.textPrimary, borderColor: colors.border }]}
        value={front}
        onChangeText={setFront}
        multiline
        autoFocus
      />
      <Text style={[styles.fieldLabel, { color: colors.textMuted, marginTop: spacing.xs }]}>Back</Text>
      <TextInput
        style={[styles.multilineInput, { color: colors.textPrimary, borderColor: colors.border }]}
        value={back}
        onChangeText={setBack}
        multiline
      />
      <EditActionRow
        onCancel={onCancel}
        onDone={() => onDone({ front: front.trim() || initial.front, back: back.trim() || initial.back })}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  cardText: { fontSize: 16, lineHeight: 23, fontFamily: typography.semiBold, textAlign: "center" },
  // The front face is normal-flow (its own content sets its natural height,
  // unconstrained by the stack) - the back face is absolutely positioned
  // over the exact same box (top/left/right only, no bottom, so it also
  // still sizes to its own content rather than being stretched to match).
  // backfaceVisibility: "hidden" is what makes only the face currently
  // turned toward the viewer actually show.
  flipCardStack: { position: "relative" },
  flipFace: {
    backfaceVisibility: "hidden",
    borderWidth: 1,
    borderRadius: 20,
    padding: 20,
    alignItems: "center",
    minHeight: 120,
  },
  flipFaceBack: { position: "absolute", top: 0, left: 0, right: 0 },
  faceHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", alignSelf: "stretch", marginBottom: 12 },
  bloomBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, marginBottom: 8 },
  bloomBadgeText: { fontSize: 9, fontFamily: typography.bold, letterSpacing: 0.4 },
  faceBadge: { paddingHorizontal: 10, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  faceBadgeText: { fontSize: 11, fontFamily: typography.bold, color: "#FFFFFF", letterSpacing: 0.5 },
  // Two-layer badge (soft outer halo + solid inner circle) rather than a
  // flat tinted icon on a flat background - reads as a proper hero graphic
  // instead of a small corner icon, without needing real illustration art.
  faceIconWrap: { width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center", marginBottom: 14 },
  faceIconInner: { width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center" },
  faceIconImage: { width: 26, height: 26 },
  faceDivider: { alignSelf: "stretch", borderTopWidth: 1, borderStyle: "dashed", marginTop: 16, marginBottom: 10 },
  keyTermsRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "center", flexWrap: "wrap", gap: 4, marginTop: 14 },
  keyTermRow: { flexDirection: "row", alignItems: "center" },
  keyTermArrow: { marginHorizontal: 4, marginTop: 14 },
  keyTermItem: { alignItems: "center", width: 62 },
  keyTermIconWrap: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  keyTermIconImage: { width: 16, height: 16 },
  keyTermLabel: { fontSize: 10, fontFamily: typography.medium, textAlign: "center" },
  flipHintRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  flipHintText: { fontSize: 12, fontFamily: typography.semiBold },
  fieldLabel: { fontSize: 11, fontFamily: typography.semiBold, textTransform: "uppercase" },
  multilineInput: { borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13, minHeight: 50, textAlignVertical: "top" },
  addButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderWidth: 1.5, borderStyle: "dashed", borderRadius: radius.md, paddingVertical: 12, marginTop: spacing.xs },
  addButtonText: { fontSize: 14, fontFamily: typography.semiBold },

  deckHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  deckHeaderText: { fontSize: 13, fontFamily: typography.bold },
  dotsRow: { flexDirection: "row", gap: 5 },
  dot: { width: 5, height: 5, borderRadius: 3 },
  dotActive: { width: 14 },
  navRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 16 },
  navButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderWidth: 1, borderRadius: radius.pill, paddingVertical: 12, paddingHorizontal: 16, flex: 1 },
  navButtonPrimary: { borderWidth: 0 },
  navButtonText: { fontSize: 13, fontFamily: typography.semiBold },
  navCounter: { fontSize: 13, fontFamily: typography.bold },
});
