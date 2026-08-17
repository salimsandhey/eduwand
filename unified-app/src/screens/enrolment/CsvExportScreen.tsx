import { useCallback, useState, useRef } from "react";
import { View, Text, Pressable, StyleSheet, ActivityIndicator, ScrollView, Platform, Animated, Switch } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../theme/ThemeContext";
import { api, CsvExportLog, CsvExportSchedule } from "../../api/client";
import { Screen } from "../../components/Screen";

export function CsvExportScreen() {
  const { accessToken } = useAuth();
  const { colors, cardShadow, pressedOpacity } = useTheme();
  const [log, setLog] = useState<CsvExportLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ id: string; content: string } | null>(null);

  const [schedule, setSchedule] = useState<CsvExportSchedule | null>(null);
  const [isSavingSchedule, setIsSavingSchedule] = useState(false);

  // Button Scale Animation
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

  const load = useCallback(async () => {
    if (!accessToken) return;
    setIsLoading(true);
    setError(null);
    try {
      const [res, scheduleRes] = await Promise.all([
        api.listExportLog(accessToken),
        api.getExportSchedule(accessToken).catch(() => null),
      ]);
      setLog(res.data ?? []);
      setSchedule(scheduleRes);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load export log");
    } finally {
      setIsLoading(false);
    }
  }, [accessToken]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function toggleAutoExport(isActive: boolean) {
    if (!accessToken) return;
    setIsSavingSchedule(true);
    try {
      const updated = await api.updateExportSchedule(accessToken, {
        isActive,
        frequency: schedule?.frequency ?? "weekly",
      });
      setSchedule(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update automatic export");
    } finally {
      setIsSavingSchedule(false);
    }
  }

  async function setFrequency(frequency: "daily" | "weekly") {
    if (!accessToken) return;
    setIsSavingSchedule(true);
    try {
      const updated = await api.updateExportSchedule(accessToken, { frequency, isActive: schedule?.isActive ?? true });
      setSchedule(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update automatic export");
    } finally {
      setIsSavingSchedule(false);
    }
  }

  async function runExport() {
    if (!accessToken) return;
    setIsRunning(true);
    setError(null);
    try {
      await api.runExport(accessToken);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setIsRunning(false);
    }
  }

  async function download(id: string) {
    if (!accessToken) return;
    setError(null);
    try {
      const content = await api.downloadExport(accessToken, id);
      if (Platform.OS === "web") {
        const blob = new Blob([content], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `export-${id}.csv`;
        link.click();
        URL.revokeObjectURL(url);
      } else {
        // No file-system/share module installed yet for native - show the CSV inline instead.
        setPreview({ id, content });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Download failed");
    }
  }

  return (
    <Screen edges={["bottom"]}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        {/* Title Block */}
        <View style={styles.titleSection}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>CSV Export</Text>
          <Text style={[styles.subtitle, { color: colors.textMuted }]}>
            Export active admissions and contacts database
          </Text>
        </View>

        {/* Animated Button */}
        <Animated.View style={{ transform: [{ scale: buttonScale }] }}>
          <Pressable
            onPressIn={handlePressIn}
            onPressOut={handlePressOut}
            style={({ pressed }) => [
              styles.runButton,
              { backgroundColor: colors.accent },
              cardShadow,
              (isRunning || pressed) && styles.runButtonDisabled,
            ]}
            onPress={runExport}
            disabled={isRunning}
            accessibilityRole="button"
          >
            {isRunning ? (
              <ActivityIndicator color={colors.accentOn} />
            ) : (
              <View style={styles.buttonInner}>
                <Ionicons name="cloud-upload-outline" size={18} color={colors.accentOn} />
                <Text style={[styles.runButtonText, { color: colors.accentOn }]}>Run export now</Text>
              </View>
            )}
          </Pressable>
        </Animated.View>

        {/* Automatic export (FR-EG-11) */}
        <View style={[styles.scheduleCard, { backgroundColor: colors.surface, borderColor: colors.border }, cardShadow]}>
          <View style={styles.scheduleRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.scheduleTitle, { color: colors.textPrimary }]}>Automatic export</Text>
              <Text style={[styles.meta, { color: colors.textMuted, marginBottom: 0 }]}>
                Run this export on a recurring schedule
              </Text>
            </View>
            <Switch
              value={schedule?.isActive ?? false}
              onValueChange={toggleAutoExport}
              disabled={isSavingSchedule}
              trackColor={{ true: colors.accent }}
            />
          </View>
          {schedule?.isActive ? (
            <View style={styles.chipRow}>
              {(["daily", "weekly"] as const).map((f) => {
                const active = (schedule?.frequency ?? "weekly") === f;
                return (
                  <Pressable
                    key={f}
                    style={({ pressed }) => [
                      styles.freqChip,
                      { backgroundColor: active ? colors.accent : colors.surfaceRaised, borderColor: active ? colors.accent : colors.border },
                      pressed && { opacity: pressedOpacity },
                    ]}
                    onPress={() => setFrequency(f)}
                    disabled={isSavingSchedule}
                    accessibilityRole="button"
                  >
                    <Text style={[styles.freqChipText, { color: active ? colors.accentOn : colors.textSecondary }]}>{f}</Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}
        </View>

        {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}

        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Export history</Text>

        {isLoading ? (
          <ActivityIndicator color={colors.accent} style={{ marginVertical: 20 }} />
        ) : log.length === 0 ? (
          <View style={[styles.emptyContainer, { borderColor: colors.border }]}>
            <Text style={[styles.meta, { color: colors.textMuted }]}>No exports run yet</Text>
          </View>
        ) : (
          log.map((entry) => {
            const isSuccess = entry.status === "success";
            return (
              <View
                key={entry.id}
                style={[
                  styles.row,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                    borderLeftColor: isSuccess ? colors.accent : colors.danger,
                  },
                  cardShadow,
                ]}
              >
                <View style={styles.rowInfo}>
                  <Text style={[styles.rowDate, { color: colors.textPrimary }]}>
                    {new Date(entry.runAt).toLocaleString()}
                  </Text>
                  <Text style={[styles.metaText, { color: isSuccess ? colors.textMuted : colors.danger }]}>
                    {entry.status} · {entry.rowCount} row{entry.rowCount === 1 ? "" : "s"}
                  </Text>
                </View>
                {isSuccess ? (
                  <Pressable
                    style={({ pressed }) => [
                      styles.smallButton,
                      { backgroundColor: colors.accent },
                      pressed && { opacity: pressedOpacity },
                    ]}
                    onPress={() => download(entry.id)}
                    accessibilityRole="button"
                  >
                    <Ionicons name="download-outline" size={13} color={colors.accentOn} />
                    <Text style={[styles.smallButtonText, { color: colors.accentOn }]}>Download</Text>
                  </Pressable>
                ) : null}
              </View>
            );
          })
        )}

        {preview ? (
          <View style={[styles.previewBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.previewHeader}>
              <Text style={[styles.previewTitle, { color: colors.textPrimary }]}>Export Preview ({preview.id.slice(0, 8)})</Text>
              <Pressable onPress={() => setPreview(null)} hitSlop={8}>
                <Ionicons name="close-outline" size={20} color={colors.textMuted} />
              </Pressable>
            </View>
            <ScrollView horizontal style={styles.previewScroll} showsHorizontalScrollIndicator={false}>
              <Text selectable style={[styles.previewText, { color: colors.textPrimary }]}>
                {preview.content}
              </Text>
            </ScrollView>
          </View>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  titleSection: { marginBottom: 20 },
  title: { fontSize: 24, fontWeight: "800", letterSpacing: -0.5 },
  subtitle: { fontSize: 13, marginTop: 2, fontWeight: "500" },
  runButton: { borderRadius: 10, height: 48, alignItems: "center", justifyContent: "center" },
  runButtonDisabled: { opacity: 0.6 },
  buttonInner: { flexDirection: "row", alignItems: "center", gap: 8 },
  runButtonText: { fontSize: 15, fontWeight: "700" },
  scheduleCard: { borderWidth: 1, borderRadius: 14, padding: 14, marginTop: 16 },
  scheduleRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  scheduleTitle: { fontSize: 14, fontWeight: "700", marginBottom: 2 },
  chipRow: { flexDirection: "row", gap: 8, marginTop: 12 },
  freqChip: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 6 },
  freqChipText: { fontSize: 12, fontWeight: "700", textTransform: "capitalize" },
  sectionTitle: { fontSize: 14, fontWeight: "800", marginTop: 24, marginBottom: 10, letterSpacing: 0.2, textTransform: "uppercase" },
  emptyContainer: {
    borderWidth: 1,
    borderStyle: "dashed",
    borderRadius: 12,
    padding: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  meta: { fontSize: 13, fontWeight: "500" },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderWidth: 1,
    borderLeftWidth: 4,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  rowInfo: { flexShrink: 1 },
  rowDate: { fontSize: 14, fontWeight: "700" },
  metaText: { fontSize: 12, marginTop: 4, textTransform: "capitalize", fontWeight: "600" },
  smallButton: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 8, paddingHorizontal: 12, height: 34, justifyContent: "center" },
  smallButtonText: { fontWeight: "700", fontSize: 12 },
  error: { textAlign: "center", marginTop: 12 },
  previewBox: { borderWidth: 1, borderRadius: 12, padding: 14, marginTop: 20 },
  previewHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  previewTitle: { fontSize: 13, fontWeight: "700" },
  previewScroll: { marginTop: 6 },
  previewText: {
    fontFamily: Platform.OS === "web" ? "monospace" : undefined,
    fontSize: 11,
    lineHeight: 16,
  },
});
