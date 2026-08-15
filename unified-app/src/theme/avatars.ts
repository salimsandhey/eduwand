import { ImageSourcePropType } from "react-native";

// Bundled placeholder avatars (unified-app/assets/avatars/avatar-01..10.png).
// Keep AVATAR_KEYS in sync with backend/src/routes/enquiry-photo.ts's
// VALID_AVATAR_KEYS and with the actual files in that folder.
export const AVATAR_KEYS = [
  "avatar-01",
  "avatar-02",
  "avatar-03",
  "avatar-04",
  "avatar-05",
  "avatar-06",
  "avatar-07",
  "avatar-08",
  "avatar-09",
  "avatar-10",
] as const;

export const AVATAR_SOURCE_BY_KEY: Record<string, ImageSourcePropType> = {
  "avatar-01": require("../../assets/avatars/avatar-01.png"),
  "avatar-02": require("../../assets/avatars/avatar-02.png"),
  "avatar-03": require("../../assets/avatars/avatar-03.png"),
  "avatar-04": require("../../assets/avatars/avatar-04.png"),
  "avatar-05": require("../../assets/avatars/avatar-05.png"),
  "avatar-06": require("../../assets/avatars/avatar-06.png"),
  "avatar-07": require("../../assets/avatars/avatar-07.png"),
  "avatar-08": require("../../assets/avatars/avatar-08.png"),
  "avatar-09": require("../../assets/avatars/avatar-09.png"),
  "avatar-10": require("../../assets/avatars/avatar-10.png"),
};

const AVATAR_SOURCES = AVATAR_KEYS.map((key) => AVATAR_SOURCE_BY_KEY[key]);

// Deterministic fallback for a lead with no photo and no chosen avatar, so
// the same lead always renders the same placeholder instead of a random one
// on every reload.
export function getAvatarSource(seed: string): ImageSourcePropType {
  const hash = seed.split("").reduce((total, char) => total + char.charCodeAt(0), 0);
  return AVATAR_SOURCES[hash % AVATAR_SOURCES.length];
}

// Single place that picks what to actually render for a lead: an uploaded
// photo first, then a chosen preset avatar, then the deterministic fallback.
export function resolveEnquiryImageSource(params: {
  id: string;
  contactName: string;
  avatarKey?: string | null;
  photoUrl?: string | null;
}): ImageSourcePropType {
  if (params.photoUrl) return { uri: params.photoUrl };
  if (params.avatarKey && AVATAR_SOURCE_BY_KEY[params.avatarKey]) return AVATAR_SOURCE_BY_KEY[params.avatarKey];
  return getAvatarSource(params.id || params.contactName);
}
