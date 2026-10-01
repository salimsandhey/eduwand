import { useCallback, useEffect, useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView, ActivityIndicator, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SheetModal } from "./SheetModal";
import { useTheme } from "../theme/ThemeContext";
import { spacing, radius } from "../theme/tokens";
import { api, ClassSection, DeletedClassSection } from "../api/client";
import { downloadClassBackup } from "../utils/classBackup";
import { capitalizeFirst } from "../utils/text";

const GRACE_DAYS = 30;

function classLabel(c: { className: string; sectionName: string }): string {
  return `${c.className} ${c.sectionName}`.trim();
}

function namesMatch(typed: string, c: { className: string; sectionName: string }): boolean {
  const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();
  return norm(typed) === norm(classLabel(c));
}

function daysLeft(purgeAt: string): number {
  return Math.max(0, Math.ceil((new Date(purgeAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000)));
}

interface ClassOptionsSheetProps {
  classSection: ClassSection | null;
  schoolId: string;
  accessToken: string;
  onClose: () => void;
  /** A class was deleted - the caller should reload its list. */
  onDeleted: () => void;
}

// "Class options" for one class: download a backup zip, or delete it. Delete
// is the reversible archive step (30 days in Recently deleted), gated by
// typing the class name.
export function ClassOptionsSheet({ classSection, schoolId, accessToken, onClose, onDeleted }: ClassOptionsSheetProps) {
  const { colors, pressedOpacity } = useTheme();
  const [step, setStep] = useState<"menu" | "confirm">("menu");
  const [typedName, setTypedName] = useState("");
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [hasBackup, setHasBackup] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setStep("menu");
    setTypedName("");
    setHasBackup(false);
    setError(null);
  }, [classSection?.id]);

  const backup = useCallback(async () => {
    if (!classSection) return;
    setIsBackingUp(true);
    setError(null);
    try {
      await downloadClassBackup(accessToken, schoolId, classSection);
      setHasBackup(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the backup");
    } finally {
      setIsBackingUp(false);
    }
  }, [accessToken, schoolId, classSection]);

  async function deleteClass() {
    if (!classSection) return;
    setIsDeleting(true);
    setError(null);
    try {
      await api.deleteClassSection(accessToken, schoolId, classSection.id, typedName);
      onDeleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete the class");
    } finally {
      setIsDeleting(false);
    }
  }

  const label = classSection ? `${capitalizeFirst(classSection.className)} · ${capitalizeFirst(classSection.sectionName)}` : "";
  const canDelete = !!classSection && namesMatch(typedName, classSection) && !isDeleting;

  return (
    <SheetModal visible={!!classSection} onClose={onClose} closeLabel="Close class options">
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={1}>{step === "menu" ? label : `Delete ${label}?`}</Text>
          <Text style={[styles.subtitle, { color: colors.textMuted }]}>{step === "menu" ? "Class options" : "This hides the class from you and your students."}</Text>
        </View>
        <Pressable style={[styles.closeButton, { backgroundColor: colors.surfaceRaised }]} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close">
          <Ionicons name="close" size={20} color={colors.textPrimary} />
        </Pressable>
      </View>

      {step === "menu" ? (
        <>
          <Pressable
            onPress={backup}
            disabled={isBackingUp}
            style={({ pressed }) => [styles.optionRow, { borderColor: colors.border, backgroundColor: colors.surface }, pressed && { opacity: pressedOpacity }]}
            accessibilityRole="button"
          >
            {isBackingUp ? <ActivityIndicator color={colors.accent} /> : <Ionicons name="download-outline" size={22} color={colors.accent} />}
            <View style={styles.optionCopy}>
              <Text style={[styles.optionTitle, { color: colors.textPrimary }]}>Download all data</Text>
              <Text style={[styles.optionHint, { color: colors.textMuted }]}>Students, lessons, assignments, grades and more, as one .zip file.</Text>
            </View>
          </Pressable>
          <Pressable
            onPress={() => setStep("confirm")}
            style={({ pressed }) => [styles.optionRow, { borderColor: colors.border, backgroundColor: colors.surface }, pressed && { opacity: pressedOpacity }]}
            accessibilityRole="button"
          >
            <Ionicons name="trash-outline" size={22} color={colors.danger} />
            <View style={styles.optionCopy}>
              <Text style={[styles.optionTitle, { color: colors.danger }]}>Delete class</Text>
              <Text style={[styles.optionHint, { color: colors.textMuted }]}>You can restore it for {GRACE_DAYS} days.</Text>
            </View>
          </Pressable>
        </>
      ) : (
        <>
          <Text style={[styles.body, { color: colors.textMuted }]}>
            The class, its students, lessons, assignments and grades move to Recently deleted. You can restore it within {GRACE_DAYS} days; after that everything is deleted permanently.
          </Text>
          <Pressable
            onPress={backup}
            disabled={isBackingUp}
            style={({ pressed }) => [styles.secondaryButton, { borderColor: colors.accent }, pressed && { opacity: pressedOpacity }]}
            accessibilityRole="button"
          >
            {isBackingUp ? (
              <ActivityIndicator color={colors.accent} />
            ) : (
              <>
                <Ionicons name={hasBackup ? "checkmark-circle" : "download-outline"} size={18} color={colors.accent} />
                <Text style={[styles.secondaryButtonText, { color: colors.accent }]}>{hasBackup ? "Backup downloaded - download again" : "Download backup first (recommended)"}</Text>
              </>
            )}
          </Pressable>
          <Text style={[styles.label, { color: colors.textPrimary }]}>Type “{classLabel(classSection ?? { className: "", sectionName: "" })}” to confirm</Text>
          <TextInput
            style={[styles.input, { color: colors.textPrimary, borderColor: colors.border }]}
            value={typedName}
            onChangeText={setTypedName}
            placeholder={classSection ? classLabel(classSection) : ""}
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Pressable
            onPress={deleteClass}
            disabled={!canDelete}
            style={[styles.dangerButton, { backgroundColor: colors.danger }, !canDelete && { opacity: 0.5 }]}
            accessibilityRole="button"
          >
            {isDeleting ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.dangerButtonText}>Delete class</Text>}
          </Pressable>
        </>
      )}

      {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}
    </SheetModal>
  );
}

