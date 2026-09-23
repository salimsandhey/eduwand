import { View, Text, Image, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../../theme/ThemeContext";
import { MediaItem } from "./content";

interface Props {
  items: MediaItem[];
  urlFor: (item: MediaItem) => string;
}

// Images / PDF pages the teacher chose to show as-is with a lesson plan,
// flashcard set or activity report - listed under the generated content
// exactly as they were (a presentation puts the same things on its own image
// slides instead).
export function AttachedMedia({ items, urlFor }: Props) {
  const { colors } = useTheme();
  if (items.length === 0) return null;

  return (
    <View style={styles.wrap}>
      <View style={styles.headingRow}>
        <Ionicons name="images-outline" size={16} color={colors.accent} />
        <Text style={[styles.heading, { color: colors.textPrimary }]}>Attached material</Text>
        <Text style={[styles.count, { color: colors.textMuted }]}>{items.length}</Text>
      </View>
      {items.map((item) => (
        <View key={item.id} style={[styles.card, { backgroundColor: colors.surface }]}>
          <Image source={{ uri: urlFor(item) }} style={[styles.image, { backgroundColor: colors.surfaceRaised }]} resizeMode="contain" accessibilityLabel={item.caption} />
          <Text style={[styles.caption, { color: colors.textPrimary }]}>{item.caption}</Text>
          {item.attribution ? <Text style={[styles.attribution, { color: colors.textMuted }]}>{item.attribution}</Text> : null}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 20, gap: 12 },
  headingRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  heading: { fontSize: 15, fontWeight: "800", flex: 1 },
  count: { fontSize: 12, fontWeight: "700" },
  card: { borderRadius: 16, padding: 10 },
  image: { width: "100%", height: 240, borderRadius: 10 },
  caption: { fontSize: 13, fontWeight: "700", marginTop: 8 },
  attribution: { fontSize: 11, fontStyle: "italic", marginTop: 2 },
});
