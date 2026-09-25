import { useCallback, useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform, Share } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../../navigation/types";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../theme/ThemeContext";
import { spacing, softCardShadow } from "../../theme/tokens";
import { Screen } from "../../components/Screen";
import { DatePicker } from "../../components/DatePicker";
import { api, ClassSection, ClassJoinRequest, getClassJoinLink } from "../../api/client";
import { capitalizeFirst } from "../../utils/text";
import { getRelativeDateLabel } from "../../utils/date";
import { parseCsv, rowsToStudentRows, STUDENT_CSV_TEMPLATE } from "../../utils/studentCsv";

// Every way to add a student, in one page: manual entry, bulk CSV upload,
// and invite-by-link (which stays class-level, not universal - generating
// one just means picking which class first). Reached from the Students
// roster's "+". Available to every teacher, individual or institutional.
// See Docs/superpowers/plans/2026-09-09-individual-teacher-onboarding-and-
// credits.md.

type Props = NativeStackScreenProps<RootStackParamList, "AddStudent">;
type Mode = "manual" | "bulk" | "invite";

function classLabel(section: { className: string; sectionName: string } | undefined): string {
  if (!section) return "";
  return `${capitalizeFirst(section.className)} ${capitalizeFirst(section.sectionName)}`;
}

const EMPTY_MANUAL_FORM = { fullName: "", dateOfBirth: "", guardianName: "", guardianContact: "", email: "" };

const STATUS_COLORS: Record<string, string> = {
  pending: "#F2A93B",
  approved: "#3DDC97",
  rejected: "#F4739C",
};

