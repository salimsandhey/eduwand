import { useState } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";

// Both components store their answer as a CSV of ORIGINAL indices - see
// backend/src/lib/ai.ts's parseIndexList/settleMcqQuestions, which grades by
// comparing this string, position by position, against "0,1,2,...N-1" (the
// stored pairs/items are already in correct correspondence/order, so that's
// trivially the correct answer). Only emitted once every item has been
// placed - a partial answer would misalign positions in the CSV, so it's
// safer to report "not answered yet" (empty string) than a corrupt one.

function shuffledIndices(count: number): number[] {
  const indices = Array.from({ length: count }, (_, i) => i);
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  return indices;
}

interface Colors {
  accent: string;
  accentOn: string;
  accentSoft: string;
  border: string;
  surface: string;
  surfaceRaised: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
}

export function MatchingQuestion({
  pairs,
  value,
  onChange,
  colors,
}: {
  pairs: { left: string; right: string }[];
  value: string;
  onChange: (value: string) => void;
  colors: Colors;
}) {
  // Stable for this component's lifetime - reshuffling on every keystroke
  // elsewhere on the screen would make the exercise impossible.
  const [rightOrder] = useState(() => shuffledIndices(pairs.length));
  const [selectedLeft, setSelectedLeft] = useState<number | null>(null);
  const [assignments, setAssignments] = useState<Record<number, number>>(() => {
    // Resume a previously-completed answer (e.g. reopening a draft submission).
    const parsed = value.split(",").map((n) => parseInt(n.trim(), 10));
    if (parsed.length !== pairs.length || parsed.some((n) => Number.isNaN(n))) return {};
    return Object.fromEntries(parsed.map((rightIndex, leftIndex) => [leftIndex, rightIndex]));
  });

  const assignedRightIndices = new Set(Object.values(assignments));

  function assign(leftIndex: number, rightIndex: number) {
    const next = { ...assignments, [leftIndex]: rightIndex };
    setAssignments(next);
    setSelectedLeft(null);
    const complete = pairs.every((_, i) => typeof next[i] === "number");
    onChange(complete ? pairs.map((_, i) => next[i]).join(",") : "");
  }

  function tapLeft(leftIndex: number) {
    setSelectedLeft((prev) => (prev === leftIndex ? null : leftIndex));
  }

  function tapRight(rightIndex: number) {
    if (selectedLeft === null) return;
    assign(selectedLeft, rightIndex);
  }

  return (
    <View>
      <Text style={[styles.hint, { color: colors.textMuted }]}>Tap an item on the left, then its match on the right.</Text>
      <View style={styles.matchRow}>
        <View style={styles.matchColumn}>
          {pairs.map((pair, leftIndex) => {
            const active = selectedLeft === leftIndex;
            const matchedRight = assignments[leftIndex];
            const done = typeof matchedRight === "number";
            return (
              <Pressable
                key={leftIndex}
                style={[
                  styles.matchChip,
                  { borderColor: active ? colors.accent : colors.border, backgroundColor: active ? colors.accentSoft : colors.surfaceRaised },
                ]}
                onPress={() => tapLeft(leftIndex)}
                accessibilityRole="button"
              >
                <Text style={[styles.matchChipText, { color: colors.textPrimary }]} numberOfLines={3}>{pair.left}</Text>
                {done ? <Ionicons name="checkmark-circle" size={16} color={colors.accent} /> : null}
              </Pressable>
            );
          })}
        </View>
        <View style={styles.matchColumn}>
          {rightOrder.map((originalIndex) => {
            const taken = assignedRightIndices.has(originalIndex);
            return (
              <Pressable
                key={originalIndex}
                style={[styles.matchChip, { borderColor: colors.border, backgroundColor: taken ? colors.surface : colors.surfaceRaised, opacity: taken ? 0.5 : 1 }]}
                onPress={() => tapRight(originalIndex)}
                disabled={selectedLeft === null}
                accessibilityRole="button"
              >
                <Text style={[styles.matchChipText, { color: colors.textSecondary }]} numberOfLines={3}>{pairs[originalIndex].right}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

export function SequencingQuestion({
  items,
  value,
  onChange,
  colors,
}: {
  items: string[];
  value: string;
  onChange: (value: string) => void;
  colors: Colors;
}) {
  const [shuffled] = useState(() => shuffledIndices(items.length));
  const [order, setOrder] = useState<number[]>(() => {
    const parsed = value.split(",").map((n) => parseInt(n.trim(), 10));
    return parsed.length === items.length && parsed.every((n) => !Number.isNaN(n)) ? parsed : [];
  });

  function tap(originalIndex: number) {
    if (order.includes(originalIndex)) return;
    const next = [...order, originalIndex];
    setOrder(next);
    onChange(next.length === items.length ? next.join(",") : "");
  }

  function reset() {
    setOrder([]);
    onChange("");
  }

  return (
    <View>
      <Text style={[styles.hint, { color: colors.textMuted }]}>Tap the steps in the correct order.</Text>
      <View style={styles.sequenceWrap}>
        {shuffled.map((originalIndex) => {
          const position = order.indexOf(originalIndex);
          const tapped = position !== -1;
          return (
            <Pressable
              key={originalIndex}
              style={[styles.sequenceChip, { borderColor: tapped ? colors.accent : colors.border, backgroundColor: tapped ? colors.accentSoft : colors.surfaceRaised }]}
              onPress={() => tap(originalIndex)}
              disabled={tapped}
              accessibilityRole="button"
            >
              {tapped ? (
                <View style={[styles.sequenceBadge, { backgroundColor: colors.accent }]}>
                  <Text style={[styles.sequenceBadgeText, { color: colors.accentOn }]}>{position + 1}</Text>
                </View>
              ) : null}
              <Text style={[styles.matchChipText, { color: colors.textPrimary }]}>{items[originalIndex]}</Text>
            </Pressable>
          );
        })}
      </View>
      {order.length > 0 ? (
        <Pressable onPress={reset} hitSlop={8} style={{ marginTop: 8 }}>
          <Text style={[styles.resetLink, { color: colors.accent }]}>Start over</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  hint: { fontSize: 12, marginBottom: 8 },
  matchRow: { flexDirection: "row", gap: 10 },
  matchColumn: { flex: 1, gap: 8 },
  matchChip: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 6, borderWidth: 1, borderRadius: 10, padding: 10, minHeight: 44 },
  matchChipText: { flex: 1, fontSize: 13, fontWeight: "600" },
  sequenceWrap: { gap: 8 },
  sequenceChip: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderRadius: 10, padding: 12 },
  sequenceBadge: { width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  sequenceBadgeText: { fontSize: 12, fontWeight: "800" },
  resetLink: { fontSize: 12, fontWeight: "700" },
});
