import { useMemo, useState } from "react";
import { View, Text, Pressable, StyleSheet, ScrollView } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { RootStackParamList } from "../../navigation/types";
import { useTheme } from "../../theme/ThemeContext";
import { Screen } from "../../components/Screen";
import { slidesPerClassRange } from "./generation/content";

type Props = NativeStackScreenProps<RootStackParamList, "PresentationClasses">;

const MAX_CLASSES = 3;

// Step 6: "The teacher selects the number of classes first... At the same
// time a teacher is shown slides-per-class live as the teacher changes the
// number of classes."
export function PresentationClassesScreen({ route, navigation }: Props) {
  const { topicId, presentationReason } = route.params;
  const { colors, pressedOpacity, cardShadow } = useTheme();

  const [classes, setClasses] = useState(1);
  const range = useMemo(() => slidesPerClassRange(classes), [classes]);
  const bandMin = range.min * classes;
  const bandMax = range.max * classes;
  const [totalSlides, setTotalSlides] = useState(Math.round((range.min * 1 + range.max * 1) / 2));

  // Rescale the current slide count proportionally into the new band
  // whenever the class count changes, instead of leaving it clamped at
  // whatever edge it happened to land on - same pattern already used for
  // AssignmentAiSetupScreen's question-count rescale.
  function changeClasses(next: number) {
    const clamped = Math.max(1, Math.min(MAX_CLASSES, next));
    if (clamped === classes) return;
    const nextRange = slidesPerClassRange(clamped);
    const nextMin = nextRange.min * clamped;
    const nextMax = nextRange.max * clamped;
    const prevMin = range.min * classes;
    const prevMax = range.max * classes;
    const ratio = prevMax === prevMin ? 0.5 : (totalSlides - prevMin) / (prevMax - prevMin);
    const rescaled = Math.round(nextMin + ratio * (nextMax - nextMin));
    setClasses(clamped);
    setTotalSlides(Math.max(nextMin, Math.min(nextMax, rescaled)));
  }

  function changeSlides(delta: number) {
    setTotalSlides((prev) => Math.max(bandMin, Math.min(bandMax, prev + delta)));
  }

  function continueToDensity() {
    navigation.navigate("PresentationDensity", { topicId, presentationReason, presentationClasses: classes, totalSlides });
  }

  return (
    <Screen edges={["top", "bottom"]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.topBar}>
          <Pressable
            style={({ pressed }) => [styles.backButton, { backgroundColor: colors.surface, borderColor: colors.border }, pressed && { opacity: pressedOpacity }]}
            onPress={() => navigation.goBack()}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
          </Pressable>
          <View style={styles.topCopy}>
            <Text style={[styles.topTitle, { color: colors.textPrimary }]}>Classes &amp; slides</Text>
            <Text style={[styles.topSubtitle, { color: colors.textMuted }]} numberOfLines={1}>
              How many classes will this take?
            </Text>
          </View>
        </View>

        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, cardShadow]}>
          <Text style={[styles.cardLabel, { color: colors.textPrimary }]}>Number of classes</Text>
          <Text style={[styles.cardHint, { color: colors.textMuted }]}>Max 3 - more than that and one topic stops making sense as a single deck.</Text>
          <View style={styles.classRow}>
            {[1, 2, 3].map((n) => {
              const active = classes === n;
              return (
                <Pressable
                  key={n}
                  style={({ pressed }) => [styles.classChip, { backgroundColor: active ? colors.accent : colors.surfaceRaised, borderColor: active ? colors.accent : colors.border }, pressed && { opacity: pressedOpacity }]}
                  onPress={() => changeClasses(n)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                >
                  <Text style={[styles.classChipText, { color: active ? colors.accentOn : colors.textPrimary }]}>{n}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, cardShadow]}>
          <Text style={[styles.cardLabel, { color: colors.textPrimary }]}>Number of slides</Text>
          <Text style={[styles.cardHint, { color: colors.textMuted }]}>
            {range.min}-{range.max} slides per class at {classes} class{classes === 1 ? "" : "es"} · {bandMin}-{bandMax} total
          </Text>
          <View style={styles.stepperRow}>
            <Pressable
              style={({ pressed }) => [styles.stepperButton, { borderColor: colors.border }, pressed && { opacity: pressedOpacity }]}
              onPress={() => changeSlides(-1)}
              disabled={totalSlides <= bandMin}
              accessibilityRole="button"
              accessibilityLabel="Fewer slides"
            >
              <Ionicons name="remove" size={20} color={totalSlides <= bandMin ? colors.textMuted : colors.accent} />
            </Pressable>
            <Text style={[styles.stepperValue, { color: colors.textPrimary }]}>{totalSlides}</Text>
            <Pressable
              style={({ pressed }) => [styles.stepperButton, { borderColor: colors.border }, pressed && { opacity: pressedOpacity }]}
              onPress={() => changeSlides(1)}
              disabled={totalSlides >= bandMax}
              accessibilityRole="button"
              accessibilityLabel="More slides"
            >
              <Ionicons name="add" size={20} color={totalSlides >= bandMax ? colors.textMuted : colors.accent} />
            </Pressable>
          </View>
          {classes > 1 ? (
            <Text style={[styles.cardHint, { color: colors.textMuted, marginTop: 10 }]}>
              A class-break slide is added automatically between each class.
            </Text>
          ) : null}
        </View>

        <View style={styles.footer}>
          <Pressable
            style={({ pressed }) => [styles.continueButton, { backgroundColor: colors.accent }, pressed && { opacity: pressedOpacity }]}
            onPress={continueToDensity}
            accessibilityRole="button"
          >
            <Text style={[styles.continueText, { color: colors.accentOn }]}>Continue</Text>
            <Ionicons name="arrow-forward" size={19} color={colors.accentOn} />
          </Pressable>
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 34 },
  topBar: { minHeight: 48, flexDirection: "row", alignItems: "center" },
  backButton: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  topCopy: { flex: 1, marginLeft: 14 },
  topTitle: { fontSize: 21, lineHeight: 26, fontWeight: "800", letterSpacing: -0.5 },
  topSubtitle: { marginTop: 1, fontSize: 11, lineHeight: 15, fontWeight: "500" },
  card: { marginTop: 20, borderWidth: 1, borderRadius: 16, padding: 16 },
  cardLabel: { fontSize: 15, fontWeight: "800" },
  cardHint: { marginTop: 4, fontSize: 12, lineHeight: 17, fontWeight: "500" },
  classRow: { flexDirection: "row", gap: 10, marginTop: 14 },
  classChip: { flex: 1, height: 48, borderRadius: 12, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  classChipText: { fontSize: 17, fontWeight: "800" },
  stepperRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 24, marginTop: 16 },
  stepperButton: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  stepperValue: { fontSize: 28, fontWeight: "800", minWidth: 56, textAlign: "center" },
  footer: { marginTop: 26 },
  continueButton: { height: 55, borderRadius: 15, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9 },
  continueText: { fontSize: 15, fontWeight: "800" },
});
