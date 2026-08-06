import { useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, ActivityIndicator } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation/types";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../theme/ThemeContext";
import { Screen } from "../components/Screen";
import { api, EnquirySource, PossibleDuplicate } from "../api/client";

const SOURCES: EnquirySource[] = ["phone", "walk_in", "website", "referral", "event", "social"];

type Props = NativeStackScreenProps<RootStackParamList, "NewEnquiryForm">;

export function NewEnquiryFormScreen({ navigation }: Props) {
  const { accessToken } = useAuth();
  const { colors, cardShadow, pressedOpacity } = useTheme();
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [source, setSource] = useState<EnquirySource>("phone");
  const [gradeInterest, setGradeInterest] = useState("");
  const [notes, setNotes] = useState("");
  const [consentCaptured, setConsentCaptured] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duplicates, setDuplicates] = useState<PossibleDuplicate[]>([]);

  async function save() {
    if (!accessToken) return;
    if (!contactName || !contactPhone) {
      setError("Contact name and phone are required");
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      const res = await api.createEnquiry(accessToken, {
        contactName,
        contactPhone,
        contactEmail: contactEmail || undefined,
        source,
        gradeInterest: gradeInterest || undefined,
        notes: notes || undefined,
        consentCaptured,
      });
      const possibleDuplicates = (res.meta?.possibleDuplicates as PossibleDuplicate[]) ?? [];
      if (possibleDuplicates.length > 0) {
        setDuplicates(possibleDuplicates);
      }
      if (res.data) {
        navigation.replace("EnquiryDetail", { enquiryId: res.data.id });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save enquiry");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Screen edges={["bottom"]}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={[styles.label, { color: colors.textSecondary }]}>Contact name</Text>
        <TextInput
          style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.textPrimary }]}
          placeholderTextColor={colors.textMuted}
          value={contactName}
          onChangeText={setContactName}
        />

        <Text style={[styles.label, { color: colors.textSecondary }]}>Phone</Text>
        <TextInput
          style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.textPrimary }]}
          placeholderTextColor={colors.textMuted}
          value={contactPhone}
          onChangeText={setContactPhone}
          keyboardType="phone-pad"
        />

        <Text style={[styles.label, { color: colors.textSecondary }]}>Email (optional)</Text>
        <TextInput
          style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.textPrimary }]}
          placeholderTextColor={colors.textMuted}
          value={contactEmail}
          onChangeText={setContactEmail}
          keyboardType="email-address"
          autoCapitalize="none"
        />

        <Text style={[styles.label, { color: colors.textSecondary }]}>Source</Text>
        <View style={styles.chipRow}>
          {SOURCES.map((s) => {
            const active = source === s;
            return (
              <Pressable
                key={s}
                style={({ pressed }) => [
                  styles.chip,
                  { backgroundColor: active ? colors.accent : colors.surface, borderColor: active ? colors.accent : colors.border },
                  pressed && { opacity: pressedOpacity },
                ]}
                onPress={() => setSource(s)}
                accessibilityRole="button"
              >
                <Text style={[styles.chipText, { color: active ? colors.accentOn : colors.textSecondary }]}>{s}</Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={[styles.label, { color: colors.textSecondary }]}>Grade / board interest (optional)</Text>
        <TextInput
          style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.textPrimary }]}
          placeholderTextColor={colors.textMuted}
          value={gradeInterest}
          onChangeText={setGradeInterest}
        />

        <Text style={[styles.label, { color: colors.textSecondary }]}>Notes (optional)</Text>
        <TextInput
          style={[styles.input, styles.notesInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.textPrimary }]}
          placeholderTextColor={colors.textMuted}
          value={notes}
          onChangeText={setNotes}
          multiline
        />

        <Pressable
          style={({ pressed }) => [styles.consentRow, pressed && { opacity: pressedOpacity }]}
          onPress={() => setConsentCaptured((v) => !v)}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: consentCaptured }}
        >
          <View
            style={[
              styles.checkbox,
              { borderColor: consentCaptured ? colors.accent : colors.border, backgroundColor: consentCaptured ? colors.accent : "transparent" },
            ]}
          />
          <Text style={[styles.consentLabel, { color: colors.textPrimary }]}>Consent to be contacted has been given</Text>
        </Pressable>

        {duplicates.length > 0 ? (
          <View style={[styles.duplicateBanner, { backgroundColor: colors.surfaceRaised, borderColor: colors.warning }]}>
            <Text style={[styles.duplicateTitle, { color: colors.warning }]}>Possible duplicate</Text>
            {duplicates.map((d) => (
              <Text key={d.id} style={[styles.duplicateItem, { color: colors.textPrimary }]}>
                {d.contactName} · {d.status}
              </Text>
            ))}
          </View>
        ) : null}

        {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}

        <Pressable
          style={({ pressed }) => [
            styles.saveButton,
            { backgroundColor: colors.accent },
            cardShadow,
            (isSaving || pressed) && styles.saveButtonDisabled,
          ]}
          onPress={save}
          disabled={isSaving}
          accessibilityRole="button"
        >
          {isSaving ? <ActivityIndicator color={colors.accentOn} /> : <Text style={[styles.saveButtonText, { color: colors.accentOn }]}>Save and assign to self</Text>}
        </Pressable>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16 },
  label: { marginTop: 14, marginBottom: 6, fontSize: 13, fontWeight: "600" },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
  },
  notesInput: { minHeight: 80, textAlignVertical: "top" },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 8,
    marginBottom: 8,
    minHeight: 32,
    justifyContent: "center",
  },
  chipText: { textTransform: "capitalize", fontSize: 12, fontWeight: "600" },
  consentRow: { flexDirection: "row", alignItems: "center", marginTop: 18, paddingVertical: 6 },
  checkbox: { width: 20, height: 20, borderWidth: 1, borderRadius: 4, marginRight: 10 },
  consentLabel: { flexShrink: 1, fontSize: 14 },
  duplicateBanner: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginTop: 16,
  },
  duplicateTitle: { fontWeight: "700", marginBottom: 4 },
  duplicateItem: {},
  error: { textAlign: "center", marginTop: 12 },
  saveButton: { borderRadius: 10, padding: 14, alignItems: "center", marginTop: 24, marginBottom: 24, minHeight: 48, justifyContent: "center" },
  saveButtonDisabled: { opacity: 0.6 },
  saveButtonText: { fontSize: 16, fontWeight: "700" },
});
