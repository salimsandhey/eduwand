import { useState, useRef } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, ActivityIndicator, Animated } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
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
  const [consentCaptured, setConsentCaptured] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duplicates, setDuplicates] = useState<PossibleDuplicate[]>([]);

  // Focus states
  const [nameFocused, setNameFocused] = useState(false);
  const [phoneFocused, setPhoneFocused] = useState(false);
  const [emailFocused, setEmailFocused] = useState(false);
  const [gradeFocused, setGradeFocused] = useState(false);

  // Button scale animation
  const buttonScale = useRef(new Animated.Value(1)).current;

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
        {/* Title Header Block */}
        <View style={styles.titleSection}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>New Enquiry</Text>
          <Text style={[styles.subtitle, { color: colors.textMuted }]}>
            Enter details to start the lead registration workflow
          </Text>
        </View>

        {/* Lead Details Card */}
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
        </View>

        {/* Lead Preferences Card */}
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

          <Text style={[styles.label, { color: colors.textSecondary }]}>Grade / board interest (optional)</Text>
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
        </View>

        {/* Consent Section */}
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
          >
            {consentCaptured && <Ionicons name="checkmark" size={14} color={colors.accentOn} />}
          </View>
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

        {/* Animated Action Button */}
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
                <Text style={[styles.saveButtonText, { color: colors.accentOn }]}>Save and Assign to Self</Text>
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
  consentRow: { flexDirection: "row", alignItems: "center", marginTop: 16, paddingVertical: 6 },
  checkbox: { width: 18, height: 18, borderWidth: 1.5, borderRadius: 4, marginRight: 10, alignItems: "center", justifyContent: "center" },
  consentLabel: { flexShrink: 1, fontSize: 13, fontWeight: "600" },
  duplicateBanner: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginTop: 16,
  },
  duplicateTitle: { fontWeight: "700", marginBottom: 4 },
  duplicateItem: {},
  error: { textAlign: "center", marginTop: 12 },
  saveButton: { borderRadius: 10, height: 48, alignItems: "center", marginTop: 20, justifyContent: "center" },
  saveButtonDisabled: { opacity: 0.6 },
  buttonInner: { flexDirection: "row", alignItems: "center", gap: 8 },
  saveButtonText: { fontSize: 15, fontWeight: "700" },
});
