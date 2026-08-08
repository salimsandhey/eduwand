import { useEffect, useState, useRef } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, ActivityIndicator, Animated } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { RootStackParamList } from "../navigation/types";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../theme/ThemeContext";
import { Screen } from "../components/Screen";
import { api, ClassSection } from "../api/client";

type Props = NativeStackScreenProps<RootStackParamList, "AdmissionConfirmation">;

export function AdmissionConfirmationScreen({ route, navigation }: Props) {
  const { enquiryId } = route.params;
  const { accessToken } = useAuth();
  const { colors, cardShadow, pressedOpacity } = useTheme();

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

  // Focus states
  const [fullNameFocused, setFullNameFocused] = useState(false);
  const [dobFocused, setDobFocused] = useState(false);
  const [guardianNameFocused, setGuardianNameFocused] = useState(false);
  const [guardianContactFocused, setGuardianContactFocused] = useState(false);
  const [admissionDateFocused, setAdmissionDateFocused] = useState(false);

  // Save button animation scale
  const buttonScale = useRef(new Animated.Value(1)).current;

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

  const handlePressIn = () => {
    Animated.spring(buttonScale, {
      toValue: 0.96,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(buttonScale, {
      toValue: 1,
      useNativeDriver: true,
    }).start();
  };

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
      <Screen edges={["bottom"]} style={styles.centered}>
        <ActivityIndicator color={colors.accent} />
      </Screen>
    );
  }

  return (
    <Screen edges={["bottom"]}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {/* Title Header Block */}
        <View style={styles.titleSection}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>Confirm Admission</Text>
          <Text style={[styles.subtitle, { color: colors.textMuted }]}>
            Finalize student enrollment details below
          </Text>
        </View>

        {/* Student Details Card */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, cardShadow]}>
          <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Student Details</Text>

          <Text style={[styles.label, { color: colors.textSecondary }]}>Full name</Text>
          <View style={[styles.inputRow, { backgroundColor: colors.surfaceRaised, borderColor: fullNameFocused ? colors.accent : colors.border }]}>
            <Ionicons name="person-outline" size={16} color={fullNameFocused ? colors.accent : colors.textMuted} style={styles.inputIcon} />
            <TextInput
              style={[styles.input, { color: colors.textPrimary }]}
              value={fullName}
              onChangeText={setFullName}
              placeholder="Student's full name"
              placeholderTextColor={colors.textMuted}
              onFocus={() => setFullNameFocused(true)}
              onBlur={() => setFullNameFocused(false)}
            />
          </View>

          <Text style={[styles.label, { color: colors.textSecondary }]}>Date of birth (YYYY-MM-DD)</Text>
          <View style={[styles.inputRow, { backgroundColor: colors.surfaceRaised, borderColor: dobFocused ? colors.accent : colors.border }]}>
            <Ionicons name="calendar-outline" size={16} color={dobFocused ? colors.accent : colors.textMuted} style={styles.inputIcon} />
            <TextInput
              style={[styles.input, { color: colors.textPrimary }]}
              value={dateOfBirth}
              onChangeText={setDateOfBirth}
              placeholder="2016-04-12"
              placeholderTextColor={colors.textMuted}
              onFocus={() => setDobFocused(true)}
              onBlur={() => setDobFocused(false)}
            />
          </View>

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
                    style={({ pressed }) => [
                      styles.chip,
                      { backgroundColor: active ? colors.accent : colors.surfaceRaised, borderColor: active ? colors.accent : colors.border },
                      pressed && { opacity: pressedOpacity },
                    ]}
                    onPress={() => setClassSectionId(cs.id)}
                    accessibilityRole="button"
                  >
                    <Text style={[styles.chipText, { color: active ? colors.accentOn : colors.textSecondary }]}>
                      {cs.className} {cs.sectionName}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>

        {/* Guardian Details Card */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, cardShadow]}>
          <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Guardian Details</Text>

          <Text style={[styles.label, { color: colors.textSecondary }]}>Guardian name</Text>
          <View style={[styles.inputRow, { backgroundColor: colors.surfaceRaised, borderColor: guardianNameFocused ? colors.accent : colors.border }]}>
            <Ionicons name="people-outline" size={16} color={guardianNameFocused ? colors.accent : colors.textMuted} style={styles.inputIcon} />
            <TextInput
              style={[styles.input, { color: colors.textPrimary }]}
              value={guardianName}
              onChangeText={setGuardianName}
              placeholder="Guardian's name"
              placeholderTextColor={colors.textMuted}
              onFocus={() => setGuardianNameFocused(true)}
              onBlur={() => setGuardianNameFocused(false)}
            />
          </View>

          <Text style={[styles.label, { color: colors.textSecondary }]}>Guardian contact</Text>
          <View style={[styles.inputRow, { backgroundColor: colors.surfaceRaised, borderColor: guardianContactFocused ? colors.accent : colors.border }]}>
            <Ionicons name="call-outline" size={16} color={guardianContactFocused ? colors.accent : colors.textMuted} style={styles.inputIcon} />
            <TextInput
              style={[styles.input, { color: colors.textPrimary }]}
              value={guardianContact}
              onChangeText={setGuardianContact}
              placeholder="Guardian's contact number"
              placeholderTextColor={colors.textMuted}
              onFocus={() => setGuardianContactFocused(true)}
              onBlur={() => setGuardianContactFocused(false)}
            />
          </View>

          <Text style={[styles.label, { color: colors.textSecondary }]}>Admission date (YYYY-MM-DD)</Text>
          <View style={[styles.inputRow, { backgroundColor: colors.surfaceRaised, borderColor: admissionDateFocused ? colors.accent : colors.border }]}>
            <Ionicons name="calendar-outline" size={16} color={admissionDateFocused ? colors.accent : colors.textMuted} style={styles.inputIcon} />
            <TextInput
              style={[styles.input, { color: colors.textPrimary }]}
              value={admissionDate}
              onChangeText={setAdmissionDate}
              onFocus={() => setAdmissionDateFocused(true)}
              onBlur={() => setAdmissionDateFocused(false)}
            />
          </View>
        </View>

        {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}

        {/* Animated Confirm Button */}
        <Animated.View style={{ transform: [{ scale: buttonScale }] }}>
          <Pressable
            onPressIn={handlePressIn}
            onPressOut={handlePressOut}
            style={({ pressed }) => [
              styles.saveButton,
              { backgroundColor: colors.accent },
              cardShadow,
              (isSaving || pressed) && styles.saveButtonDisabled,
            ]}
            onPress={submit}
            disabled={isSaving}
            accessibilityRole="button"
          >
            {isSaving ? (
              <ActivityIndicator color={colors.accentOn} />
            ) : (
              <View style={styles.buttonInner}>
                <Ionicons name="checkmark-circle-outline" size={18} color={colors.accentOn} />
                <Text style={[styles.saveButtonText, { color: colors.accentOn }]}>Confirm Admission</Text>
              </View>
            )}
          </Pressable>
        </Animated.View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 32 },
  centered: { justifyContent: "center", alignItems: "center" },
  titleSection: { marginBottom: 16 },
  title: { fontSize: 24, fontWeight: "800", letterSpacing: -0.5 },
  subtitle: { fontSize: 13, marginTop: 2, fontWeight: "500" },
  card: { borderWidth: 1, borderRadius: 16, padding: 16, marginBottom: 16 },
  cardTitle: { fontSize: 15, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.3, marginBottom: 8 },
  label: { marginTop: 10, marginBottom: 6, fontSize: 12, fontWeight: "700" },
  inputRow: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, height: 42 },
  inputIcon: { marginRight: 8 },
  input: { flex: 1, height: "100%", fontSize: 14, paddingVertical: 0 },
  meta: { fontSize: 13, marginTop: 6 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6 },
  chip: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 5,
    height: 30,
    justifyContent: "center",
    alignItems: "center",
  },
  chipText: { fontSize: 12, fontWeight: "700" },
  error: { textAlign: "center", marginTop: 12 },
  saveButton: { borderRadius: 10, height: 48, alignItems: "center", marginTop: 16, justifyContent: "center" },
  saveButtonDisabled: { opacity: 0.6 },
  buttonInner: { flexDirection: "row", alignItems: "center", gap: 8 },
  saveButtonText: { fontSize: 15, fontWeight: "700" },
});
