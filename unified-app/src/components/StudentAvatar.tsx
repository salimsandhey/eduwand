import { useEffect, useState } from "react";
import { Image, StyleProp, StyleSheet, View, ViewStyle } from "react-native";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../theme/ThemeContext";
import { api, StudentPicture } from "../api/client";
import { resolveStudentImageSource } from "../theme/avatars";

interface StudentAvatarProps {
  studentId: string;
  picture: StudentPicture;
  size: number;
  /**
   * Where to read an uploaded photo from, when the default (staff reading
   * /students/:id/photo with the current session) doesn't apply - e.g. the
   * login picker, which only has a selection token.
   */
  photoUrl?: string | null;
  /** Bump to re-fetch the photo after it changes (same URL, new image). */
  version?: number;
  style?: StyleProp<ViewStyle>;
}

/**
 * A student's profile picture, the same everywhere they appear: their own
 * screens, teacher lists, message threads and the login picker. Uploaded
 * photo first, then their picked avatar, then the neutral silhouette - never
 * a name initial. A photo that fails to load falls back the same way.
 */
export function StudentAvatar({ studentId, picture, size, photoUrl, version, style }: StudentAvatarProps) {
  const { accessToken } = useAuth();
  const { colors } = useTheme();
  const [photoFailed, setPhotoFailed] = useState(false);

  const hasPhoto = !!picture.photoMimeType && !photoFailed;
  const baseUrl = photoUrl ?? (accessToken ? api.studentPhotoUrl(accessToken, studentId) : null);
  const url = baseUrl && version ? `${baseUrl}&v=${version}` : baseUrl;

  useEffect(() => {
    setPhotoFailed(false);
  }, [url, picture.photoMimeType]);

  return (
    <View
      style={[styles.frame, { width: size, height: size, borderRadius: size / 2, backgroundColor: colors.surfaceRaised }, style]}
    >
      <Image
        source={resolveStudentImageSource({ avatarKey: picture.avatarKey, hasPhoto, photoUrl: url })}
        style={styles.fill}
        resizeMode="cover"
        onError={() => setPhotoFailed(true)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { overflow: "hidden", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  fill: { width: "100%", height: "100%" },
});
