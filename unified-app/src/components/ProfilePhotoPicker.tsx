import { useState } from "react";
import { View, Text, Pressable, Image, StyleSheet, ActivityIndicator } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../theme/ThemeContext";
import { AVATAR_KEYS, AVATAR_SOURCE_BY_KEY } from "../theme/avatars";

export type PickedPhoto =
  | { type: "none" }
  | { type: "remote"; uri: string }
  | { type: "photo"; uri: string; name: string; mimeType: string }
  | { type: "avatar"; avatarKey: string };

interface ProfilePhotoPickerProps {
  value: PickedPhoto;
  onChange: (value: PickedPhoto) => void;
}

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
            <Ionicons name="person-outline" size={30} color={colors.textMuted} />
          )}
        </View>
        <View style={styles.previewMeta}>
          <Text style={[styles.previewTitle, { color: colors.textPrimary }]}>Profile photo</Text>
          <Text style={[styles.previewHint, { color: colors.textMuted }]}>Pick an avatar or upload your own photo.</Text>
          {value.type !== "none" ? (
            <Pressable onPress={clear} style={({ pressed }) => [styles.removeButton, pressed && { opacity: pressedOpacity }]} accessibilityRole="button">
              <Text style={[styles.removeText, { color: colors.danger }]}>Remove photo</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      <View style={styles.actionsList}>
        <ActionRow
          icon="happy-outline"
          label="Choose an avatar"
          onPress={() => setShowAvatarGrid((v) => !v)}
          colors={colors}
          pressedOpacity={pressedOpacity}
          active={showAvatarGrid}
        />
        <ActionRow icon="camera-outline" label="Take a photo" onPress={takePhoto} colors={colors} pressedOpacity={pressedOpacity} />
        <ActionRow icon="image-outline" label="Upload from gallery" onPress={pickFromGallery} colors={colors} pressedOpacity={pressedOpacity} />
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

function ActionRow({
  icon,
  label,
  onPress,
  colors,
  pressedOpacity,
  active = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  colors: ReturnType<typeof useTheme>["colors"];
  pressedOpacity: number;
  active?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionRow,
        { backgroundColor: colors.surfaceRaised, borderColor: active ? colors.accent : colors.border },
        pressed && { opacity: pressedOpacity },
      ]}
      accessibilityRole="button"
    >
      <View style={[styles.actionRowIcon, { backgroundColor: colors.accentSoft }]}>
        <Ionicons name={icon} size={16} color={colors.accent} />
      </View>
      <Text style={[styles.actionRowText, { color: colors.textPrimary }]}>{label}</Text>
      <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
    </Pressable>
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
    flexShrink: 0,
  },
  previewPhoto: { width: "100%", height: "100%" },
  previewAvatar: { width: 48, height: 48 },
  previewMeta: { flex: 1, gap: 3 },
  previewTitle: { fontSize: 14, fontWeight: "800" },
  previewHint: { fontSize: 11, lineHeight: 15, fontWeight: "500" },
  removeButton: { marginTop: 4, alignSelf: "flex-start" },
  removeText: { fontSize: 11, fontWeight: "700" },
  actionsList: { marginTop: 14, gap: 8 },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  actionRowIcon: { width: 30, height: 30, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  actionRowText: { flex: 1, fontSize: 13, fontWeight: "700" },
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