export function AddStudentScreen({ navigation }: Props) {
  const { accessToken } = useAuth();
  const { colors, cardShadow, pressedOpacity } = useTheme();

  const [mode, setMode] = useState<Mode>("manual");
  const [classSections, setClassSections] = useState<ClassSection[]>([]);
  const [classId, setClassId] = useState<string | null>(null);
  const [isLoadingClasses, setIsLoadingClasses] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [manualForm, setManualForm] = useState(EMPTY_MANUAL_FORM);
  const [isSavingManual, setIsSavingManual] = useState(false);
  const [addedStudent, setAddedStudent] = useState<string | null>(null);

  const [isUploadingCsv, setIsUploadingCsv] = useState(false);
  const [uploadResult, setUploadResult] = useState<{ created: number; skipped: number } | null>(null);

  const [requests, setRequests] = useState<ClassJoinRequest[]>([]);
  const [isLoadingRequests, setIsLoadingRequests] = useState(false);
  const [statusFilter, setStatusFilter] = useState<"pending" | "approved" | "rejected" | "">("pending");
  const [decidingId, setDecidingId] = useState<string | null>(null);

  const loadClasses = useCallback(async () => {
    if (!accessToken) return;
    setIsLoadingClasses(true);
    try {
      const sections = await api.listClassSections(accessToken);
      setClassSections(sections);
      setClassId((prev) => prev ?? sections[0]?.id ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load classes");
    } finally {
      setIsLoadingClasses(false);
    }
  }, [accessToken]);

  const loadRequests = useCallback(async () => {
    if (!accessToken) return;
    setIsLoadingRequests(true);
    try {
      setRequests(await api.listAllJoinRequests(accessToken, { status: statusFilter || undefined }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load invite requests");
    } finally {
      setIsLoadingRequests(false);
    }
  }, [accessToken, statusFilter]);

  useFocusEffect(
    useCallback(() => {
      loadClasses();
    }, [loadClasses])
  );

  useFocusEffect(
    useCallback(() => {
      if (mode === "invite") loadRequests();
    }, [mode, loadRequests])
  );

  async function saveManualStudent() {
    if (!accessToken || !classId) return;
    if (!manualForm.fullName.trim() || !manualForm.dateOfBirth || !manualForm.guardianName.trim() || !manualForm.guardianContact.trim() || !manualForm.email.includes("@")) return;
    setIsSavingManual(true);
    setError(null);
    setAddedStudent(null);
    try {
      await api.createStudent(accessToken, {
        fullName: manualForm.fullName.trim(),
        dateOfBirth: manualForm.dateOfBirth,
        classSectionId: classId,
        guardianName: manualForm.guardianName.trim(),
        guardianContact: manualForm.guardianContact.trim(),
        email: manualForm.email.trim(),
      });
      setAddedStudent(manualForm.fullName.trim());
      setManualForm(EMPTY_MANUAL_FORM);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add student");
    } finally {
      setIsSavingManual(false);
    }
  }

  async function shareCsvTemplate() {
    const fileUri = `${FileSystem.cacheDirectory}student_upload_template.csv`;
    await FileSystem.writeAsStringAsync(fileUri, STUDENT_CSV_TEMPLATE, {
      encoding: FileSystem.EncodingType.UTF8,
    });
    const canShare = await Sharing.isAvailableAsync();
    if (canShare) {
      await Sharing.shareAsync(fileUri, {
        mimeType: "text/csv",
        dialogTitle: "Student upload template",
        UTI: "public.comma-separated-values-text",
      });
    } else {
      setError(`Template saved to ${fileUri}`);
    }
  }

  async function pickAndUploadCsv() {
    if (!accessToken || !classId) return;
    const result = await DocumentPicker.getDocumentAsync({ type: ["text/csv", "text/comma-separated-values", "*/*"] });
    if (result.canceled || !result.assets?.[0]) return;

    setIsUploadingCsv(true);
    setError(null);
    setUploadResult(null);
    try {
      const response = await fetch(result.assets[0].uri);
      const text = await response.text();
      const rows = rowsToStudentRows(parseCsv(text));
      if (rows.length === 0) {
        setError("No student rows found in that file - check it matches the template columns.");
        return;
      }
      const res = await api.bulkAddStudents(accessToken, classId, rows);
      setUploadResult({ created: res.created, skipped: res.skipped.length });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to upload students");
    } finally {
      setIsUploadingCsv(false);
    }
  }

  async function shareLink() {
    if (!classId) return;
    const section = classSections.find((c) => c.id === classId);
    if (!section) return;
    const link = getClassJoinLink(section.joinCode);
    await Share.share({ message: `Join ${classLabel(section)} on EduWand: ${link}` });
  }

  async function decide(id: string, decision: "approved" | "rejected") {
    if (!accessToken) return;
    setDecidingId(id);
    try {
      await api.decideClassJoinRequest(accessToken, id, { decision });
      await loadRequests();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to decide request");
    } finally {
      setDecidingId(null);
    }
  }

  return (
    <Screen edges={["top", "bottom"]}>
      <KeyboardAvoidingView style={styles.keyboardAvoidingView} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.topBar}>
            <Pressable
              onPress={() => navigation.goBack()}
              style={({ pressed }) => [styles.backButton, { backgroundColor: colors.surface, borderColor: colors.border }, pressed && { opacity: pressedOpacity }]}
              accessibilityRole="button"
              accessibilityLabel="Go back"
            >
              <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
            </Pressable>
            <Text style={[styles.title, { color: colors.textPrimary }]}>Add students</Text>
          </View>

          <View style={styles.modeRow}>
            {(
              [
                { key: "manual", label: "Manual", icon: "person-add-outline" as const },
                { key: "bulk", label: "Bulk upload", icon: "cloud-upload-outline" as const },
                { key: "invite", label: "Invite link", icon: "share-social-outline" as const },
              ] as const
            ).map((m) => (
              <Pressable
                key={m.key}
                onPress={() => setMode(m.key)}
                style={[styles.modeChip, { backgroundColor: mode === m.key ? colors.accent : colors.surfaceAccent }]}
              >
                <Ionicons name={m.icon} size={14} color={mode === m.key ? colors.accentOn : colors.textPrimary} />
                <Text style={{ color: mode === m.key ? colors.accentOn : colors.textPrimary, fontWeight: "700", fontSize: 12 }}>{m.label}</Text>
              </Pressable>
            ))}
          </View>

          {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}

          <Text style={[styles.label, { color: colors.textPrimary, marginTop: 20 }]}>Class</Text>
          {isLoadingClasses ? (
            <ActivityIndicator color={colors.accent} style={{ marginTop: 10 }} />
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {classSections.map((c) => (
                <Pressable
                  key={c.id}
                  onPress={() => setClassId(c.id)}
                  style={[styles.filterChip, { backgroundColor: classId === c.id ? colors.accent : colors.surfaceAccent }]}
                >
                  <Text style={{ color: classId === c.id ? colors.accentOn : colors.textPrimary, fontWeight: "700", fontSize: 12 }}>{classLabel(c)}</Text>
                </Pressable>
              ))}
            </ScrollView>
          )}

          {mode === "manual" ? (
            <View style={[styles.card, { backgroundColor: colors.surface, borderWidth: 0 }, cardShadow]}>
              <Text style={[styles.label, { color: colors.textPrimary, marginTop: 0 }]}>Full name</Text>
              <TextInput
                style={[styles.input, { color: colors.textPrimary, borderColor: colors.border }]}
                value={manualForm.fullName}
                onChangeText={(v) => setManualForm((f) => ({ ...f, fullName: v }))}
                placeholder="Student's full name"
                placeholderTextColor={colors.textMuted}
              />
              <Text style={[styles.label, { color: colors.textPrimary }]}>Date of birth</Text>
              <DatePicker value={manualForm.dateOfBirth} onChange={(v) => setManualForm((f) => ({ ...f, dateOfBirth: v }))} placeholder="Select date of birth" />
              <Text style={[styles.label, { color: colors.textPrimary }]}>Guardian name</Text>
              <TextInput
                style={[styles.input, { color: colors.textPrimary, borderColor: colors.border }]}
                value={manualForm.guardianName}
                onChangeText={(v) => setManualForm((f) => ({ ...f, guardianName: v }))}
                placeholder="Guardian's name"
                placeholderTextColor={colors.textMuted}
              />
              <Text style={[styles.label, { color: colors.textPrimary }]}>Guardian phone (for calls and records)</Text>
              <TextInput
                style={[styles.input, { color: colors.textPrimary, borderColor: colors.border }]}
                value={manualForm.guardianContact}
                onChangeText={(v) => setManualForm((f) => ({ ...f, guardianContact: v }))}
                placeholder="Phone number"
                placeholderTextColor={colors.textMuted}
                keyboardType="phone-pad"
              />
              <Text style={[styles.label, { color: colors.textPrimary }]}>Student email (used to sign in)</Text>
              <TextInput
                style={[styles.input, { color: colors.textPrimary, borderColor: colors.border }]}
                value={manualForm.email}
                onChangeText={(v) => setManualForm((f) => ({ ...f, email: v }))}
                placeholder="student@example.com"
                placeholderTextColor={colors.textMuted}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
              {addedStudent ? <Text style={[styles.hint, { color: colors.accent, marginTop: 10 }]}>Added {addedStudent}.</Text> : null}
              <Pressable
                onPress={saveManualStudent}
                disabled={isSavingManual || !classId}
                style={[styles.saveButton, { backgroundColor: colors.accent }, isSavingManual && { opacity: 0.6 }]}
              >
                {isSavingManual ? <ActivityIndicator color={colors.accentOn} /> : <Text style={[styles.saveButtonText, { color: colors.accentOn }]}>Add student</Text>}
              </Pressable>
            </View>
          ) : mode === "bulk" ? (
            <View style={[styles.card, { backgroundColor: colors.surface, borderWidth: 0 }, cardShadow]}>
              <Text style={[styles.hint, { color: colors.textMuted }]}>
                Upload a CSV (opens fine in Excel) with columns: full_name, date_of_birth, guardian_name, guardian_contact, email (the student's sign-in email).
              </Text>
              <View style={{ flexDirection: "row", gap: 10, marginTop: 14 }}>
                <Pressable onPress={shareCsvTemplate} style={[styles.saveButton, styles.saveButtonSecondary, { borderColor: colors.border, flex: 1, marginTop: 0 }]}>
                  <Text style={[styles.saveButtonText, { color: colors.textPrimary }]}>Get template</Text>
                </Pressable>
                <Pressable
                  onPress={pickAndUploadCsv}
                  disabled={isUploadingCsv || !classId}
                  style={[styles.saveButton, { backgroundColor: colors.accent, flex: 1, marginTop: 0, opacity: isUploadingCsv ? 0.6 : 1 }]}
                >
                  {isUploadingCsv ? <ActivityIndicator color={colors.accentOn} /> : <Text style={[styles.saveButtonText, { color: colors.accentOn }]}>Upload CSV</Text>}
                </Pressable>
              </View>
              {uploadResult ? (
                <Text style={[styles.hint, { color: colors.accent, marginTop: 10 }]}>
                  Added {uploadResult.created} student{uploadResult.created === 1 ? "" : "s"}
                  {uploadResult.skipped > 0 ? `, skipped ${uploadResult.skipped} row(s)` : ""}.
                </Text>
              ) : null}
            </View>
          ) : (
            <>
              <View style={[styles.card, { backgroundColor: colors.surface, borderWidth: 0 }, cardShadow]}>
                <Text style={[styles.hint, { color: colors.textMuted }]}>
                  This link is only for the class selected above. Parents/students who open it just submit a request - you
                  still confirm each one below before they're added.
                </Text>
                <Pressable onPress={shareLink} disabled={!classId} style={[styles.saveButton, { backgroundColor: colors.accent, marginTop: 14 }]}>
                  <Text style={[styles.saveButtonText, { color: colors.accentOn }]}>Share join link</Text>
                </Pressable>
              </View>

              <View style={styles.filterRow}>
                {(["pending", "approved", "rejected", ""] as const).map((s) => (
                  <Pressable
                    key={s || "all"}
                    onPress={() => setStatusFilter(s)}
                    style={[styles.smallChip, { backgroundColor: statusFilter === s ? colors.accent : colors.surfaceAccent }]}
                  >
                    <Text style={{ color: statusFilter === s ? colors.accentOn : colors.textPrimary, fontWeight: "700", fontSize: 11, textTransform: "capitalize" }}>
                      {s || "All"}
                    </Text>
                  </Pressable>
                ))}
              </View>

              {isLoadingRequests ? (
                <ActivityIndicator color={colors.accent} style={{ marginTop: 20 }} />
              ) : requests.length === 0 ? (
                <Text style={[styles.hint, { color: colors.textMuted, marginTop: 16 }]}>No requests here.</Text>
              ) : (
                requests.map((req) => (
                  <View key={req.id} style={[styles.requestCard, { backgroundColor: colors.surface, borderWidth: 0 }, cardShadow]}>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                        <Text style={[styles.rowName, { color: colors.textPrimary }]}>{req.studentName}</Text>
                        <View style={[styles.statusDot, { backgroundColor: STATUS_COLORS[req.status] ?? colors.textMuted }]} />
                      </View>
                      <Text style={[styles.hint, { color: colors.textMuted }]}>
                        {classLabel(req.classSection)} · {req.guardianName} · {req.guardianContact}
                      </Text>
                      <Text style={[styles.hint, { color: colors.textMuted }]}>{getRelativeDateLabel(req.submittedAt)}</Text>
                    </View>
                    {req.status === "pending" ? (
                      <View style={{ flexDirection: "row", gap: 8 }}>
                        <Pressable onPress={() => decide(req.id, "approved")} disabled={decidingId === req.id} style={[styles.smallButton, { backgroundColor: colors.accent }]}>
                          <Ionicons name="checkmark" size={16} color={colors.accentOn} />
                        </Pressable>
                        <Pressable
                          onPress={() => decide(req.id, "rejected")}
                          disabled={decidingId === req.id}
                          style={[styles.smallButton, { borderWidth: 1, borderColor: colors.danger }]}
                        >
                          <Ionicons name="close" size={16} color={colors.danger} />
                        </Pressable>
                      </View>
                    ) : null}
                  </View>
                ))
              )}
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  keyboardAvoidingView: {
    flex: 1,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: 60,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 20,
    fontWeight: "800",
  },
  modeRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 16,
  },
  modeChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  error: {
    marginTop: 14,
    fontSize: 13,
  },
  label: {
    fontSize: 13,
    fontWeight: "700",
    marginTop: 12,
    marginBottom: 6,
  },
  filterChip: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  card: {
    ...softCardShadow,
    marginTop: 16,
    borderRadius: 16,
    padding: 16,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  hint: {
    fontSize: 12,
    lineHeight: 17,
  },
  saveButton: {
    marginTop: 20,
    borderRadius: 14,
    height: 50,
    alignItems: "center",
    justifyContent: "center",
  },
  saveButtonSecondary: {
    backgroundColor: "transparent",
    borderWidth: 1,
  },
  saveButtonText: {
    fontSize: 15,
    fontWeight: "700",
  },
  filterRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 16,
  },
  smallChip: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  requestCard: {
    ...softCardShadow,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 14,
    padding: 14,
    marginTop: 10,
  },
  rowName: {
    fontSize: 14,
    fontWeight: "700",
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  smallButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
});
