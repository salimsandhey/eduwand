import { useState } from "react";
import { Modal, View, Text, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../theme/ThemeContext";

interface TourStep {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
}

const STEPS: TourStep[] = [
  {
    icon: "school-outline",
    title: "Welcome to EduWand",
    body: "A quick look around before you get started - this takes less than a minute.",
  },
  {
    icon: "albums-outline",
    title: "Studio",
    body: "Create classes, subjects, and lesson topics here. Everything you teach starts in Studio.",
  },
  {
    icon: "document-text-outline",
    title: "Assignments",
    body: "Build assignments manually or with AI, publish them to a class, and review submissions as they come in.",
  },
  {
    icon: "stats-chart-outline",
    title: "Analytics",
    body: "Track attainment and see how your classes are progressing over time.",
  },
  {
    icon: "menu-outline",
    title: "More",
    body: "Your profile, credits balance, students roster, and getting-started checklist all live under More.",
  },
];

interface TeacherTourModalProps {
  visible: boolean;
  onDone: () => void;
}

export function TeacherTourModal({ visible, onDone }: TeacherTourModalProps) {
  const { colors, cardShadow, pressedOpacity } = useTheme();
  const [stepIndex, setStepIndex] = useState(0);
  const step = STEPS[stepIndex];
  const isLast = stepIndex === STEPS.length - 1;

  function handleNext() {
    if (isLast) {
      onDone();
      setStepIndex(0);
    } else {
      setStepIndex((i) => i + 1);
    }
  }

  function handleSkip() {
    onDone();
    setStepIndex(0);
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleSkip}>
      <View style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, cardShadow]}>
          <Pressable onPress={handleSkip} style={styles.skipButton} hitSlop={10} accessibilityRole="button" accessibilityLabel="Skip tour">
            <Text style={[styles.skipText, { color: colors.textSecondary }]}>Skip</Text>
          </Pressable>

          <View style={[styles.iconWrap, { backgroundColor: colors.accentSoft }]}>
            <Ionicons name={step.icon} size={32} color={colors.accent} />
          </View>

          <Text style={[styles.title, { color: colors.textPrimary }]}>{step.title}</Text>
          <Text style={[styles.body, { color: colors.textSecondary }]}>{step.body}</Text>

          <View style={styles.dots}>
            {STEPS.map((_, i) => (
              <View
                key={i}
                style={[
                  styles.dot,
                  { backgroundColor: i === stepIndex ? colors.accent : colors.border },
                ]}
              />
            ))}
          </View>

          <Pressable
            style={({ pressed }) => [styles.nextButton, { backgroundColor: colors.accent }, pressed && { opacity: pressedOpacity }]}
            onPress={handleNext}
            accessibilityRole="button"
          >
            <Text style={[styles.nextButtonText, { color: colors.accentOn }]}>{isLast ? "Get started" : "Next"}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", alignItems: "center", justifyContent: "center", padding: 24 },
  card: { width: "100%", maxWidth: 380, borderWidth: 1, borderRadius: 20, padding: 24, alignItems: "center" },
  skipButton: { position: "absolute", top: 16, right: 16, padding: 4 },
  skipText: { fontSize: 13, fontWeight: "600" },
  iconWrap: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center", marginTop: 8, marginBottom: 16 },
  title: { fontSize: 18, fontWeight: "800", marginBottom: 8, textAlign: "center" },
  body: { fontSize: 14, lineHeight: 20, textAlign: "center", marginBottom: 20 },
  dots: { flexDirection: "row", gap: 6, marginBottom: 20 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  nextButton: { width: "100%", borderRadius: 12, paddingVertical: 14, alignItems: "center", justifyContent: "center" },
  nextButtonText: { fontWeight: "700", fontSize: 15 },
});
