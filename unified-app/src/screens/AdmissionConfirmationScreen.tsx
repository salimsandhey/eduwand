import { useEffect, useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, ActivityIndicator } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation/types";
import { useAuth } from "../context/AuthContext";
import { api, ClassSection } from "../api/client";
import { theme } from "../theme";

type Props = NativeStackScreenProps<RootStackParamList, "AdmissionConfirmation">;

export function AdmissionConfirmationScreen({ route, navigation }: Props) {
  const { enquiryId } = route.params;
  const { accessToken } = useAuth();

  const [classSections, setClassSections] = useState<ClassSection[]>([]);
  const [isLoadingContext, setIsLoadingContext] = useState(true);
  const [fullName, setFullName] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [classSectionId, setClassSectionId] = useState<string | null>(null);
  const [guardianName, setGuardianName] = useState("");
  const [guardianContact, setGuardianContact] = useState("");
  const [admissionDate, setAdmissionDate] = useState(new Date().toISOString().slice(0, 10));
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    (async () => {
      try {
        const [enquiryRes, sections] = await Promise.all([
          api.getEnquiry(accessToken, enquiryId),
          api.listClassSections(accessToken),
        ]);
        setClassSections(sections);
        if (sections.length > 0) setClassSectionId(sections[0].id);
        if (enquiryRes.data) {
          setGuardianName(enquiryRes.data.contactName);
          setGuardianContact(enquiryRes.data.contactPhone);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load form data");
      } finally {
        setIsLoadingContext(false);
      }
    })();
  }, [accessToken, enquiryId]);

  async function submit() {
    if (!accessToken) return;
    if (!dateOfBirth || !classSectionId || !admissionDate) {
      setError("Date of birth, class/section, and admission date are required");
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      await api.confirmAdmission(accessToken, enquiryId, {
        fullName: fullName || undefined,
        dateOfBirth,
        classSectionId,
        guardianName: guardianName || undefined,
        guardianContact: guardianContact || undefined,
        admissionDate,
      });
      navigation.replace("EnquiryDetail", { enquiryId });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to confirm admission");
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoadingContext) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.sectionTitle}>Student details</Text>
      <Text style={styles.label}>Full name</Text>
      <TextInput style={styles.input} value={fullName} onChangeText={setFullName} placeholder="Student's full name" />
      <Text style={styles.label}>Date of birth (YYYY-MM-DD)</Text>
      <TextInput style={styles.input} value={dateOfBirth} onChangeText={setDateOfBirth} placeholder="2016-04-12" />

      <Text style={styles.label}>Class / section</Text>
      {classSections.length === 0 ? (
        <Text style={styles.meta}>No class sections configured for the current academic year</Text>
      ) : (
        <View style={styles.chipRow}>
          {classSections.map((cs) => (
            <Pressable
              key={cs.id}
              style={[styles.chip, classSectionId === cs.id && styles.chipActive]}
              onPress={() => setClassSectionId(cs.id)}
            >
              <Text style={[styles.chipText, classSectionId === cs.id && styles.chipTextActive]}>
                {cs.className} {cs.sectionName}
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      <Text style={styles.sectionTitle}>Guardian details</Text>
      <Text style={styles.label}>Guardian name</Text>
      <TextInput style={styles.input} value={guardianName} onChangeText={setGuardianName} />
      <Text style={styles.label}>Guardian contact</Text>
      <TextInput style={styles.input} value={guardianContact} onChangeText={setGuardianContact} />

      <Text style={styles.label}>Admission date (YYYY-MM-DD)</Text>
      <TextInput style={styles.input} value={admissionDate} onChangeText={setAdmissionDate} />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable style={[styles.saveButton, isSaving && styles.saveButtonDisabled]} onPress={submit} disabled={isSaving}>
        {isSaving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveButtonText}>Confirm admission</Text>}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background },
  content: { padding: 16, paddingBottom: 60 },
  centered: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: theme.background },
  sectionTitle: { fontSize: 15, fontWeight: "700", color: theme.text, marginTop: 20, marginBottom: 8 },
  label: { color: theme.textMuted, marginTop: 10, marginBottom: 6, fontSize: 13 },
  input: { backgroundColor: theme.card, borderWidth: 1, borderColor: theme.border, borderRadius: 8, padding: 12, fontSize: 16 },
  meta: { color: theme.textMuted },
  chipRow: { flexDirection: "row", flexWrap: "wrap" },
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
  chipText: { color: theme.textMuted },
  chipTextActive: { color: "#fff" },
  error: { color: theme.danger, textAlign: "center", marginTop: 12 },
  saveButton: { backgroundColor: theme.accent, borderRadius: 8, padding: 14, alignItems: "center", marginTop: 24 },
  saveButtonDisabled: { opacity: 0.6 },
  saveButtonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
});
