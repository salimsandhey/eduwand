import { ImageSourcePropType } from "react-native";

// Three preset sets: teachers and students each pick from their own
// illustrated set, every other role (and enquiry/lead photos) still uses the
// original "default" line icons until those get their own redesign. Keys are
// validated per role on the backend too (backend/src/routes/auth-me.ts) -
// keep both lists in sync.
export type AvatarSet = "default" | "teacher" | "student";

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

export const TEACHER_AVATAR_KEYS = [
  "teacher-avatar-01",
  "teacher-avatar-02",
  "teacher-avatar-03",
  "teacher-avatar-04",
  "teacher-avatar-05",
  "teacher-avatar-06",
  "teacher-avatar-07",
  "teacher-avatar-08",
  "teacher-avatar-09",
  "teacher-avatar-10",
  "teacher-avatar-11",
  "teacher-avatar-12",
  "teacher-avatar-13",
  "teacher-avatar-14",
  "teacher-avatar-15",
  "teacher-avatar-16",
  "teacher-avatar-17",
  "teacher-avatar-18",
  "teacher-avatar-19",
  "teacher-avatar-20",
] as const;

export const TEACHER_AVATAR_SOURCE_BY_KEY: Record<string, ImageSourcePropType> = {
  "teacher-avatar-01": require("../../assets/avatars/teacher/teacher-avatar-01.png"),
  "teacher-avatar-02": require("../../assets/avatars/teacher/teacher-avatar-02.png"),
  "teacher-avatar-03": require("../../assets/avatars/teacher/teacher-avatar-03.png"),
  "teacher-avatar-04": require("../../assets/avatars/teacher/teacher-avatar-04.png"),
  "teacher-avatar-05": require("../../assets/avatars/teacher/teacher-avatar-05.png"),
  "teacher-avatar-06": require("../../assets/avatars/teacher/teacher-avatar-06.png"),
  "teacher-avatar-07": require("../../assets/avatars/teacher/teacher-avatar-07.png"),
  "teacher-avatar-08": require("../../assets/avatars/teacher/teacher-avatar-08.png"),
  "teacher-avatar-09": require("../../assets/avatars/teacher/teacher-avatar-09.png"),
  "teacher-avatar-10": require("../../assets/avatars/teacher/teacher-avatar-10.png"),
  "teacher-avatar-11": require("../../assets/avatars/teacher/teacher-avatar-11.png"),
  "teacher-avatar-12": require("../../assets/avatars/teacher/teacher-avatar-12.png"),
  "teacher-avatar-13": require("../../assets/avatars/teacher/teacher-avatar-13.png"),
  "teacher-avatar-14": require("../../assets/avatars/teacher/teacher-avatar-14.png"),
  "teacher-avatar-15": require("../../assets/avatars/teacher/teacher-avatar-15.png"),
  "teacher-avatar-16": require("../../assets/avatars/teacher/teacher-avatar-16.png"),
  "teacher-avatar-17": require("../../assets/avatars/teacher/teacher-avatar-17.png"),
  "teacher-avatar-18": require("../../assets/avatars/teacher/teacher-avatar-18.png"),
  "teacher-avatar-19": require("../../assets/avatars/teacher/teacher-avatar-19.png"),
  "teacher-avatar-20": require("../../assets/avatars/teacher/teacher-avatar-20.png"),
};

export const STUDENT_AVATAR_KEYS = [
  "student-avatar-01",
  "student-avatar-02",
  "student-avatar-03",
  "student-avatar-04",
  "student-avatar-05",
  "student-avatar-06",
  "student-avatar-07",
  "student-avatar-08",
  "student-avatar-09",
  "student-avatar-10",
  "student-avatar-11",
  "student-avatar-12",
  "student-avatar-13",
  "student-avatar-14",
  "student-avatar-15",
  "student-avatar-16",
  "student-avatar-17",
  "student-avatar-18",
  "student-avatar-19",
  "student-avatar-20",
] as const;

export const STUDENT_AVATAR_SOURCE_BY_KEY: Record<string, ImageSourcePropType> = {
  "student-avatar-01": require("../../assets/avatars/student/student-avatar-01.png"),
  "student-avatar-02": require("../../assets/avatars/student/student-avatar-02.png"),
  "student-avatar-03": require("../../assets/avatars/student/student-avatar-03.png"),
  "student-avatar-04": require("../../assets/avatars/student/student-avatar-04.png"),
  "student-avatar-05": require("../../assets/avatars/student/student-avatar-05.png"),
  "student-avatar-06": require("../../assets/avatars/student/student-avatar-06.png"),
  "student-avatar-07": require("../../assets/avatars/student/student-avatar-07.png"),
  "student-avatar-08": require("../../assets/avatars/student/student-avatar-08.png"),
  "student-avatar-09": require("../../assets/avatars/student/student-avatar-09.png"),
  "student-avatar-10": require("../../assets/avatars/student/student-avatar-10.png"),
  "student-avatar-11": require("../../assets/avatars/student/student-avatar-11.png"),
  "student-avatar-12": require("../../assets/avatars/student/student-avatar-12.png"),
  "student-avatar-13": require("../../assets/avatars/student/student-avatar-13.png"),
  "student-avatar-14": require("../../assets/avatars/student/student-avatar-14.png"),
  "student-avatar-15": require("../../assets/avatars/student/student-avatar-15.png"),
  "student-avatar-16": require("../../assets/avatars/student/student-avatar-16.png"),
  "student-avatar-17": require("../../assets/avatars/student/student-avatar-17.png"),
  "student-avatar-18": require("../../assets/avatars/student/student-avatar-18.png"),
  "student-avatar-19": require("../../assets/avatars/student/student-avatar-19.png"),
  "student-avatar-20": require("../../assets/avatars/student/student-avatar-20.png"),
};

