import { useState } from "react";
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../theme/ThemeContext";
import { EnquiryDocument, DocumentType } from "../api/client";

export interface ChecklistItem {
  key: DocumentType;
  label: string;
  required: boolean;
}

// Fixed admission document checklist (backend/src/routes/documents.ts
// VALID_DOCUMENT_TYPES) - per-school configurability deferred (chat 15 Aug 2026).
export const DOCUMENT_CHECKLIST: ChecklistItem[] = [
  { key: "student_photo", label: "Student photo", required: true },
  { key: "birth_certificate", label: "Birth certificate", required: true },
  { key: "id_proof", label: "ID proof (e.g. Aadhar)", required: true },
  { key: "transfer_certificate", label: "Transfer certificate", required: false },
  { key: "previous_marksheet", label: "Previous marksheet / report card", required: false },
  { key: "address_proof", label: "Address proof", required: false },
];

export function requiredDocumentCompletion(documents: EnquiryDocument[]): { done: number; total: number } {
  const required = DOCUMENT_CHECKLIST.filter((item) => item.required);
  const done = required.filter((item) => documents.some((d) => d.documentType === item.key)).length;
  return { done, total: required.length };
}

interface PickedFile {
  uri: string;
  name: string;
  mimeType: string;
}

interface DocumentChecklistProps {
  documents: EnquiryDocument[];
  onUpload: (file: PickedFile, documentType: DocumentType) => Promise<void>;
  readOnly?: boolean;
}

