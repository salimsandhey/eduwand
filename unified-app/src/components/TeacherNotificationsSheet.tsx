import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../theme/ThemeContext";
import { TeacherNudge } from "../api/client";
import { SheetModal } from "./SheetModal";

export const NUDGE_TYPE_COLORS: Record<TeacherNudge["type"], string> = {
  submissions: "#7359D9",
  day: "#2FA678",
  assign_test: "#F2675B",
  share_lessons: "#E5A72D",
  onboarding: "#7C005A",
};

const NUDGE_ICONS: Record<TeacherNudge["type"], keyof typeof Ionicons.glyphMap> = {
  submissions: "documents-outline",
  day: "calendar-outline",
  assign_test: "clipboard-outline",
  share_lessons: "share-social-outline",
  onboarding: "flag-outline",
};

// Quoted names/titles in a notification ("Fractions quiz") are bold so the
// thing being talked about stands out from the rest of the sentence.
export function renderNudgeText(text: string, boldColor: string) {
  return text.split(/("[^"]+")/).map((part, i) =>
    part.startsWith('"') && part.endsWith('"') && part.length > 2 ? (
      <Text key={i} style={{ fontWeight: "800", color: boldColor }}>
        {part.slice(1, -1)}
      </Text>
    ) : (
      part
    )
  );
}

interface Props {
  visible: boolean;
  onClose: () => void;
  notifications: TeacherNudge[];
  onPressNotification: (nudge: TeacherNudge) => void;
}

// The one place a teacher sees everything that needs their attention. The
// list is the same live data that drives the home ticker.
export function TeacherNotificationsSheet({ visible, onClose, notifications, onPressNotification }: Props) {
  const { colors, pressedOpacity } = useTheme();

  return (
    <SheetModal visible={visible} onClose={onClose} closeLabel="Close notifications">
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>Notifications</Text>
          <Text style={[styles.subtitle, { color: colors.textMuted }]}>
            {notifications.length === 0 ? "You're all caught up" : `${notifications.length} ${notifications.length === 1 ? "item needs" : "items need"} your attention`}
          </Text>
        </View>
        <Pressable
          onPress={onClose}
          hitSlop={10}
          style={({ pressed }) => [styles.closeButton, { backgroundColor: colors.surfaceRaised }, pressed && { opacity: pressedOpacity }]}
          accessibilityRole="button"
          accessibilityLabel="Close"
        >
          <Ionicons name="close" size={18} color={colors.textPrimary} />
        </Pressable>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.list}>
        {notifications.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="checkmark-done-circle-outline" size={44} color={colors.textMuted} />
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>Nothing needs your attention right now.</Text>
          </View>
        ) : (
          notifications.map((item) => {
            const color = NUDGE_TYPE_COLORS[item.type];
            return (
              <Pressable
                key={item.id}
                onPress={() => onPressNotification(item)}
                style={({ pressed }) => [styles.row, pressed && { opacity: pressedOpacity }]}
                accessibilityRole="button"
                accessibilityLabel={`${item.label}. ${item.text.replace(/"/g, "")}`}
              >
                <View style={[styles.iconWrap, { backgroundColor: color + "1F" }]}>
                  <Ionicons name={NUDGE_ICONS[item.type]} size={18} color={color} />
                </View>
                <View style={styles.rowBody}>
                  <Text style={[styles.rowLabel, { color }]}>{item.label}</Text>
                  <Text style={[styles.rowText, { color: colors.textSecondary }]}>{renderNudgeText(item.text, colors.textPrimary)}</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
              </Pressable>
            );
          })
        )}
      </ScrollView>
    </SheetModal>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
  headerCopy: { flex: 1 },
  title: { fontSize: 18, fontWeight: "800" },
  subtitle: { fontSize: 12, fontWeight: "600", marginTop: 2 },
  closeButton: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", marginLeft: 10 },
  list: { paddingTop: 8, paddingBottom: 8, gap: 4 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 },
  iconWrap: { width: 40, height: 40, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  rowBody: { flex: 1, gap: 3 },
  rowLabel: { fontSize: 10, fontWeight: "800", letterSpacing: 0.7 },
  rowText: { fontSize: 14, lineHeight: 19 },
  empty: { alignItems: "center", paddingVertical: 32, gap: 10 },
  emptyText: { fontSize: 13 },
});
