import { createElement, useState } from "react";
import { Platform, Pressable, Text, View, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import DateTimePicker, { DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { useTheme } from "../theme/ThemeContext";

interface DatePickerProps {
  value: string; // "YYYY-MM-DD", or "" for unset
  onChange: (value: string) => void;
  placeholder?: string;
  minimumDate?: Date;
}

function parseISODate(value: string): Date {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

function formatISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatDisplay(value: string): string {
  return parseISODate(value).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

// Cross-platform due-date picker: a native calendar dialog on iOS/Android
// (react-native-web has no equivalent, and this app also builds for web),
// a plain <input type="date"> on web behind createElement to sidestep RN's
// JSX.IntrinsicElements typing, which doesn't know about DOM tags.
export function DatePicker({ value, onChange, placeholder = "Select a date", minimumDate }: DatePickerProps) {
  const { colors } = useTheme();
  const [showPicker, setShowPicker] = useState(false);

  if (Platform.OS === "web") {
    return createElement("input", {
      type: "date",
      value: value || "",
      min: minimumDate ? formatISODate(minimumDate) : undefined,
      onChange: (e: { target: { value: string } }) => onChange(e.target.value),
      style: {
        width: "100%",
        boxSizing: "border-box",
        height: 44,
        borderRadius: 8,
        border: `1px solid ${colors.border}`,
        backgroundColor: colors.surfaceRaised,
        color: colors.textPrimary,
        padding: "0 10px",
        fontSize: 14,
        fontFamily: "inherit",
      },
    });
  }

  return (
    <View>
      <Pressable
        style={[styles.field, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}
        onPress={() => setShowPicker(true)}
        accessibilityRole="button"
      >
        <Text style={[styles.fieldText, { color: value ? colors.textPrimary : colors.textMuted }]}>
          {value ? formatDisplay(value) : placeholder}
        </Text>
        <Ionicons name="calendar-outline" size={16} color={colors.textMuted} />
      </Pressable>
      {showPicker && (
        <DateTimePicker
          value={value ? parseISODate(value) : new Date()}
          mode="date"
          display="default"
          minimumDate={minimumDate}
          onChange={(event: DateTimePickerEvent, selectedDate?: Date) => {
            setShowPicker(false);
            if (event.type === "set" && selectedDate) {
              onChange(formatISODate(selectedDate));
            }
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    height: 44,
  },
  fieldText: { fontSize: 14 },
});
