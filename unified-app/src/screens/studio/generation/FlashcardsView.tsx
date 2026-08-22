import { useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../../theme/ThemeContext";
import { radius, spacing, typography } from "../../../theme/tokens";
import { FlashcardsContent } from "./content";
import { NumberedEditCard, EditActionRow } from "./NumberedEditCard";

interface Props {
  content: FlashcardsContent;
  editable: boolean;
  onChange: (content: FlashcardsContent) => void;
}

// Each card is tap-to-flip (front/back) when not editing, matching how a
// physical flashcard is used - not just two lines of text stacked.
export function FlashcardsView({ content, editable, onChange }: Props) {
  const { colors } = useTheme();

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

  return (
    <View>
      {content.cards.map((card, i) => (
        <NumberedEditCard
          key={i}
          index={i}
          editable={editable}
          onRemove={editable && content.cards.length > 1 ? () => removeCard(i) : undefined}
          renderView={() => <FlipCard card={card} colors={colors} />}
          renderEditor={(done, cancel) => (
            <CardEditor initial={card} colors={colors} onCancel={cancel} onDone={(v) => { updateCard(i, v); done(); }} />
          )}
        />
      ))}
      {editable ? (
        <Pressable style={[styles.addButton, { borderColor: colors.accent }]} onPress={addCard} accessibilityRole="button">
          <Ionicons name="add" size={16} color={colors.accent} />
          <Text style={[styles.addButtonText, { color: colors.accent }]}>Add flashcard</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function FlipCard({ card, colors }: { card: { front: string; back: string }; colors: any }) {
  const [showBack, setShowBack] = useState(false);
  return (
    <Pressable onPress={() => setShowBack((v) => !v)} accessibilityRole="button" accessibilityLabel="Flip flashcard">
      <View style={[styles.flipTag, { backgroundColor: colors.surfaceRaised }]}>
        <Ionicons name="sync-outline" size={11} color={colors.textMuted} />
        <Text style={[styles.flipTagText, { color: colors.textMuted }]}>{showBack ? "Answer" : "Question"} · tap to flip</Text>
      </View>
      <Text style={[styles.cardText, { color: colors.textPrimary }]}>{showBack ? card.back : card.front}</Text>
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
  flipTag: { flexDirection: "row", alignSelf: "flex-start", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill, marginBottom: 6 },
  flipTagText: { fontSize: 10, fontFamily: typography.medium },
  cardText: { fontSize: 14, lineHeight: 20, fontFamily: typography.semiBold },
  fieldLabel: { fontSize: 11, fontFamily: typography.semiBold, textTransform: "uppercase" },
  multilineInput: { borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13, minHeight: 50, textAlignVertical: "top" },
  addButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderWidth: 1.5, borderStyle: "dashed", borderRadius: radius.md, paddingVertical: 12, marginTop: spacing.xs },
  addButtonText: { fontSize: 14, fontFamily: typography.semiBold },
});
