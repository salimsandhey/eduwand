import { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, ActivityIndicator, Animated } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { RootStackParamList } from "../../navigation/types";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../theme/ThemeContext";
import { Screen } from "../../components/Screen";
import { StageRail } from "../../components/StageRail";
import { DocumentChecklist, requiredDocumentCompletion } from "../../components/DocumentChecklist";
import { api, ClassSection, EnquiryDocument, AdmissionInfo, DocumentType, PipelineStage } from "../../api/client";

const DRAFT_SAVE_DELAY_MS = 800;

type WizardStep = "student" | "guardian" | "documents" | "review";

const WIZARD_STEPS: PipelineStage[] = [
  { id: "student", key: "student", label: "Student", order: 0, isTerminal: false, isConverted: false },
  { id: "guardian", key: "guardian", label: "Guardian", order: 1, isTerminal: false, isConverted: false },
  { id: "documents", key: "documents", label: "Documents", order: 2, isTerminal: false, isConverted: false },
  { id: "review", key: "review", label: "Review", order: 3, isTerminal: false, isConverted: false },
];

type Props = NativeStackScreenProps<RootStackParamList, "AdmissionConfirmation">;

export function AdmissionConfirmationScreen({ route, navigation }: Props) {
  const { enquiryId } = route.params;
  const { accessToken } = useAuth();
  const { colors, cardShadow, pressedOpacity } = useTheme();

  const [isLoadingContext, setIsLoadingContext] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [admission, setAdmission] = useState<AdmissionInfo | null>(null);
  const [classSections, setClassSections] = useState<ClassSection[]>([]);
  const [documents, setDocuments] = useState<EnquiryDocument[]>([]);
  const [step, setStep] = useState<WizardStep>("student");

  const [fullName, setFullName] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [classSectionId, setClassSectionId] = useState<string | null>(null);
  const [guardianName, setGuardianName] = useState("");
  const [guardianContact, setGuardianContact] = useState("");
  const [admissionDate, setAdmissionDate] = useState(new Date().toISOString().slice(0, 10));
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draftSavedAt, setDraftSavedAt] = useState<Date | null>(null);
  const [docError, setDocError] = useState<string | null>(null);

  const [fullNameFocused, setFullNameFocused] = useState(false);
  const [dobFocused, setDobFocused] = useState(false);
  const [guardianNameFocused, setGuardianNameFocused] = useState(false);
  const [guardianContactFocused, setGuardianContactFocused] = useState(false);
  const [admissionDateFocused, setAdmissionDateFocused] = useState(false);

  const buttonScale = useRef(new Animated.Value(1)).current;
  // Skips the draft-autosave effect until the form has been hydrated from the
  // server once, so restoring a saved draft doesn't immediately re-save itself.
  const isHydrated = useRef(false);

  const loadDocuments = useCallback(async () => {
    if (!accessToken) return;
    try {
      setDocuments(await api.listDocuments(accessToken, enquiryId));
    } catch {
      // Non-fatal - the form itself doesn't depend on this list loading.
    }
  }, [accessToken, enquiryId]);

  useEffect(() => {
    if (!accessToken) return;
    (async () => {
      try {
        const [enquiryRes, sections, admissionInfo] = await Promise.all([
          api.getEnquiry(accessToken, enquiryId),
          api.listClassSections(accessToken),
          api.getEnquiryAdmission(accessToken, enquiryId),
        ]);
        setClassSections(sections);
        setAdmission(admissionInfo);

        const draft = admissionInfo.draft;
        const stub = admissionInfo.studentStub;
        if (stub) {
          setFullName(stub.fullName);
          setDateOfBirth(stub.dateOfBirth.slice(0, 10));
          setClassSectionId(stub.classSectionId);
          setGuardianName(stub.guardianName);
          setGuardianContact(stub.guardianContact);
          setAdmissionDate(stub.admissionDate.slice(0, 10));
        } else {
          const enquiry = enquiryRes.data;
          setFullName(draft?.fullName ?? enquiry?.studentName ?? "");
          setDateOfBirth(draft?.dateOfBirth ?? enquiry?.studentDateOfBirth?.slice(0, 10) ?? "");
          const matching = enquiry?.gradeInterest ? sections.find((cs) => cs.className === enquiry.gradeInterest) : undefined;
          setClassSectionId(draft?.classSectionId ?? matching?.id ?? (sections.length > 0 ? sections[0].id : null));
          setGuardianName(draft?.guardianName ?? enquiry?.contactName ?? "");
          setGuardianContact(draft?.guardianContact ?? enquiry?.contactPhone ?? "");
          setAdmissionDate(draft?.admissionDate ?? new Date().toISOString().slice(0, 10));
        }
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : "Failed to load admission details");
      } finally {
        setIsLoadingContext(false);
        // Deferred a tick so the state updates above land before the
        // autosave effect starts watching for further edits.
        setTimeout(() => {
          isHydrated.current = true;
        }, 0);
      }
    })();
    loadDocuments();
  }, [accessToken, enquiryId, loadDocuments]);

  // Admission draft autosave (backend/src/routes/enquiries.ts PATCH
  // /enquiries/:id/admission-draft) - lets the counsellor move between wizard
  // steps or leave and come back without losing progress.
  useEffect(() => {
    if (!isHydrated.current || !accessToken || admission?.confirmed) return;
    const timer = setTimeout(() => {
      api
        .saveAdmissionDraft(accessToken, enquiryId, {
          fullName: fullName || undefined,
          dateOfBirth: dateOfBirth || undefined,
          classSectionId: classSectionId || undefined,
          guardianName: guardianName || undefined,
          guardianContact: guardianContact || undefined,
          admissionDate: admissionDate || undefined,
        })
        .then(() => setDraftSavedAt(new Date()))
        .catch(() => {
          // Best-effort - the final confirm-admission call is still authoritative.
        });
    }, DRAFT_SAVE_DELAY_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fullName, dateOfBirth, classSectionId, guardianName, guardianContact, admissionDate]);

  async function uploadChecklistDocument(file: { uri: string; name: string; mimeType: string }, documentType: DocumentType) {
    if (!accessToken) return;
    setDocError(null);
    try {
      await api.uploadDocument(accessToken, enquiryId, file, documentType);
      await loadDocuments();
    } catch (err) {
      setDocError(err instanceof Error ? err.message : "Failed to upload document");
      throw err;
    }
  }

  function handlePressIn() {
    Animated.spring(buttonScale, { toValue: 0.96, useNativeDriver: true }).start();
  }

  function handlePressOut() {
    Animated.spring(buttonScale, { toValue: 1, useNativeDriver: true }).start();
  }

  async function submit() {
    if (!accessToken) return;
    if (!dateOfBirth || !classSectionId || !admissionDate) {
      setError("Date of birth, class/section, and admission date are required");
      setStep(!dateOfBirth || !classSectionId ? "student" : "guardian");
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

  if (loadError || !admission) {
    return (
      <Screen edges={["bottom"]} style={styles.centered}>
        <Text style={[styles.error, { color: colors.danger }]}>{loadError ?? "Admission details not found"}</Text>
      </Screen>
    );
  }

  if (!admission.unlocked && !admission.confirmed) {
    return (
      <Screen edges={["bottom"]}>
        <View style={styles.lockedWrap}>
          <View style={[styles.lockedCard, { backgroundColor: colors.surface, borderColor: colors.border }, cardShadow]}>
            <View style={[styles.lockedIconWrap, { backgroundColor: colors.surfaceRaised }]}>
              <Ionicons name="lock-closed-outline" size={26} color={colors.textMuted} />
            </View>
            <Text style={[styles.lockedTitle, { color: colors.textPrimary }]}>Admission not started</Text>
            <Text style={[styles.lockedBody, { color: colors.textMuted }]}>
              Move this lead to the Application stage before starting the admission flow.
            </Text>
            <Pressable
              onPress={() => navigation.goBack()}
              style={({ pressed }) => [styles.lockedButton, { backgroundColor: colors.accent }, pressed && { opacity: pressedOpacity }]}
              accessibilityRole="button"
            >
              <Text style={[styles.lockedButtonText, { color: colors.accentOn }]}>Back to enquiry</Text>
            </Pressable>
          </View>
        </View>
      </Screen>
    );
  }

  const isConfirmed = admission.confirmed;
  const selectedClassSection = classSections.find((cs) => cs.id === classSectionId);
  const docCompletion = requiredDocumentCompletion(documents);

  // Confirmed admissions are a closed record - show a plain read-only
  // summary instead of a wizard with nothing left to step through.
  if (isConfirmed) {
    return (
      <Screen edges={["bottom"]}>
        <ScrollView style={styles.container} contentContainerStyle={styles.content}>
          <View style={[styles.confirmedBanner, { backgroundColor: colors.accentSoft, borderColor: colors.accent }]}>
            <Ionicons name="checkmark-circle" size={20} color={colors.accent} />
            <Text style={[styles.confirmedBannerText, { color: colors.textPrimary }]}>
              Confirmed{admission.completedAt ? ` on ${new Date(admission.completedAt).toLocaleDateString("en-IN")}` : ""}
            </Text>
          </View>

          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, cardShadow]}>
            <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Student</Text>
            <ReviewRow label="Full name" value={fullName} colors={colors} />
            <ReviewRow label="Date of birth" value={dateOfBirth} colors={colors} />
            <ReviewRow label="Class / section" value={selectedClassSection ? `${selectedClassSection.className} ${selectedClassSection.sectionName}` : "—"} colors={colors} />
          </View>

          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, cardShadow]}>
            <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Guardian</Text>
            <ReviewRow label="Name" value={guardianName} colors={colors} />
            <ReviewRow label="Contact" value={guardianContact} colors={colors} />
            <ReviewRow label="Admission date" value={admissionDate} colors={colors} />
          </View>

          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, cardShadow]}>
            <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Documents</Text>
            <DocumentChecklist documents={documents} onUpload={uploadChecklistDocument} readOnly />
          </View>
        </ScrollView>
      </Screen>
    );
  }

  return (
    <Screen edges={["bottom"]}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.titleSection}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>Confirm Admission</Text>
          <Text style={[styles.subtitle, { color: colors.textMuted }]}>Work through each step, then review before confirming.</Text>
        </View>

        {draftSavedAt ? (
          <View style={styles.draftSavedRow}>
            <Ionicons name="cloud-done-outline" size={14} color={colors.textMuted} />
            <Text style={[styles.draftSavedText, { color: colors.textMuted }]}>
              Draft saved {draftSavedAt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
            </Text>
          </View>
        ) : null}

        <View style={styles.stepRailWrap}>
          <StageRail stages={WIZARD_STEPS} currentKey={step} onSelect={(key) => setStep(key as WizardStep)} />
        </View>

        {step === "student" ? (
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

            <StepNavRow onNext={() => setStep("guardian")} colors={colors} pressedOpacity={pressedOpacity} />
          </View>
        ) : null}

        {step === "guardian" ? (
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

            <StepNavRow onBack={() => setStep("student")} onNext={() => setStep("documents")} colors={colors} pressedOpacity={pressedOpacity} />
          </View>
        ) : null}

        {step === "documents" ? (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, cardShadow]}>
            <View style={styles.docHeaderRow}>
              <Text style={[styles.cardTitle, { color: colors.textPrimary, marginBottom: 0 }]}>Documents</Text>
              <Text style={[styles.docCompletionText, { color: colors.textMuted }]}>
                {docCompletion.done}/{docCompletion.total} required
              </Text>
            </View>
            <DocumentChecklist documents={documents} onUpload={uploadChecklistDocument} />
            {docError ? <Text style={[styles.error, { color: colors.danger, marginTop: 8 }]}>{docError}</Text> : null}

            <StepNavRow onBack={() => setStep("guardian")} onNext={() => setStep("review")} colors={colors} pressedOpacity={pressedOpacity} />
          </View>
        ) : null}

        {step === "review" ? (
          <>
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, cardShadow]}>
              <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Review</Text>

              <Text style={[styles.reviewSectionLabel, { color: colors.textMuted }]}>Student</Text>
              <ReviewRow label="Full name" value={fullName || "—"} colors={colors} />
              <ReviewRow label="Date of birth" value={dateOfBirth || "—"} colors={colors} />
              <ReviewRow label="Class / section" value={selectedClassSection ? `${selectedClassSection.className} ${selectedClassSection.sectionName}` : "—"} colors={colors} />

              <Text style={[styles.reviewSectionLabel, { color: colors.textMuted, marginTop: 14 }]}>Guardian</Text>
              <ReviewRow label="Name" value={guardianName || "—"} colors={colors} />
              <ReviewRow label="Contact" value={guardianContact || "—"} colors={colors} />
              <ReviewRow label="Admission date" value={admissionDate || "—"} colors={colors} />

              <Text style={[styles.reviewSectionLabel, { color: colors.textMuted, marginTop: 14 }]}>Documents</Text>
              <ReviewRow
                label="Required documents"
                value={`${docCompletion.done}/${docCompletion.total} added`}
                colors={colors}
                warn={docCompletion.done < docCompletion.total}
              />
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

            <Pressable onPress={() => setStep("documents")} style={({ pressed }) => [styles.backLink, pressed && { opacity: pressedOpacity }]} accessibilityRole="button">
              <Text style={[styles.backLinkText, { color: colors.textSecondary }]}>Back to Documents</Text>
            </Pressable>
          </>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

