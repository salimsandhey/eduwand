import { useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, ActivityIndicator } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation/types";
import { useAuth } from "../context/AuthContext";
import { api, EnquirySource, PossibleDuplicate } from "../api/client";
import { theme } from "../theme";

const SOURCES: EnquirySource[] = ["phone", "walk_in", "website", "referral", "event", "social"];

type Props = NativeStackScreenProps<RootStackParamList, "NewEnquiryForm">;

export function NewEnquiryFormScreen({ navigation }: Props) {
  const { accessToken } = useAuth();
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
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.label}>Contact name</Text>
      <TextInput style={styles.input} value={contactName} onChangeText={setContactName} />

      <Text style={styles.label}>Phone</Text>
      <TextInput style={styles.input} value={contactPhone} onChangeText={setContactPhone} keyboardType="phone-pad" />

      <Text style={styles.label}>Email (optional)</Text>
      <TextInput style={styles.input} value={contactEmail} onChangeText={setContactEmail} keyboardType="email-address" autoCapitalize="none" />

      <Text style={styles.label}>Source</Text>
      <View style={styles.chipRow}>
        {SOURCES.map((s) => (
          <Pressable key={s} style={[styles.chip, source === s && styles.chipActive]} onPress={() => setSource(s)}>
            <Text style={[styles.chipText, source === s && styles.chipTextActive]}>{s}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.label}>Grade / board interest (optional)</Text>
      <TextInput style={styles.input} value={gradeInterest} onChangeText={setGradeInterest} />

      <Text style={styles.label}>Notes (optional)</Text>
      <TextInput style={[styles.input, styles.notesInput]} value={notes} onChangeText={setNotes} multiline />

      <Pressable style={styles.consentRow} onPress={() => setConsentCaptured((v) => !v)}>
        <View style={[styles.checkbox, consentCaptured && styles.checkboxChecked]} />
        <Text style={styles.consentLabel}>Consent to be contacted has been given</Text>
      </Pressable>

      {duplicates.length > 0 ? (
        <View style={styles.duplicateBanner}>
          <Text style={styles.duplicateTitle}>Possible duplicate</Text>
          {duplicates.map((d) => (
            <Text key={d.id} style={styles.duplicateItem}>
              {d.contactName} · {d.status}
            </Text>
          ))}
        </View>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable style={[styles.saveButton, isSaving && styles.saveButtonDisabled]} onPress={save} disabled={isSaving}>
        {isSaving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveButtonText}>Save and assign to self</Text>}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background },
  content: { padding: 16 },
  label: { color: theme.textMuted, marginTop: 14, marginBottom: 6, fontSize: 13 },
  input: {
    backgroundColor: theme.card,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  notesInput: { minHeight: 80, textAlignVertical: "top" },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: theme.card,
    marginRight: 8,
    marginBottom: 8,
  },
  chipActive: { backgroundColor: theme.accent, borderColor: theme.accent },
  chipText: { color: theme.textMuted, textTransform: "capitalize" },
  chipTextActive: { color: "#fff" },
  consentRow: { flexDirection: "row", alignItems: "center", marginTop: 18 },
  checkbox: { width: 20, height: 20, borderWidth: 1, borderColor: theme.border, borderRadius: 4, marginRight: 10 },
  checkboxChecked: { backgroundColor: theme.accent, borderColor: theme.accent },
  consentLabel: { color: theme.text, flexShrink: 1 },
  duplicateBanner: {
    backgroundColor: "#fff8e6",
    borderColor: theme.warning,
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginTop: 16,
  },
  duplicateTitle: { fontWeight: "700", color: theme.warning, marginBottom: 4 },
  duplicateItem: { color: theme.text },
  error: { color: theme.danger, textAlign: "center", marginTop: 12 },
  saveButton: { backgroundColor: theme.accent, borderRadius: 8, padding: 14, alignItems: "center", marginTop: 24, marginBottom: 40 },
  saveButtonDisabled: { opacity: 0.6 },
  saveButtonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
});
