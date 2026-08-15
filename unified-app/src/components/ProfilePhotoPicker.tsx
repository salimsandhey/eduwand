import { useState } from "react";
import { View, Text, Pressable, Image, StyleSheet, ActivityIndicator } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../theme/ThemeContext";
import { AVATAR_KEYS, AVATAR_SOURCE_BY_KEY } from "../theme/avatars";

export type PickedPhoto =
  | { type: "none" }
  // Already-saved photo, shown for preview on an edit screen - nothing to
  // (re)upload unless the user picks something new.
  | { type: "remote"; uri: string }
  | { type: "photo"; uri: string; name: string; mimeType: string }
  | { type: "avatar"; avatarKey: string };

interface ProfilePhotoPickerProps {
  value: PickedPhoto;
  onChange: (value: PickedPhoto) => void;
}

// Lets a counsellor attach a lead/student photo three ways: live camera
// capture, the device gallery, or one of the app's bundled placeholder
// avatars - all funnel into the same PickedPhoto the caller uploads after the
// enquiry exists (backend/src/routes/enquiry-photo.ts).
export function ProfilePhotoPicker({ value, onChange }: ProfilePhotoPickerProps) {
  const { colors, pressedOpacity } = useTheme();
  const [showAvatarGrid, setShowAvatarGrid] = useState(false);
  const [isPicking, setIsPicking] = useState(false);
  const [permissionError, setPermissionError] = useState<string | null>(null);

  async function takePhoto() {
    setPermissionError(null);
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      setPermissionError("Camera permission is required to take a photo");
      return;
    }
    setIsPicking(true);
    try {
      const result = await ImagePicker.launchCameraAsync({ quality: 0.7, allowsEditing: true, aspect: [1, 1] });
      if (!result.canceled && result.assets?.[0]) {
        const asset = result.assets[0];
        onChange({ type: "photo", uri: asset.uri, name: asset.fileName ?? "photo.jpg", mimeType: asset.mimeType ?? "image/jpeg" });
        setShowAvatarGrid(false);
      }
    } finally {
      setIsPicking(false);
    }
  }

  async function pickFromGallery() {
    setPermissionError(null);
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setPermissionError("Photo library permission is required to choose a photo");
      return;
    }
    setIsPicking(true);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: "images",
        quality: 0.7,
        allowsEditing: true,
        aspect: [1, 1],
      });
      if (!result.canceled && result.assets?.[0]) {
        const asset = result.assets[0];
        onChange({ type: "photo", uri: asset.uri, name: asset.fileName ?? "photo.jpg", mimeType: asset.mimeType ?? "image/jpeg" });
        setShowAvatarGrid(false);
      }
    } finally {
      setIsPicking(false);
    }
  }

  function pickAvatar(avatarKey: string) {
    onChange({ type: "avatar", avatarKey });
    setShowAvatarGrid(false);
  }

  function clear() {
    onChange({ type: "none" });
    setShowAvatarGrid(false);
  }

  return (
    <View>
      <View style={styles.row}>
        <View style={[styles.previewWrap, { backgroundColor: colors.surfaceRaised, borderColor: colors.accent }]}>
          {isPicking ? (
            <ActivityIndicator color={colors.accent} />
          ) : value.type === "photo" || value.type === "remote" ? (
            <Image source={{ uri: value.uri }} style={styles.previewPhoto} resizeMode="cover" />
          ) : value.type === "avatar" ? (
            <Image source={AVATAR_SOURCE_BY_KEY[value.avatarKey]} style={styles.previewAvatar} resizeMode="contain" />
          ) : (
            <Ionicons name="person-outline" size={28} color={colors.textMuted} />
          )}
        </View>

        <View style={styles.actionsCol}>
          <View style={styles.actionsRow}>
            <Pressable
              onPress={takePhoto}
              style={({ pressed }) => [styles.actionChip, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }, pressed && { opacity: pressedOpacity }]}
              accessibilityRole="button"
            >
              <Ionicons name="camera-outline" size={14} color={colors.accent} />
              <Text style={[styles.actionChipText, { color: colors.textSecondary }]}>Camera</Text>
            </Pressable>
            <Pressable
              onPress={pickFromGallery}
              style={({ pressed }) => [styles.actionChip, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }, pressed && { opacity: pressedOpacity }]}
              accessibilityRole="button"
            >
              <Ionicons name="image-outline" size={14} color={colors.accent} />
              <Text style={[styles.actionChipText, { color: colors.textSecondary }]}>Gallery</Text>
            </Pressable>
            <Pressable
              onPress={() => setShowAvatarGrid((v) => !v)}
              style={({ pressed }) => [styles.actionChip, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }, pressed && { opacity: pressedOpacity }]}
              accessibilityRole="button"
            >
              <Ionicons name="happy-outline" size={14} color={colors.accent} />
              <Text style={[styles.actionChipText, { color: colors.textSecondary }]}>Avatar</Text>
            </Pressable>
          </View>
          {value.type !== "none" ? (
            <Pressable onPress={clear} style={({ pressed }) => [pressed && { opacity: pressedOpacity }]} accessibilityRole="button">
              <Text style={[styles.removeText, { color: colors.danger }]}>Remove photo</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      {permissionError ? <Text style={[styles.errorText, { color: colors.danger }]}>{permissionError}</Text> : null}

      {showAvatarGrid ? (
        <View style={styles.avatarGrid}>
          {AVATAR_KEYS.map((key) => {
            const active = value.type === "avatar" && value.avatarKey === key;
            return (
              <Pressable
                key={key}
                onPress={() => pickAvatar(key)}
                style={({ pressed }) => [
                  styles.avatarOption,
                  { backgroundColor: colors.surfaceRaised, borderColor: active ? colors.accent : colors.border },
                  pressed && { opacity: pressedOpacity },
                ]}
                accessibilityRole="button"
              >
                <Image source={AVATAR_SOURCE_BY_KEY[key]} style={styles.avatarOptionImage} resizeMode="contain" />
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 14 },
  previewWrap: {
    width: 64,
    height: 64,
    borderRadius: 20,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  previewPhoto: { width: "100%", height: "100%" },
  previewAvatar: { width: 48, height: 48 },
  actionsCol: { flex: 1, gap: 6 },
  actionsRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  actionChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  actionChipText: { fontSize: 11, fontWeight: "700" },
  removeText: { fontSize: 11, fontWeight: "700" },
  errorText: { fontSize: 12, marginTop: 8 },
  avatarGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 },
  avatarOption: {
    width: 48,
    height: 48,
    borderRadius: 14,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarOptionImage: { width: 34, height: 34 },
});