interface DeletedClassesSheetProps {
  visible: boolean;
  schoolId: string;
  accessToken: string;
  onClose: () => void;
  /** A class was restored - the caller should reload its list. */
  onRestored: () => void;
}

// "Recently deleted": restore, download a backup of, or permanently delete
// classes still inside their 30-day window.
export function DeletedClassesSheet({ visible, schoolId, accessToken, onClose, onRestored }: DeletedClassesSheetProps) {
  const { colors, pressedOpacity } = useTheme();
  const [items, setItems] = useState<DeletedClassSection[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [purgeTarget, setPurgeTarget] = useState<DeletedClassSection | null>(null);
  const [typedName, setTypedName] = useState("");
  const [skipBackup, setSkipBackup] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      setItems(await api.listDeletedClassSections(accessToken, schoolId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load deleted classes");
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, schoolId]);

  useEffect(() => {
    if (visible) {
      setPurgeTarget(null);
      load();
    }
  }, [visible, load]);

  async function run(id: string, action: () => Promise<void>) {
    setBusyId(id);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusyId(null);
    }
  }

  const restore = (c: DeletedClassSection) =>
    run(c.id, async () => {
      await api.restoreClassSection(accessToken, schoolId, c.id);
      await load();
      onRestored();
    });

  const backup = (c: DeletedClassSection) =>
    run(c.id, async () => {
      await downloadClassBackup(accessToken, schoolId, c);
      await load();
    });

  const purge = () =>
    purgeTarget &&
    run(purgeTarget.id, async () => {
      await api.permanentlyDeleteClassSection(accessToken, schoolId, purgeTarget.id, { confirmName: typedName, skipBackup: skipBackup || undefined });
      setPurgeTarget(null);
      await load();
    });

  function startPurge(c: DeletedClassSection) {
    setTypedName("");
    setSkipBackup(false);
    setError(null);
    setPurgeTarget(c);
  }

  const canPurge = !!purgeTarget && namesMatch(typedName, purgeTarget) && (!!purgeTarget.exportedAt || skipBackup) && busyId === null;

  return (
    <SheetModal visible={visible} onClose={onClose} closeLabel="Close recently deleted">
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>Recently deleted</Text>
          <Text style={[styles.subtitle, { color: colors.textMuted }]}>Deleted classes are removed for good after {GRACE_DAYS} days.</Text>
        </View>
        <Pressable style={[styles.closeButton, { backgroundColor: colors.surfaceRaised }]} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close">
          <Ionicons name="close" size={20} color={colors.textPrimary} />
        </Pressable>
      </View>

      {isLoading ? (
        <ActivityIndicator color={colors.accent} style={{ marginVertical: spacing.lg }} />
      ) : items.length === 0 ? (
        <Text style={[styles.body, { color: colors.textMuted }]}>No deleted classes.</Text>
      ) : purgeTarget ? (
        <>
          <Text style={[styles.body, { color: colors.textPrimary }]}>
            Delete {classLabel(purgeTarget)} permanently? All its students, lessons, assignments and grades are erased and cannot be recovered.
          </Text>
          {!purgeTarget.exportedAt ? (
            <Pressable
              onPress={() => setSkipBackup((v) => !v)}
              style={styles.checkRow}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: skipBackup }}
            >
              <Ionicons name={skipBackup ? "checkbox" : "square-outline"} size={22} color={colors.danger} />
              <Text style={[styles.checkText, { color: colors.textPrimary }]}>I haven't downloaded a backup and I don't need one</Text>
            </Pressable>
          ) : null}
          <Text style={[styles.label, { color: colors.textPrimary }]}>Type “{classLabel(purgeTarget)}” to confirm</Text>
          <TextInput
            style={[styles.input, { color: colors.textPrimary, borderColor: colors.border }]}
            value={typedName}
            onChangeText={setTypedName}
            placeholder={classLabel(purgeTarget)}
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Pressable onPress={purge} disabled={!canPurge} style={[styles.dangerButton, { backgroundColor: colors.danger }, !canPurge && { opacity: 0.5 }]} accessibilityRole="button">
            {busyId ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.dangerButtonText}>Delete permanently</Text>}
          </Pressable>
          <Pressable onPress={() => setPurgeTarget(null)} style={styles.cancelLink} accessibilityRole="button">
            <Text style={[styles.cancelLinkText, { color: colors.textMuted }]}>Cancel</Text>
          </Pressable>
        </>
      ) : (
        <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
          {items.map((c) => {
            const busy = busyId === c.id;
            return (
              <View key={c.id} style={[styles.deletedCard, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                <Text style={[styles.optionTitle, { color: colors.textPrimary }]}>{capitalizeFirst(c.className)} · {capitalizeFirst(c.sectionName)}</Text>
                <Text style={[styles.optionHint, { color: colors.textMuted }]}>
                  {c.studentCount} student{c.studentCount === 1 ? "" : "s"} · {c.topicCount} topic{c.topicCount === 1 ? "" : "s"} · {daysLeft(c.purgeAt)} day{daysLeft(c.purgeAt) === 1 ? "" : "s"} left
                  {c.exportedAt ? " · backup saved" : ""}
                </Text>
                <View style={styles.actionRow}>
                  <Pressable onPress={() => restore(c)} disabled={busy} style={({ pressed }) => [styles.actionButton, { backgroundColor: colors.accent }, pressed && { opacity: pressedOpacity }]} accessibilityRole="button">
                    <Text style={[styles.actionText, { color: colors.accentOn }]}>Restore</Text>
                  </Pressable>
                  <Pressable onPress={() => backup(c)} disabled={busy} style={({ pressed }) => [styles.actionButton, { borderColor: colors.border, borderWidth: 1 }, pressed && { opacity: pressedOpacity }]} accessibilityRole="button">
                    {busy ? <ActivityIndicator color={colors.accent} size="small" /> : <Text style={[styles.actionText, { color: colors.textPrimary }]}>Backup</Text>}
                  </Pressable>
                  <Pressable onPress={() => startPurge(c)} disabled={busy} style={({ pressed }) => [styles.actionButton, { borderColor: colors.danger, borderWidth: 1 }, pressed && { opacity: pressedOpacity }]} accessibilityRole="button">
                    <Text style={[styles.actionText, { color: colors.danger }]}>Delete forever</Text>
                  </Pressable>
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}

      {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}
    </SheetModal>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: spacing.md, marginBottom: spacing.md },
  headerCopy: { flex: 1 },
  title: { fontSize: 20, fontWeight: "700" },
  subtitle: { fontSize: 13, marginTop: 2 },
  closeButton: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  body: { fontSize: 14, lineHeight: 20, marginBottom: spacing.md },
  optionRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md, borderWidth: 1, borderRadius: radius.lg, marginBottom: spacing.sm },
  optionCopy: { flex: 1 },
  optionTitle: { fontSize: 15, fontWeight: "600" },
  optionHint: { fontSize: 12, marginTop: 2 },
  secondaryButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, borderWidth: 1, borderRadius: radius.lg, paddingVertical: 12, paddingHorizontal: spacing.md, marginBottom: spacing.md },
  secondaryButtonText: { fontSize: 14, fontWeight: "600" },
  label: { fontSize: 13, fontWeight: "600", marginBottom: spacing.xs },
  input: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 10, fontSize: 15, marginBottom: spacing.md },
  dangerButton: { alignItems: "center", justifyContent: "center", borderRadius: radius.lg, paddingVertical: 14 },
  dangerButtonText: { color: "#FFFFFF", fontSize: 15, fontWeight: "700" },
  cancelLink: { alignItems: "center", paddingVertical: spacing.md },
  cancelLinkText: { fontSize: 14 },
  checkRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.md },
  checkText: { flex: 1, fontSize: 13 },
  list: { maxHeight: 360 },
  deletedCard: { borderWidth: 1, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.sm },
  actionRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  actionButton: { flex: 1, alignItems: "center", justifyContent: "center", borderRadius: radius.md, paddingVertical: 9 },
  actionText: { fontSize: 13, fontWeight: "600" },
  error: { fontSize: 13, marginTop: spacing.sm },
});