// Per-checklist-item upload control: camera, gallery, or an arbitrary file
// (PDF, scan, etc. - not every admission document is a photo). Each item
// uploads directly through onUpload rather than staging locally, since this
// is only ever shown once the enquiry already exists (Admission step).
export function DocumentChecklist({ documents, onUpload, readOnly }: DocumentChecklistProps) {
  const { colors, pressedOpacity } = useTheme();
  const [expandedKey, setExpandedKey] = useState<DocumentType | null>(null);
  const [uploadingKey, setUploadingKey] = useState<DocumentType | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleUpload(file: PickedFile, key: DocumentType) {
    setUploadingKey(key);
    setError(null);
    try {
      await onUpload(file, key);
      setExpandedKey(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to upload document");
    } finally {
      setUploadingKey(null);
    }
  }

  async function takePhoto(key: DocumentType) {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      setError("Camera permission is required to take a photo");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.7 });
    if (!result.canceled && result.assets?.[0]) {
      const asset = result.assets[0];
      await handleUpload({ uri: asset.uri, name: asset.fileName ?? `${key}.jpg`, mimeType: asset.mimeType ?? "image/jpeg" }, key);
    }
  }

  async function pickFromGallery(key: DocumentType) {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError("Photo library permission is required to choose a photo");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: "images", quality: 0.7 });
    if (!result.canceled && result.assets?.[0]) {
      const asset = result.assets[0];
      await handleUpload({ uri: asset.uri, name: asset.fileName ?? `${key}.jpg`, mimeType: asset.mimeType ?? "image/jpeg" }, key);
    }
  }

  async function pickFile(key: DocumentType) {
    const picked = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
    if (picked.canceled || !picked.assets?.[0]) return;
    const asset = picked.assets[0];
    await handleUpload({ uri: asset.uri, name: asset.name, mimeType: asset.mimeType ?? "application/octet-stream" }, key);
  }

  return (
    <View>
      {DOCUMENT_CHECKLIST.map((item) => {
        const uploaded = [...documents].filter((d) => d.documentType === item.key).sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
        const latest = uploaded[0];
        const isExpanded = expandedKey === item.key;
        const isUploading = uploadingKey === item.key;

        return (
          <View key={item.key} style={[styles.row, { borderColor: colors.border }]}>
            <View style={styles.rowHeader}>
              <View style={styles.rowTitleBlock}>
                <View style={styles.rowTitleLine}>
                  <Text style={[styles.rowLabel, { color: colors.textPrimary }]}>{item.label}</Text>
                  <View
                    style={[
                      styles.badge,
                      { backgroundColor: item.required ? colors.accentSoft : colors.surfaceRaised, borderColor: item.required ? colors.accent : colors.border },
                    ]}
                  >
                    <Text style={[styles.badgeText, { color: item.required ? colors.accent : colors.textMuted }]}>
                      {item.required ? "Required" : "Optional"}
                    </Text>
                  </View>
                </View>
                <View style={styles.statusLine}>
                  <Ionicons
                    name={latest ? "checkmark-circle" : "ellipse-outline"}
                    size={14}
                    color={latest ? colors.accent : colors.textMuted}
                  />
                  <Text style={[styles.statusText, { color: latest ? colors.textSecondary : colors.textMuted }]} numberOfLines={1}>
                    {latest ? latest.fileName : "Not added yet"}
                  </Text>
                </View>
              </View>

              {!readOnly ? (
                <Pressable
                  onPress={() => setExpandedKey(isExpanded ? null : item.key)}
                  style={({ pressed }) => [styles.addButton, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }, pressed && { opacity: pressedOpacity }]}
                  accessibilityRole="button"
                >
                  {isUploading ? (
                    <ActivityIndicator size="small" color={colors.accent} />
                  ) : (
                    <Text style={[styles.addButtonText, { color: colors.accent }]}>{latest ? "Replace" : "Add"}</Text>
                  )}
                </Pressable>
              ) : null}
            </View>

            {isExpanded ? (
              <View style={styles.sourceRow}>
                <Pressable
                  onPress={() => takePhoto(item.key)}
                  style={({ pressed }) => [styles.sourceChip, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }, pressed && { opacity: pressedOpacity }]}
                  accessibilityRole="button"
                >
                  <Ionicons name="camera-outline" size={13} color={colors.accent} />
                  <Text style={[styles.sourceChipText, { color: colors.textSecondary }]}>Camera</Text>
                </Pressable>
                <Pressable
                  onPress={() => pickFromGallery(item.key)}
                  style={({ pressed }) => [styles.sourceChip, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }, pressed && { opacity: pressedOpacity }]}
                  accessibilityRole="button"
                >
                  <Ionicons name="image-outline" size={13} color={colors.accent} />
                  <Text style={[styles.sourceChipText, { color: colors.textSecondary }]}>Gallery</Text>
                </Pressable>
                <Pressable
                  onPress={() => pickFile(item.key)}
                  style={({ pressed }) => [styles.sourceChip, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }, pressed && { opacity: pressedOpacity }]}
                  accessibilityRole="button"
                >
                  <Ionicons name="document-attach-outline" size={13} color={colors.accent} />
                  <Text style={[styles.sourceChipText, { color: colors.textSecondary }]}>Files</Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        );
      })}

      {!readOnly ? (
        <Pressable
          onPress={() => setExpandedKey(expandedKey === "other" ? null : "other")}
          style={({ pressed }) => [styles.otherRow, pressed && { opacity: pressedOpacity }]}
          accessibilityRole="button"
        >
          <Ionicons name="add-circle-outline" size={16} color={colors.accent} />
          <Text style={[styles.otherRowText, { color: colors.accent }]}>Add another document</Text>
        </Pressable>
      ) : null}

      {expandedKey === "other" ? (
        <View style={styles.sourceRow}>
          <Pressable
            onPress={() => takePhoto("other")}
            style={({ pressed }) => [styles.sourceChip, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }, pressed && { opacity: pressedOpacity }]}
            accessibilityRole="button"
          >
            <Ionicons name="camera-outline" size={13} color={colors.accent} />
            <Text style={[styles.sourceChipText, { color: colors.textSecondary }]}>Camera</Text>
          </Pressable>
          <Pressable
            onPress={() => pickFromGallery("other")}
            style={({ pressed }) => [styles.sourceChip, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }, pressed && { opacity: pressedOpacity }]}
            accessibilityRole="button"
          >
            <Ionicons name="image-outline" size={13} color={colors.accent} />
            <Text style={[styles.sourceChipText, { color: colors.textSecondary }]}>Gallery</Text>
          </Pressable>
          <Pressable
            onPress={() => pickFile("other")}
            style={({ pressed }) => [styles.sourceChip, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }, pressed && { opacity: pressedOpacity }]}
            accessibilityRole="button"
          >
            <Ionicons name="document-attach-outline" size={13} color={colors.accent} />
            <Text style={[styles.sourceChipText, { color: colors.textSecondary }]}>Files</Text>
          </Pressable>
        </View>
      ) : null}

      {documents.filter((d) => !d.documentType || d.documentType === "other").length > 0 ? (
        <View style={{ marginTop: 10 }}>
          {documents
            .filter((d) => !d.documentType || d.documentType === "other")
            .map((doc) => (
              <View key={doc.id} style={[styles.otherDocRow, { borderColor: colors.border }]}>
                <Ionicons name="document-attach-outline" size={14} color={colors.textMuted} />
                <Text style={[styles.otherDocName, { color: colors.textPrimary }]} numberOfLines={1}>
                  {doc.fileName}
                </Text>
              </View>
            ))}
        </View>
      ) : null}

      {error ? <Text style={[styles.errorText, { color: colors.danger }]}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { borderBottomWidth: 1, paddingVertical: 12, gap: 8 },
  rowHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 10 },
  rowTitleBlock: { flex: 1, gap: 4 },
  rowTitleLine: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  rowLabel: { fontSize: 13, fontWeight: "700" },
  badge: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  badgeText: { fontSize: 10, fontWeight: "800", textTransform: "uppercase" },
  statusLine: { flexDirection: "row", alignItems: "center", gap: 6 },
  statusText: { fontSize: 12, fontWeight: "600", flexShrink: 1 },
  addButton: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7, minWidth: 68, alignItems: "center", justifyContent: "center" },
  addButtonText: { fontSize: 11, fontWeight: "800" },
  sourceRow: { flexDirection: "row", gap: 6, marginTop: 2 },
  sourceChip: { flexDirection: "row", alignItems: "center", gap: 4, borderWidth: 1, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 6 },
  sourceChipText: { fontSize: 11, fontWeight: "700" },
  otherRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 12 },
  otherRowText: { fontSize: 12, fontWeight: "700" },
  otherDocRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8, borderBottomWidth: 1 },
  otherDocName: { fontSize: 12, fontWeight: "600", flex: 1 },
  errorText: { fontSize: 12, marginTop: 8 },
});
