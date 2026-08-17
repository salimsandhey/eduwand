import { useState } from "react";
import { View, Text, Pressable, StyleSheet, ScrollView, ActivityIndicator } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../theme/ThemeContext";
import { Screen } from "../../components/Screen";
import { api, CreateEnquiryInput } from "../../api/client";

// Matches backend/src/lib/csv.ts's fromCsv - duplicated by hand rather than
// shared, since the mobile app and backend are separate runtimes/packages.
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;

  while (i < text.length) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
        } else {
          inQuotes = false;
          i += 1;
        }
      } else {
        field += char;
        i += 1;
      }
      continue;
    }
    if (char === '"') {
      inQuotes = true;
      i += 1;
    } else if (char === ",") {
      row.push(field);
      field = "";
      i += 1;
    } else if (char === "\r") {
      i += 1;
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i += 1;
    } else {
      field += char;
      i += 1;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => !(r.length === 1 && r[0] === ""));
}

const TRUTHY = new Set(["true", "1", "yes", "y"]);

function rowsToEnquiries(csvRows: string[][]): CreateEnquiryInput[] {
  if (csvRows.length === 0) return [];
  const header = csvRows[0].map((h) => h.trim().toLowerCase());
  const col = (name: string) => header.indexOf(name);
  const nameIdx = col("contact_name");
  const phoneIdx = col("contact_phone");
  const emailIdx = col("contact_email");
  const sourceIdx = col("source");
  const gradeIdx = col("grade_interest");
  const consentIdx = col("consent_captured");

  return csvRows.slice(1).map((r) => ({
    contactName: r[nameIdx]?.trim() ?? "",
    contactPhone: r[phoneIdx]?.trim() ?? "",
    contactEmail: emailIdx >= 0 && r[emailIdx]?.trim() ? r[emailIdx].trim() : undefined,
    source: (r[sourceIdx]?.trim().toLowerCase() ?? "") as CreateEnquiryInput["source"],
    gradeInterest: gradeIdx >= 0 && r[gradeIdx]?.trim() ? r[gradeIdx].trim() : undefined,
    consentCaptured: consentIdx >= 0 ? TRUTHY.has(r[consentIdx]?.trim().toLowerCase() ?? "") : undefined,
  }));
}

export function BulkUploadScreen() {
  const { accessToken } = useAuth();
  const { colors, cardShadow, pressedOpacity } = useTheme();

  const [fileName, setFileName] = useState<string | null>(null);
  const [rows, setRows] = useState<CreateEnquiryInput[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ createdCount: number; errors: { row: number; message: string }[] } | null>(
    null
  );

  async function pickFile() {
    setError(null);
    setResult(null);
    try {
      const picked = await DocumentPicker.getDocumentAsync({
        type: ["text/csv", "text/comma-separated-values", "application/vnd.ms-excel", "*/*"],
        copyToCacheDirectory: true,
      });
      if (picked.canceled || !picked.assets?.[0]) return;

      const asset = picked.assets[0];
      const text = await (await fetch(asset.uri)).text();
      const parsed = rowsToEnquiries(parseCsv(text));
      if (parsed.length === 0) {
        setError("No data rows found. Expected a header row with contact_name, contact_phone, source.");
        return;
      }
      setFileName(asset.name);
      setRows(parsed);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to read file");
    }
  }

  async function upload() {
    if (!accessToken || rows.length === 0) return;
    setIsUploading(true);
    setError(null);
    try {
      const res = await api.bulkCreateEnquiries(accessToken, rows);
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <Screen edges={["bottom"]}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.titleSection}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>Bulk Upload</Text>
          <Text style={[styles.subtitle, { color: colors.textMuted }]}>
            Import enquiries from an event or expo sign-up sheet
          </Text>
        </View>

        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, cardShadow]}>
          <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>1. Pick a CSV file</Text>
          <Text style={[styles.meta, { color: colors.textMuted }]}>
            Columns: contact_name, contact_phone, contact_email, source, grade_interest, consent_captured
          </Text>
          <Pressable
            style={({ pressed }) => [
              styles.pickButton,
              { borderColor: colors.border, backgroundColor: colors.surfaceRaised },
              pressed && { opacity: pressedOpacity },
            ]}
            onPress={pickFile}
            accessibilityRole="button"
          >
            <Ionicons name="document-outline" size={18} color={colors.accent} />
            <Text style={[styles.pickButtonText, { color: colors.textPrimary }]}>
              {fileName ?? "Choose a .csv file"}
            </Text>
          </Pressable>
        </View>

        {rows.length > 0 ? (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, cardShadow]}>
            <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>2. Review and upload</Text>
            <Text style={[styles.meta, { color: colors.textSecondary }]}>
              {rows.length} row{rows.length === 1 ? "" : "s"} parsed
            </Text>
            <Pressable
              style={({ pressed }) => [
                styles.uploadButton,
                { backgroundColor: colors.accent },
                (isUploading || pressed) && { opacity: pressedOpacity },
              ]}
              onPress={upload}
              disabled={isUploading}
              accessibilityRole="button"
            >
              {isUploading ? (
                <ActivityIndicator color={colors.accentOn} />
              ) : (
                <Text style={[styles.uploadButtonText, { color: colors.accentOn }]}>
                  Upload {rows.length} enquir{rows.length === 1 ? "y" : "ies"}
                </Text>
              )}
            </Pressable>
          </View>
        ) : null}

        {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}

        {result ? (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, cardShadow]}>
            <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Result</Text>
            <Text style={[styles.meta, { color: colors.textPrimary, fontWeight: "700" }]}>
              {result.createdCount} created
            </Text>
            {result.errors.length > 0 ? (
              <>
                <Text style={[styles.meta, { color: colors.danger, marginTop: 8 }]}>
                  {result.errors.length} row{result.errors.length === 1 ? "" : "s"} skipped
                </Text>
                {result.errors.map((e) => (
                  <Text key={e.row} style={[styles.errorRow, { color: colors.textMuted }]}>
                    Row {e.row}: {e.message}
                  </Text>
                ))}
              </>
            ) : null}
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
  card: { borderWidth: 1, borderRadius: 16, padding: 16, marginBottom: 16 },
  cardTitle: { fontSize: 15, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.3, marginBottom: 8 },
  meta: { fontSize: 13, marginBottom: 12 },
  pickButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: 10,
    height: 46,
    paddingHorizontal: 14,
  },
  pickButtonText: { fontSize: 14, fontWeight: "600" },
  uploadButton: { borderRadius: 10, height: 46, alignItems: "center", justifyContent: "center" },
  uploadButtonText: { fontSize: 14, fontWeight: "700" },
  error: { textAlign: "center", marginBottom: 12 },
  errorRow: { fontSize: 12, marginTop: 4 },
});
