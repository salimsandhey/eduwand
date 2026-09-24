import { useState } from "react";
import { View, Text, Pressable, Image, StyleSheet, ActivityIndicator } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../theme/ThemeContext";
import { AvatarSet, TEACHER_DEFAULT_AVATAR, avatarFillsFrame, avatarKeysFor, avatarSourceFor } from "../theme/avatars";

export type PickedPhoto =
  | { type: "none" }
  | { type: "remote"; uri: string }
  | { type: "photo"; uri: string; name: string; mimeType: string }
  | { type: "avatar"; avatarKey: string };

interface ProfilePhotoPickerProps {
  value: PickedPhoto;
  onChange: (value: PickedPhoto) => void;
  // Which preset avatars to offer - "teacher" for a teacher's own profile,
  // "default" everywhere else (other roles, enquiry/lead photos).
  avatarSet?: AvatarSet;
}

const AVATARS_PER_ROW = 5;

export function ProfilePhotoPicker({ value, onChange, avatarSet = "default" }: ProfilePhotoPickerProps) {
  const { colors, pressedOpacity } = useTheme();
  const fillsFrame = avatarFillsFrame(avatarSet);
  // Nothing picked: teachers and students see the same default placeholder
  // shown across the app; the default set keeps the plain person icon.
  const pickedAvatarSource =
    (value.type === "avatar" ? avatarSourceFor(value.avatarKey, avatarSet) : null) ??
    (avatarSet !== "default" ? TEACHER_DEFAULT_AVATAR : null);
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
      }
    } finally {
      setIsPicking(false);
    }
  }

  return (
    <View>
      <View style={styles.previewRow}>
        <View style={[styles.preview, { backgroundColor: colors.surfaceRaised }]}>
          {isPicking ? (
            <ActivityIndicator color={colors.accent} />
          ) : value.type === "photo" || value.type === "remote" ? (
            <Image source={{ uri: value.uri }} style={styles.fill} resizeMode="cover" />
          ) : pickedAvatarSource ? (
            <Image source={pickedAvatarSource} style={fillsFrame ? styles.fill : styles.previewIcon} resizeMode={fillsFrame ? "cover" : "contain"} />
          ) : (
            <Ionicons name="person-outline" size={26} color={colors.textMuted} />
          )}
        </View>
        <View style={styles.previewCopy}>
          <Text style={[styles.previewTitle, { color: colors.textPrimary }]}>
            {value.type === "none" ? "No photo yet" : value.type === "avatar" ? "Avatar selected" : "Photo selected"}
          </Text>
          <Text style={[styles.previewHint, { color: colors.textMuted }]}>Take a photo, upload one, or pick an avatar.</Text>
        </View>
        {value.type !== "none" ? (
          <Pressable
            onPress={() => onChange({ type: "none" })}
            hitSlop={8}
            style={({ pressed }) => pressed && { opacity: pressedOpacity }}
            accessibilityRole="button"
            accessibilityLabel="Remove photo"
          >
            <Text style={[styles.removeText, { color: colors.danger }]}>Remove</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={styles.sourceRow}>
        <SourceButton icon="camera-outline" label="Camera" onPress={takePhoto} disabled={isPicking} />
        <SourceButton icon="image-outline" label="Gallery" onPress={pickFromGallery} disabled={isPicking} />
      </View>

      {permissionError ? <Text style={[styles.errorText, { color: colors.danger }]}>{permissionError}</Text> : null}

      <Text style={[styles.gridLabel, { color: colors.textMuted }]}>Or choose an avatar</Text>
      <View style={styles.avatarGrid}>
        {avatarKeysFor(avatarSet).map((key) => {
          const active = value.type === "avatar" && value.avatarKey === key;
          return (
            <Pressable
              key={key}
              onPress={() => onChange({ type: "avatar", avatarKey: key })}
              style={({ pressed }) => [styles.avatarCell, pressed && { opacity: pressedOpacity }]}
              accessibilityRole="button"
              accessibilityLabel={`Avatar ${key.replace(/\D/g, "")}`}
              accessibilityState={{ selected: active }}
            >
              <View style={[styles.avatarOption, { backgroundColor: colors.surfaceRaised, borderColor: active ? colors.accent : "transparent" }]}>
                <Image
                  source={avatarSourceFor(key, avatarSet)!}
                  style={fillsFrame ? styles.fill : styles.avatarOptionIcon}
                  resizeMode={fillsFrame ? "cover" : "contain"}
                />
              </View>
              {active ? (
                <View style={[styles.checkBadge, { backgroundColor: colors.accent, borderColor: colors.surface }]}>
                  <Ionicons name="checkmark" size={11} color={colors.accentOn} />
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function SourceButton({
  icon,
  label,
  onPress,
  disabled,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  disabled: boolean;
}) {
  const { colors, pressedOpacity } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.sourceButton, { borderColor: colors.border }, (pressed || disabled) && { opacity: pressedOpacity }]}
      accessibilityRole="button"
    >
      <Ionicons name={icon} size={18} color={colors.textPrimary} />
      <Text style={[styles.sourceText, { color: colors.textPrimary }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { width: "100%", height: "100%" },
  previewRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  preview: { width: 52, height: 52, borderRadius: 26, overflow: "hidden", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  previewIcon: { width: 34, height: 34 },
  previewCopy: { flex: 1 },
  previewTitle: { fontSize: 14, fontWeight: "700" },
  previewHint: { marginTop: 2, fontSize: 11, lineHeight: 15, fontWeight: "500" },
  removeText: { fontSize: 12, fontWeight: "700" },
  sourceRow: { flexDirection: "row", gap: 10, marginTop: 16 },
  sourceButton: { flex: 1, height: 46, borderWidth: 1, borderRadius: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  sourceText: { fontSize: 13, fontWeight: "700" },
  errorText: { fontSize: 12, marginTop: 8 },
  gridLabel: { marginTop: 20, marginBottom: 10, fontSize: 12, fontWeight: "700" },
  avatarGrid: { flexDirection: "row", flexWrap: "wrap", rowGap: 12 },
  avatarCell: { width: `${100 / AVATARS_PER_ROW}%`, alignItems: "center" },
  avatarOption: { width: 52, height: 52, borderRadius: 26, borderWidth: 2, overflow: "hidden", alignItems: "center", justifyContent: "center" },
  avatarOptionIcon: { width: 32, height: 32 },
  checkBadge: { position: "absolute", top: -2, right: "12%", width: 18, height: 18, borderRadius: 9, borderWidth: 2, alignItems: "center", justifyContent: "center" },
});
