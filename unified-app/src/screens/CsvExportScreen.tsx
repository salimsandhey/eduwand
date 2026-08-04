import { useCallback, useState } from "react";
import { View, Text, Pressable, StyleSheet, ActivityIndicator, ScrollView, Platform } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useAuth } from "../context/AuthContext";
import { api, CsvExportLog } from "../api/client";
import { theme } from "../theme";

export function CsvExportScreen() {
  const { accessToken } = useAuth();
  const [log, setLog] = useState<CsvExportLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ id: string; content: string } | null>(null);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await api.listExportLog(accessToken);
      setLog(res.data ?? []);
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
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Pressable style={[styles.runButton, isRunning && styles.runButtonDisabled]} onPress={runExport} disabled={isRunning}>
        {isRunning ? <ActivityIndicator color="#fff" /> : <Text style={styles.runButtonText}>Run export now</Text>}
      </Pressable>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Text style={styles.sectionTitle}>Export history</Text>

      {isLoading ? (
        <ActivityIndicator />
      ) : log.length === 0 ? (
        <Text style={styles.meta}>No exports run yet</Text>
      ) : (
        log.map((entry) => (
          <View key={entry.id} style={styles.row}>
            <View style={styles.rowInfo}>
              <Text style={styles.rowDate}>{new Date(entry.runAt).toLocaleString()}</Text>
              <Text style={styles.meta}>
                {entry.status} · {entry.rowCount} row{entry.rowCount === 1 ? "" : "s"}
              </Text>
            </View>
            {entry.status === "success" ? (
              <Pressable style={styles.smallButton} onPress={() => download(entry.id)}>
                <Text style={styles.smallButtonText}>Download</Text>
              </Pressable>
            ) : null}
          </View>
        ))
      )}

      {preview ? (
        <View style={styles.previewBox}>
          <Text style={styles.sectionTitle}>Export {preview.id}</Text>
          <Text selectable style={styles.previewText}>{preview.content}</Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background },
  content: { padding: 16, paddingBottom: 60 },
  runButton: { backgroundColor: theme.accent, borderRadius: 8, padding: 14, alignItems: "center" },
  runButtonDisabled: { opacity: 0.6 },
  runButtonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  sectionTitle: { fontSize: 15, fontWeight: "700", color: theme.text, marginTop: 24, marginBottom: 8 },
  meta: { color: theme.textMuted },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: theme.card,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  rowInfo: { flexShrink: 1 },
  rowDate: { fontWeight: "600", color: theme.text },
  smallButton: { backgroundColor: theme.accent, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 6 },
  smallButtonText: { color: "#fff", fontWeight: "600", fontSize: 13 },
  error: { color: theme.danger, textAlign: "center", marginTop: 12 },
  previewBox: { backgroundColor: theme.card, borderWidth: 1, borderColor: theme.border, borderRadius: 8, padding: 12, marginTop: 12 },
  previewText: { fontFamily: Platform.OS === "web" ? "monospace" : undefined, fontSize: 12, color: theme.text },
});
