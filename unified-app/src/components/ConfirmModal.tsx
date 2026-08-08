import { Modal, View, Text, Pressable, StyleSheet } from "react-native";
import { useTheme } from "../theme/ThemeContext";

interface ConfirmModalProps {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

// RN's Alert.alert has no react-native-web implementation, and this app also
// builds for web, so confirmations use this modal instead.
export function ConfirmModal({ visible, title, message, confirmLabel = "Confirm", onConfirm, onCancel }: ConfirmModalProps) {
  const { colors, cardShadow, pressedOpacity } = useTheme();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, cardShadow]}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>{title}</Text>
          <Text style={[styles.message, { color: colors.textSecondary }]}>{message}</Text>
          <View style={styles.actions}>
            <Pressable
              style={({ pressed }) => [styles.button, { borderColor: colors.border }, pressed && { opacity: pressedOpacity }]}
              onPress={onCancel}
              accessibilityRole="button"
            >
              <Text style={[styles.buttonText, { color: colors.textSecondary }]}>Cancel</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.button, { backgroundColor: colors.accent, borderColor: colors.accent }, pressed && { opacity: pressedOpacity }]}
              onPress={onConfirm}
              accessibilityRole="button"
            >
              <Text style={[styles.buttonText, { color: colors.accentOn }]}>{confirmLabel}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center", padding: 24 },
  card: { width: "100%", maxWidth: 360, borderWidth: 1, borderRadius: 16, padding: 20 },
  title: { fontSize: 16, fontWeight: "800", marginBottom: 8 },
  message: { fontSize: 14, lineHeight: 20 },
  actions: { flexDirection: "row", justifyContent: "flex-end", gap: 8, marginTop: 20 },
  button: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 16, paddingVertical: 10, minHeight: 40, alignItems: "center", justifyContent: "center" },
  buttonText: { fontWeight: "700", fontSize: 13 },
});
