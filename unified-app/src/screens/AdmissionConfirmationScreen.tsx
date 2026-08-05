import { useEffect, useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, ActivityIndicator } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation/types";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../theme/ThemeContext";
import { api, ClassSection } from "../api/client";

type Props = NativeStackScreenProps<RootStackParamList, "AdmissionConfirmation">;

export function AdmissionConfirmationScreen({ route, navigation }: Props) {
  const { enquiryId } = route.params;
  const { accessToken } = useAuth();
  const { colors } = useTheme();

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
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]} contentContainerStyle={styles.content}>
      <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Student details</Text>
      <Text style={[styles.label, { color: colors.textSecondary }]}>Full name</Text>
      <TextInput
        style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.textPrimary }]}
        value={fullName}
        onChangeText={setFullName}
        placeholder="Student's full name"
        placeholderTextColor={colors.textMuted}
      />
      <Text style={[styles.label, { color: colors.textSecondary }]}>Date of birth (YYYY-MM-DD)</Text>
      <TextInput
        style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.textPrimary }]}
        value={dateOfBirth}
        onChangeText={setDateOfBirth}
        placeholder="2016-04-12"
        placeholderTextColor={colors.textMuted}
      />

      <Text style={[styles.label, { color: colors.textSecondary }]}>Class / section</Text>
      {classSections.length === 0 ? (
        <Text style={[styles.meta, { color: colors.textMuted }]}>No class sections configured for the current academic year</Text>
      ) : (
        <View style={styles.chipRow}>
          {classSections.map((cs) => {
            const active = classSectionId === cs.id;
            return (
              <Pressable
                key={cs.id}
                style={[styles.chip, { backgroundColor: active ? colors.accent : colors.surface, borderColor: active ? colors.accent : colors.border }]}
                onPress={() => setClassSectionId(cs.id)}
              >
                <Text style={[styles.chipText, { color: active ? colors.accentOn : colors.textSecondary }]}>
                  {cs.className} {cs.sectionName}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}

      <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Guardian details</Text>
      <Text style={[styles.label, { color: colors.textSecondary }]}>Guardian name</Text>
      <TextInput
        style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.textPrimary }]}
        value={guardianName}
        onChangeText={setGuardianName}
        placeholderTextColor={colors.textMuted}
      />
      <Text style={[styles.label, { color: colors.textSecondary }]}>Guardian contact</Text>
      <TextInput
        style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.textPrimary }]}
        value={guardianContact}
        onChangeText={setGuardianContact}
        placeholderTextColor={colors.textMuted}
      />

      <Text style={[styles.label, { color: colors.textSecondary }]}>Admission date (YYYY-MM-DD)</Text>
      <TextInput
        style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.textPrimary }]}
        value={admissionDate}
        onChangeText={setAdmissionDate}
        placeholderTextColor={colors.textMuted}
      />

      {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}

      <Pressable
        style={[styles.saveButton, { backgroundColor: colors.accent }, isSaving && styles.saveButtonDisabled]}
        onPress={submit}
        disabled={isSaving}
      >
        {isSaving ? <ActivityIndicator color={colors.accentOn} /> : <Text style={[styles.saveButtonText, { color: colors.accentOn }]}>Confirm admission</Text>}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 60 },
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  sectionTitle: { fontSize: 15, fontWeight: "700", marginTop: 20, marginBottom: 8 },
  label: { marginTop: 10, marginBottom: 6, fontSize: 13, fontWeight: "600" },
  input: { borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 15 },
  meta: {},
  chipRow: { flexDirection: "row", flexWrap: "wrap" },
  chip: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 8,
    marginBottom: 8,
  },
  chipText: { fontSize: 13, fontWeight: "600" },
  error: { textAlign: "center", marginTop: 12 },
  saveButton: { borderRadius: 10, padding: 14, alignItems: "center", marginTop: 24 },
  saveButtonDisabled: { opacity: 0.6 },
  saveButtonText: { fontSize: 16, fontWeight: "700" },
});
