import { useState, useRef, useEffect, useMemo } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, ActivityIndicator, Animated } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { RootStackParamList } from "../navigation/types";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../theme/ThemeContext";
import { Screen } from "../components/Screen";
import { DatePicker } from "../components/DatePicker";
import { ProfilePhotoPicker, PickedPhoto } from "../components/ProfilePhotoPicker";
import { api, EnquirySource, GuardianRelation, ClassSection } from "../api/client";

const SOURCES: EnquirySource[] = ["phone", "walk_in", "website", "referral", "event", "social"];
const GUARDIAN_RELATIONS: GuardianRelation[] = ["mother", "father", "guardian", "other"];

type Props = NativeStackScreenProps<RootStackParamList, "EditEnquiry">;

export function EditEnquiryScreen({ route, navigation }: Props) {
  const { enquiryId } = route.params;
  const { accessToken } = useAuth();
  const { colors, cardShadow, pressedOpacity } = useTheme();

  const [isLoading, setIsLoading] = useState(true);
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [source, setSource] = useState<EnquirySource>("phone");
  const [gradeInterest, setGradeInterest] = useState("");
  const [studentName, setStudentName] = useState("");
  const [studentDateOfBirth, setStudentDateOfBirth] = useState("");
  const [guardianRelation, setGuardianRelation] = useState<GuardianRelation | null>(null);
  const [photoPick, setPhotoPick] = useState<PickedPhoto>({ type: "none" });
  const [classSections, setClassSections] = useState<ClassSection[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [nameFocused, setNameFocused] = useState(false);
  const [phoneFocused, setPhoneFocused] = useState(false);
  const [emailFocused, setEmailFocused] = useState(false);
  const [gradeFocused, setGradeFocused] = useState(false);
  const [studentNameFocused, setStudentNameFocused] = useState(false);

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
        const enquiry = enquiryRes.data;
        if (enquiry) {
          setContactName(enquiry.contactName);
          setContactPhone(enquiry.contactPhone);
          setContactEmail(enquiry.contactEmail ?? "");
          setSource(enquiry.source);
          setGradeInterest(enquiry.gradeInterest ?? "");
          setStudentName(enquiry.studentName ?? "");
          setStudentDateOfBirth(enquiry.studentDateOfBirth?.slice(0, 10) ?? "");
          setGuardianRelation(enquiry.guardianRelation ?? null);
          if (enquiry.avatarKey) {
            setPhotoPick({ type: "avatar", avatarKey: enquiry.avatarKey });
          } else if (enquiry.photoMimeType) {
            setPhotoPick({ type: "remote", uri: api.enquiryPhotoUrl(accessToken, enquiryId) });
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load lead");
      } finally {
        setIsLoading(false);
      }
    })();
  }, [accessToken, enquiryId]);

  const gradeOptions = useMemo(() => {
    const seen = new Set<string>();
    const options: string[] = [];
    for (const cs of classSections) {
      if (!seen.has(cs.className)) {
        seen.add(cs.className);
        options.push(cs.className);
      }
    }
    return options;
  }, [classSections]);

  function handlePressIn() {
    Animated.spring(buttonScale, { toValue: 0.96, useNativeDriver: true }).start();
  }

  function handlePressOut() {
    Animated.spring(buttonScale, { toValue: 1, useNativeDriver: true }).start();
  }

  async function save() {
    if (!accessToken) return;
    if (!contactName || !contactPhone) {
      setError("Contact name and phone are required");
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      await api.updateEnquiry(accessToken, enquiryId, {
        contactName,
        contactPhone,
        contactEmail: contactEmail || undefined,
        source,
        gradeInterest: gradeInterest || undefined,
        studentName: studentName || undefined,
        studentDateOfBirth: studentDateOfBirth || undefined,
        guardianRelation: guardianRelation ?? undefined,
      });

      // Best-effort, same as New Enquiry - the core edit is already saved.
      try {
        if (photoPick.type === "photo") {
          await api.uploadEnquiryPhoto(accessToken, enquiryId, photoPick);
        } else if (photoPick.type === "avatar") {
          await api.setEnquiryAvatar(accessToken, enquiryId, photoPick.avatarKey);
        } else if (photoPick.type === "none") {
          await api.removeEnquiryPhoto(accessToken, enquiryId);
        }
      } catch {
        // Ignored - photo can still be changed again from here later.
      }

      navigation.replace("EnquiryDetail", { enquiryId });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save changes");
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return (
      <Screen edges={["bottom"]} style={styles.centered}>
        <ActivityIndicator color={colors.accent} />
      </Screen>
    );
  }

  return (
    <Screen edges={["bottom"]}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.titleSection}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>Edit Lead</Text>
          <Text style={[styles.subtitle, { color: colors.textMuted }]}>Update contact, student, or lead details</Text>
        </View>

        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, cardShadow]}>
          <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Profile photo (optional)</Text>
          <ProfilePhotoPicker value={photoPick} onChange={setPhotoPick} />
        </View>

        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, cardShadow]}>
          <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Student details</Text>

          <Text style={[styles.label, { color: colors.textSecondary }]}>Student name (optional)</Text>
          <View style={[styles.inputRow, { backgroundColor: colors.surfaceRaised, borderColor: studentNameFocused ? colors.accent : colors.border }]}>
            <Ionicons name="happy-outline" size={16} color={studentNameFocused ? colors.accent : colors.textMuted} style={styles.inputIcon} />
            <TextInput
              style={[styles.input, { color: colors.textPrimary }]}
              placeholder="The child's full name"
              placeholderTextColor={colors.textMuted}
              value={studentName}
              onChangeText={setStudentName}
              onFocus={() => setStudentNameFocused(true)}
              onBlur={() => setStudentNameFocused(false)}
            />
          </View>

          <Text style={[styles.label, { color: colors.textSecondary }]}>Student date of birth (optional)</Text>
          <DatePicker value={studentDateOfBirth} onChange={setStudentDateOfBirth} placeholder="Select date of birth" />
        </View>

        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, cardShadow]}>
          <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Lead details</Text>

          <Text style={[styles.label, { color: colors.textSecondary }]}>Contact name</Text>
          <View style={[styles.inputRow, { backgroundColor: colors.surfaceRaised, borderColor: nameFocused ? colors.accent : colors.border }]}>
            <Ionicons name="person-outline" size={16} color={nameFocused ? colors.accent : colors.textMuted} style={styles.inputIcon} />
            <TextInput
              style={[styles.input, { color: colors.textPrimary }]}
              placeholder="Full name of contact"
              placeholderTextColor={colors.textMuted}
              value={contactName}
              onChangeText={setContactName}
              onFocus={() => setNameFocused(true)}
              onBlur={() => setNameFocused(false)}
            />
          </View>

          <Text style={[styles.label, { color: colors.textSecondary }]}>Phone number</Text>
          <View style={[styles.inputRow, { backgroundColor: colors.surfaceRaised, borderColor: phoneFocused ? colors.accent : colors.border }]}>
            <Ionicons name="call-outline" size={16} color={phoneFocused ? colors.accent : colors.textMuted} style={styles.inputIcon} />
            <TextInput
              style={[styles.input, { color: colors.textPrimary }]}
              placeholder="Contact phone number"
              placeholderTextColor={colors.textMuted}
              value={contactPhone}
              onChangeText={setContactPhone}
              keyboardType="phone-pad"
              onFocus={() => setPhoneFocused(true)}
              onBlur={() => setPhoneFocused(false)}
            />
          </View>

          <Text style={[styles.label, { color: colors.textSecondary }]}>Email address (optional)</Text>
          <View style={[styles.inputRow, { backgroundColor: colors.surfaceRaised, borderColor: emailFocused ? colors.accent : colors.border }]}>
            <Ionicons name="mail-outline" size={16} color={emailFocused ? colors.accent : colors.textMuted} style={styles.inputIcon} />
            <TextInput
              style={[styles.input, { color: colors.textPrimary }]}
              placeholder="Contact email address"
              placeholderTextColor={colors.textMuted}
              value={contactEmail}
              onChangeText={setContactEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              onFocus={() => setEmailFocused(true)}
              onBlur={() => setEmailFocused(false)}
            />
          </View>

          <Text style={[styles.label, { color: colors.textSecondary }]}>Relationship to student (optional)</Text>
          <View style={styles.chipRow}>
            {GUARDIAN_RELATIONS.map((relation) => {
              const active = guardianRelation === relation;
              return (
                <Pressable
                  key={relation}
                  style={({ pressed }) => [
                    styles.chip,
                    { backgroundColor: active ? colors.accent : colors.surfaceRaised, borderColor: active ? colors.accent : colors.border },
                    pressed && { opacity: pressedOpacity },
                  ]}
                  onPress={() => setGuardianRelation(active ? null : relation)}
                  accessibilityRole="button"
                >
                  <Text style={[styles.chipText, { color: active ? colors.accentOn : colors.textSecondary }]}>{relation}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, cardShadow]}>
          <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Preferences & Context</Text>

          <Text style={[styles.label, { color: colors.textSecondary }]}>Lead source</Text>
          <View style={styles.chipRow}>
            {SOURCES.map((s) => {
              const active = source === s;
              return (
                <Pressable
                  key={s}
                  style={({ pressed }) => [
                    styles.chip,
                    { backgroundColor: active ? colors.accent : colors.surfaceRaised, borderColor: active ? colors.accent : colors.border },
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

          <Text style={[styles.label, { color: colors.textSecondary }]}>Grade of interest (optional)</Text>
          {gradeOptions.length > 0 ? (
            <View style={styles.chipRow}>
              {gradeOptions.map((grade) => {
                const active = gradeInterest === grade;
                return (
                  <Pressable
                    key={grade}
                    style={({ pressed }) => [
                      styles.chip,
                      { backgroundColor: active ? colors.accent : colors.surfaceRaised, borderColor: active ? colors.accent : colors.border },
                      pressed && { opacity: pressedOpacity },
                    ]}
                    onPress={() => setGradeInterest(active ? "" : grade)}
                    accessibilityRole="button"
                  >
                    <Text style={[styles.chipText, { color: active ? colors.accentOn : colors.textSecondary }]}>{grade}</Text>
                  </Pressable>
                );
              })}
            </View>
          ) : (
            <View style={[styles.inputRow, { backgroundColor: colors.surfaceRaised, borderColor: gradeFocused ? colors.accent : colors.border }]}>
              <Ionicons name="school-outline" size={16} color={gradeFocused ? colors.accent : colors.textMuted} style={styles.inputIcon} />
              <TextInput
                style={[styles.input, { color: colors.textPrimary }]}
                placeholder="e.g. Class 10, CBSE"
                placeholderTextColor={colors.textMuted}
                value={gradeInterest}
                onChangeText={setGradeInterest}
                onFocus={() => setGradeFocused(true)}
                onBlur={() => setGradeFocused(false)}
              />
            </View>
          )}
        </View>

        {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}

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
            onPress={save}
            disabled={isSaving}
            accessibilityRole="button"
          >
            {isSaving ? (
              <ActivityIndicator color={colors.accentOn} />
            ) : (
              <View style={styles.buttonInner}>
                <Ionicons name="checkmark-circle-outline" size={18} color={colors.accentOn} />
                <Text style={[styles.saveButtonText, { color: colors.accentOn }]}>Save Changes</Text>
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
  chipText: { textTransform: "capitalize", fontSize: 12, fontWeight: "700" },
  error: { textAlign: "center", marginTop: 12 },
  saveButton: { borderRadius: 10, height: 48, alignItems: "center", marginTop: 20, justifyContent: "center" },
  saveButtonDisabled: { opacity: 0.6 },
  buttonInner: { flexDirection: "row", alignItems: "center", gap: 8 },
  saveButtonText: { fontSize: 15, fontWeight: "700" },
});
