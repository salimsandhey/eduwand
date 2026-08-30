import { useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../theme/ThemeContext";
import { DatePicker } from "./DatePicker";
import { FormField } from "../api/client";

interface DynamicFormFieldsProps {
  fields: FormField[];
  values: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
}

function fieldOptions(field: FormField): string[] {
  return Array.isArray(field.options) ? (field.options as unknown[]).map((o) => String(o)) : [];
}

function TextField({
  field,
  value,
  onChange,
  multiline,
  keyboardType,
}: {
  field: FormField;
  value: string;
  onChange: (v: string) => void;
  multiline?: boolean;
  keyboardType?: "default" | "numeric";
}) {
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);

  return (
    <View
      style={[
        multiline ? styles.multilineRow : styles.inputRow,
        { backgroundColor: colors.surfaceRaised, borderColor: focused ? colors.accent : colors.border },
      ]}
    >
      <TextInput
        style={[multiline ? styles.multilineInput : styles.input, { color: colors.textPrimary }]}
        value={value}
        onChangeText={onChange}
        placeholder={field.label}
        placeholderTextColor={colors.textMuted}
        multiline={multiline}
        keyboardType={keyboardType}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
    </View>
  );
}

function SelectField({
  field,
  value,
  onChange,
}: {
  field: FormField;
  value: string;
  onChange: (v: string) => void;
}) {
  const { colors, pressedOpacity } = useTheme();
  const options = fieldOptions(field);

  return (
    <View style={styles.chipRow}>
      {options.map((option) => {
        const active = value === option;
        return (
          <Pressable
            key={option}
            style={({ pressed }) => [
              styles.chip,
              { backgroundColor: active ? colors.accent : colors.surfaceRaised, borderColor: active ? colors.accent : colors.border },
              pressed && { opacity: pressedOpacity },
            ]}
            onPress={() => onChange(active ? "" : option)}
            accessibilityRole="button"
          >
            <Text style={[styles.chipText, { color: active ? colors.accentOn : colors.textSecondary }]}>{option}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function MultiselectField({
  field,
  value,
  onChange,
}: {
  field: FormField;
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const { colors, pressedOpacity } = useTheme();
  const options = fieldOptions(field);

  function toggle(option: string) {
    if (value.includes(option)) {
      onChange(value.filter((v) => v !== option));
    } else {
      onChange([...value, option]);
    }
  }

  return (
    <View style={styles.chipRow}>
      {options.map((option) => {
        const active = value.includes(option);
        return (
          <Pressable
            key={option}
            style={({ pressed }) => [
              styles.chip,
              { backgroundColor: active ? colors.accent : colors.surfaceRaised, borderColor: active ? colors.accent : colors.border },
              pressed && { opacity: pressedOpacity },
            ]}
            onPress={() => toggle(option)}
            accessibilityRole="button"
          >
            <Text style={[styles.chipText, { color: active ? colors.accentOn : colors.textSecondary }]}>{option}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function CheckboxField({
  field,
  value,
  onChange,
}: {
  field: FormField;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  const { colors, pressedOpacity } = useTheme();
  return (
    <Pressable
      style={({ pressed }) => [styles.checkboxRow, pressed && { opacity: pressedOpacity }]}
      onPress={() => onChange(!value)}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: value }}
    >
      <View
        style={[
          styles.checkbox,
          { borderColor: value ? colors.accent : colors.border, backgroundColor: value ? colors.accent : "transparent" },
        ]}
      >
        {value ? <Ionicons name="checkmark" size={14} color={colors.accentOn} /> : null}
      </View>
      <Text style={[styles.checkboxLabel, { color: colors.textPrimary }]}>{field.label}</Text>
    </Pressable>
  );
}

export function DynamicFormFields({ fields, values, onChange }: DynamicFormFieldsProps) {
  const { colors } = useTheme();
  const sortedFields = [...fields].sort((a, b) => a.order - b.order);

  return (
    <>
      {sortedFields.map((field) => {
        if (field.fieldType === "checkbox") {
          return (
            <CheckboxField
              key={field.id}
              field={field}
              value={Boolean(values[field.key])}
              onChange={(v) => onChange(field.key, v)}
            />
          );
        }

        if (field.fieldType === "file") {
          return (
            <View key={field.id} style={styles.fieldGroup}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>
                {field.label}
                {field.isRequired ? " *" : ""}
              </Text>
              <Text style={[styles.fileHint, { color: colors.textMuted }]}>Managed from the Documents checklist</Text>
            </View>
          );
        }

        return (
          <View key={field.id} style={styles.fieldGroup}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>
              {field.label}
              {field.isRequired ? " *" : ""}
            </Text>
            {field.fieldType === "text" ? (
              <TextField field={field} value={String(values[field.key] ?? "")} onChange={(v) => onChange(field.key, v)} />
            ) : null}
            {field.fieldType === "number" ? (
              <TextField
                field={field}
                value={values[field.key] === undefined || values[field.key] === null ? "" : String(values[field.key])}
                keyboardType="numeric"
                onChange={(v) => onChange(field.key, v === "" ? "" : Number(v))}
              />
            ) : null}
            {field.fieldType === "textarea" ? (
              <TextField field={field} value={String(values[field.key] ?? "")} multiline onChange={(v) => onChange(field.key, v)} />
            ) : null}
            {field.fieldType === "date" ? (
              <DatePicker value={String(values[field.key] ?? "")} onChange={(v) => onChange(field.key, v)} placeholder={`Select ${field.label.toLowerCase()}`} />
            ) : null}
            {field.fieldType === "select" ? (
              <SelectField field={field} value={String(values[field.key] ?? "")} onChange={(v) => onChange(field.key, v)} />
            ) : null}
            {field.fieldType === "multiselect" ? (
              <MultiselectField
                field={field}
                value={Array.isArray(values[field.key]) ? (values[field.key] as string[]) : []}
                onChange={(v) => onChange(field.key, v)}
              />
            ) : null}
          </View>
        );
      })}
    </>
  );
}

const styles = StyleSheet.create({
  fieldGroup: { marginTop: 10 },
  label: { marginBottom: 6, fontSize: 12, fontWeight: "700" },
  inputRow: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, height: 42 },
  input: { flex: 1, height: "100%", fontSize: 14, paddingVertical: 0 },
  multilineRow: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, minHeight: 88 },
  multilineInput: { flex: 1, fontSize: 14, textAlignVertical: "top" },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 2 },
  chip: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 5,
    minHeight: 30,
    justifyContent: "center",
    alignItems: "center",
  },
  chipText: { fontSize: 12, fontWeight: "700" },
  checkboxRow: { flexDirection: "row", alignItems: "center", marginTop: 14, paddingVertical: 4 },
  checkbox: { width: 18, height: 18, borderWidth: 1.5, borderRadius: 4, marginRight: 10, alignItems: "center", justifyContent: "center" },
  checkboxLabel: { flexShrink: 1, fontSize: 13, fontWeight: "600" },
  fileHint: { fontSize: 12, fontStyle: "italic" },
});