// Shown for a teacher or student who hasn't uploaded a photo or picked an
// avatar (new account, or after "Remove photo") - a neutral placeholder, not
// a random pick from the set. Not one of the set keys, so it can't be "chosen".
export const TEACHER_DEFAULT_AVATAR: ImageSourcePropType = require("../../assets/avatars/teacher/teacher-avatar-default.png");

const SETS: Record<AvatarSet, { keys: readonly string[]; sources: Record<string, ImageSourcePropType> }> = {
  default: { keys: AVATAR_KEYS, sources: AVATAR_SOURCE_BY_KEY },
  teacher: { keys: TEACHER_AVATAR_KEYS, sources: TEACHER_AVATAR_SOURCE_BY_KEY },
  student: { keys: STUDENT_AVATAR_KEYS, sources: STUDENT_AVATAR_SOURCE_BY_KEY },
};

export function avatarSetForRole(role?: string | null): AvatarSet {
  if (role === "teacher") return "teacher";
  if (role === "student") return "student";
  return "default";
}

export function avatarKeysFor(set: AvatarSet): readonly string[] {
  return SETS[set].keys;
}

// Null for a key outside this set - e.g. a teacher whose saved avatarKey is
// still one of the old default icons, which teachers no longer see.
export function avatarSourceFor(key: string | null | undefined, set: AvatarSet): ImageSourcePropType | null {
  return key ? SETS[set].sources[key] ?? null : null;
}

// The teacher and student sets are full-bleed circular artwork (transparent
// corners), drawn edge to edge like a photo; the default set is small line
// icons drawn "contain" inside a padded frame.
export function avatarFillsFrame(set: AvatarSet): boolean {
  return set !== "default";
}

// Whether a set's "nothing picked" state is the fixed silhouette rather than
// an auto-pick from the set.
function usesDefaultSilhouette(set: AvatarSet): boolean {
  return set !== "default";
}

export function getAvatarSource(seed: string, set: AvatarSet = "default"): ImageSourcePropType {
  const { keys, sources } = SETS[set];
  const hash = seed.split("").reduce((total, char) => total + char.charCodeAt(0), 0);
  return sources[keys[hash % keys.length]];
}

// What a user with no photo and no picked avatar sees: teachers and students
// get the fixed default placeholder; other roles keep the stable auto-pick
// seeded on the user id until their set is redesigned too.
export function defaultUserImageSource(set: AvatarSet, seed: string): ImageSourcePropType {
  return usesDefaultSilhouette(set) ? TEACHER_DEFAULT_AVATAR : getAvatarSource(seed, set);
}

// Any student's picture, wherever they appear (their own screens, teacher
// lists, the login picker): uploaded photo, else their picked avatar, else the
// silhouette. photoUrl is whichever endpoint the caller is allowed to read.
export function resolveStudentImageSource(params: {
  avatarKey?: string | null;
  hasPhoto?: boolean | null;
  photoUrl?: string | null;
}): ImageSourcePropType {
  if (params.hasPhoto && params.photoUrl) return { uri: params.photoUrl };
  return avatarSourceFor(params.avatarKey, "student") ?? TEACHER_DEFAULT_AVATAR;
}

// Current-user avatar resolution: uploaded photo first, then a picked preset
// from the user's own set, then the default for that set.
export function resolveUserImageSource(params: {
  id: string;
  fullName: string;
  role?: string | null;
  avatarKey?: string | null;
  photoUrl?: string | null;
  hasPhoto?: boolean | null;
}): ImageSourcePropType {
  if (params.hasPhoto && params.photoUrl) return { uri: params.photoUrl };
  const set = avatarSetForRole(params.role);
  return avatarSourceFor(params.avatarKey, set) ?? defaultUserImageSource(set, params.id || params.fullName);
}

// Whether the current user's image should be drawn edge to edge ("cover")
// rather than as a small icon inside its frame.
export function userImageFillsFrame(user: { role?: string | null; photoMimeType?: string | null }): boolean {
  return !!user.photoMimeType || avatarFillsFrame(avatarSetForRole(user.role));
}

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