function StepNavRow({
  onBack,
  onNext,
  colors,
  pressedOpacity,
}: {
  onBack?: () => void;
  onNext: () => void;
  colors: ReturnType<typeof useTheme>["colors"];
  pressedOpacity: number;
}) {
  return (
    <View style={styles.stepNavRow}>
      {onBack ? (
        <Pressable
          onPress={onBack}
          style={({ pressed }) => [styles.stepNavButton, { borderColor: colors.border }, pressed && { opacity: pressedOpacity }]}
          accessibilityRole="button"
        >
          <Text style={[styles.stepNavButtonText, { color: colors.textSecondary }]}>Back</Text>
        </Pressable>
      ) : (
        <View style={styles.stepNavButton} />
      )}
      <Pressable
        onPress={onNext}
        style={({ pressed }) => [styles.stepNavButton, styles.stepNavButtonPrimary, { backgroundColor: colors.accent }, pressed && { opacity: pressedOpacity }]}
        accessibilityRole="button"
      >
        <Text style={[styles.stepNavButtonText, { color: colors.accentOn }]}>Next</Text>
      </Pressable>
    </View>
  );
}

function ReviewRow({
  label,
  value,
  colors,
  warn,
}: {
  label: string;
  value: string;
  colors: ReturnType<typeof useTheme>["colors"];
  warn?: boolean;
}) {
  return (
    <View style={styles.reviewRow}>
      <Text style={[styles.reviewLabel, { color: colors.textMuted }]}>{label}</Text>
      <Text style={[styles.reviewValue, { color: warn ? colors.warning : colors.textPrimary }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 32 },
  centered: { justifyContent: "center", alignItems: "center" },
  titleSection: { marginBottom: 12 },
  title: { fontSize: 24, fontWeight: "800", letterSpacing: -0.5 },
  subtitle: { fontSize: 13, marginTop: 2, fontWeight: "500" },
  draftSavedRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 12 },
  draftSavedText: { fontSize: 12, fontWeight: "600" },
  stepRailWrap: { marginBottom: 16 },
  confirmedBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    marginBottom: 16,
  },
  confirmedBannerText: { fontSize: 13, fontWeight: "700" },
  card: { borderWidth: 1, borderRadius: 16, padding: 16, marginBottom: 16 },
  cardTitle: { fontSize: 15, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.3, marginBottom: 8 },
  docHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  docCompletionText: { fontSize: 12, fontWeight: "700" },
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
  saveButton: { borderRadius: 10, height: 48, alignItems: "center", marginTop: 4, justifyContent: "center" },
  saveButtonDisabled: { opacity: 0.6 },
  buttonInner: { flexDirection: "row", alignItems: "center", gap: 8 },
  saveButtonText: { fontSize: 15, fontWeight: "700" },
  backLink: { alignItems: "center", marginTop: 14 },
  backLinkText: { fontSize: 13, fontWeight: "700" },
  stepNavRow: { flexDirection: "row", gap: 10, marginTop: 18 },
  stepNavButton: { flex: 1, minHeight: 44, borderRadius: 10, borderWidth: 1, borderColor: "transparent", alignItems: "center", justifyContent: "center" },
  stepNavButtonPrimary: { borderWidth: 0 },
  stepNavButtonText: { fontSize: 13, fontWeight: "800" },
  reviewSectionLabel: { fontSize: 11, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.5 },
  reviewRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 8, borderBottomWidth: 0 },
  reviewLabel: { fontSize: 12, fontWeight: "600" },
  reviewValue: { fontSize: 13, fontWeight: "700" },
  lockedWrap: { flex: 1, padding: 16, justifyContent: "center" },
  lockedCard: { borderWidth: 1, borderRadius: 20, padding: 28, alignItems: "center" },
  lockedIconWrap: { width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center", marginBottom: 14 },
  lockedTitle: { fontSize: 17, fontWeight: "800", marginBottom: 8 },
  lockedBody: { fontSize: 13, lineHeight: 20, textAlign: "center" },
  lockedButton: { borderRadius: 10, paddingHorizontal: 20, paddingVertical: 12, marginTop: 18 },
  lockedButtonText: { fontSize: 13, fontWeight: "800" },
});
