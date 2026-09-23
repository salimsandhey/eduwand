import { createElement, useState } from "react";
import { Platform, Pressable, Text, View, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useTheme } from "../theme/ThemeContext";

interface TimePickerProps {
  /** 24-hour "HH:mm", or "" when nothing is chosen yet. */
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** What the wheel starts on (and what gets picked if the user just confirms) when value is empty. */
  defaultValue?: string;
}

const pad = (n: number) => String(n).padStart(2, "0");

function toDate(value: string): Date {
  const [h, m] = value.split(":").map(Number);
  const date = new Date();
  date.setHours(h || 0, m || 0, 0, 0);
  return date;
}

const toValue = (date: Date) => `${pad(date.getHours())}:${pad(date.getMinutes())}`;

// Stored as 24h "HH:mm" (what the backend expects), shown the way the device
// prefers so a teacher sees "9:30 AM" rather than having to think in 24h.
function formatDisplay(value: string): string {
  return toDate(value).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export function TimePicker({ value, onChange, placeholder = "Select time", defaultValue = "09:00" }: TimePickerProps) {
  const { colors } = useTheme();
  const [showPicker, setShowPicker] = useState(false);

  if (Platform.OS === "web") {
    return createElement("input", {
      type: "time",
      value: value || "",
      onChange: (e: { target: { value: string } }) => onChange(e.target.value),
      style: {
        width: "100%",
        boxSizing: "border-box",
        height: 44,
        borderRadius: 12,
        border: `1px solid ${colors.border}`,
        backgroundColor: colors.surfaceRaised,
        color: colors.textPrimary,
        padding: "0 12px",
        fontSize: 14,
        fontFamily: "inherit",
      },
    });
  }

  function open() {
    if (!value) onChange(defaultValue);
    setShowPicker(true);
  }

  return (
    <View>
      <Pressable
        style={[styles.field, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}
        onPress={open}
        accessibilityRole="button"
        accessibilityLabel={value ? `Time ${formatDisplay(value)}. Change` : placeholder}
      >
        <Text style={[styles.fieldText, { color: value ? colors.textPrimary : colors.textMuted }]}>{value ? formatDisplay(value) : placeholder}</Text>
        <Ionicons name="time-outline" size={18} color={colors.textMuted} />
      </Pressable>

      {showPicker && Platform.OS === "android" ? (
        <DateTimePicker
          value={toDate(value || defaultValue)}
          mode="time"
          display="default"
          onValueChange={(_event, selected) => {
            setShowPicker(false);
            onChange(toValue(selected));
          }}
          onDismiss={() => setShowPicker(false)}
        />
      ) : null}

      {showPicker && Platform.OS === "ios" ? (
        <View style={[styles.iosPanel, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
          <DateTimePicker
            value={toDate(value || defaultValue)}
            mode="time"
            display="spinner"
            // The native wheel follows the phone's dark mode, but the app theme
            // is always light - without these the numbers render white on our
            // light panel and look invisible.
            themeVariant="light"
            textColor={colors.textPrimary}
            onValueChange={(_event, selected) => onChange(toValue(selected))}
          />
          <Pressable onPress={() => setShowPicker(false)} style={styles.doneButton} accessibilityRole="button">
            <Text style={[styles.doneText, { color: colors.accent }]}>Done</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, height: 44 },
  fieldText: { fontSize: 14 },
  iosPanel: { marginTop: 8, borderWidth: 1, borderRadius: 12, overflow: "hidden" },
  doneButton: { alignSelf: "flex-end", paddingHorizontal: 16, paddingVertical: 10 },
  doneText: { fontSize: 14, fontWeight: "800" },
});
