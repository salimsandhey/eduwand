import { useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../../theme/ThemeContext";
import { radius, spacing, typography } from "../../../theme/tokens";
import { PresentationContent } from "./content";
import { NumberedEditCard, EditActionRow } from "./NumberedEditCard";

interface Props {
  content: PresentationContent;
  editable: boolean;
  onChange: (content: PresentationContent) => void;
}

export function PresentationView({ content, editable, onChange }: Props) {
  const { colors } = useTheme();

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
      {editable ? (
        <Pressable style={[styles.addButton, { borderColor: colors.accent }]} onPress={addSlide} accessibilityRole="button">
          <Ionicons name="add" size={16} color={colors.accent} />
          <Text style={[styles.addButtonText, { color: colors.accent }]}>Add slide</Text>
        </Pressable>
      ) : null}
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
});
