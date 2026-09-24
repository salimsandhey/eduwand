import { View, Text, Pressable, StyleSheet, ScrollView } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { RootStackParamList } from "../../navigation/types";
import { useTheme } from "../../theme/ThemeContext";
import { Screen } from "../../components/Screen";
import { PresentationReason } from "../../api/client";
import { PRESENTATION_REASON_LABELS } from "./generation/content";

type Props = NativeStackScreenProps<RootStackParamList, "PresentationReason">;

// Order matches the spec's table - concept_deck first as "the default".
const REASON_ORDER: { key: PresentationReason; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: "concept_deck", icon: "school-outline" },
  { key: "activity_walkthrough", icon: "flask-outline" },
  { key: "revision_deck", icon: "refresh-outline" },
];

// Step 5: "The teacher picks what she is doing in class, not which format
// she wants." Internal reason names never shown - see PRESENTATION_REASON_LABELS.
export function PresentationReasonScreen({ route, navigation }: Props) {
  const { topicId } = route.params;
  const { colors, pressedOpacity, cardShadow } = useTheme();

  function selectReason(reason: PresentationReason) {
    navigation.navigate("PresentationClasses", { topicId, presentationReason: reason });
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
            <Text style={[styles.topTitle, { color: colors.textPrimary }]}>Presentation</Text>
            <Text style={[styles.topSubtitle, { color: colors.textMuted }]} numberOfLines={1}>
              What are you doing in class?
            </Text>
          </View>
        </View>

        <Text style={[styles.introText, { color: colors.textSecondary }]}>
          Pick what best describes this class - it decides how the deck is structured.
        </Text>

        <View style={styles.cardList}>
          {REASON_ORDER.map(({ key, icon }) => {
            const meta = PRESENTATION_REASON_LABELS[key];
            return (
              <Pressable
                key={key}
                style={({ pressed }) => [styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, cardShadow, pressed && { opacity: pressedOpacity }]}
                onPress={() => selectReason(key)}
                accessibilityRole="button"
                accessibilityLabel={meta.label}
              >
                <View style={[styles.cardIcon, { backgroundColor: colors.accentSoft }]}>
                  <Ionicons name={icon} size={22} color={colors.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.cardLabel, { color: colors.textPrimary }]}>{meta.label}</Text>
                  <Text style={[styles.cardCaption, { color: colors.textMuted }]}>{meta.caption}</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
              </Pressable>
            );
          })}
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
  introText: { marginTop: 20, fontSize: 14, lineHeight: 20, fontWeight: "500" },
  cardList: { marginTop: 20, gap: 12 },
  card: { flexDirection: "row", alignItems: "center", gap: 14, borderWidth: 1, borderRadius: 16, padding: 16 },
  cardIcon: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  cardLabel: { fontSize: 15, fontWeight: "800" },
  cardCaption: { marginTop: 3, fontSize: 12, lineHeight: 16, fontWeight: "500" },
});
