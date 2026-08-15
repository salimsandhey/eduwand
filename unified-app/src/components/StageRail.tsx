import { useEffect, useRef } from "react";
import { View, Text, Pressable, ScrollView, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../theme/ThemeContext";
import { PipelineStage } from "../api/client";

interface StageRailProps {
  stages: PipelineStage[];
  currentKey: string;
  onSelect: (key: string) => void;
}

const STEP_WIDTH = 88;
const CIRCLE_SIZE = 28;

// Replaces the old horizontally-scrolling chip row with connected step nodes,
// so the pipeline reads as a linear progression (done / here / upcoming)
// rather than a set of interchangeable filter pills. Horizontally scrollable
// since pipeline stages are school-configured and can run past what fits on
// one screen (usePipelineStages).
export function StageRail({ stages, currentKey, onSelect }: StageRailProps) {
  const { colors, pressedOpacity } = useTheme();
  const scrollRef = useRef<ScrollView>(null);
  const currentIndex = stages.findIndex((s) => s.key === currentKey);

  useEffect(() => {
    if (currentIndex < 0) return;
    const x = Math.max(0, currentIndex * STEP_WIDTH - STEP_WIDTH);
    scrollRef.current?.scrollTo({ x, animated: false });
  }, [currentIndex]);

  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.scrollContent}
    >
      {stages.map((stage, index) => {
        const isDone = currentIndex >= 0 && index < currentIndex;
        const isCurrent = index === currentIndex;
        const isLast = index === stages.length - 1;

        const circleBg = isDone ? colors.accent : colors.surface;
        const circleBorder = isDone || isCurrent ? colors.accent : colors.border;
        const lineColor = isDone ? colors.accent : colors.border;

        return (
          <Pressable
            key={stage.key}
            onPress={() => onSelect(stage.key)}
            style={({ pressed }) => [styles.step, pressed && { opacity: pressedOpacity }]}
            accessibilityRole="button"
            accessibilityState={{ selected: isCurrent }}
          >
            <View style={styles.circleRow}>
              <View
                style={[
                  styles.circle,
                  { backgroundColor: circleBg, borderColor: circleBorder, borderWidth: isCurrent ? 2.5 : 1.5 },
                ]}
              >
                {isDone ? (
                  <Ionicons name="checkmark" size={14} color={colors.accentOn} />
                ) : (
                  <View style={[styles.dot, isCurrent && { backgroundColor: colors.accent }]} />
                )}
              </View>
              {!isLast ? <View style={[styles.line, { backgroundColor: lineColor }]} /> : null}
            </View>
            <Text
              numberOfLines={1}
              style={[
                styles.label,
                { color: isCurrent ? colors.textPrimary : isDone ? colors.textSecondary : colors.textMuted },
                isCurrent && styles.labelCurrent,
              ]}
            >
              {stage.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContent: { paddingBottom: 4, paddingRight: STEP_WIDTH / 2 },
  step: { width: STEP_WIDTH, alignItems: "center" },
  circleRow: { flexDirection: "row", alignItems: "center", width: "100%" },
  circle: {
    width: CIRCLE_SIZE,
    height: CIRCLE_SIZE,
    borderRadius: CIRCLE_SIZE / 2,
    alignItems: "center",
    justifyContent: "center",
  },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "transparent" },
  line: { flex: 1, height: 2, marginHorizontal: 2 },
  label: { fontSize: 11, fontWeight: "600", marginTop: 6, textAlign: "center" },
  labelCurrent: { fontWeight: "800" },
});
