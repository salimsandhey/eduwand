import { CurrentUser } from "../api/client";
import { avatarSetForRole, avatarSourceFor } from "../theme/avatars";

// What a staff profile needs for the people on the other side of the app to
// recognise and reach this person: a photo/avatar (shown to students, parents
// and colleagues on messages, headers and the leaderboard) and a phone number.
// Name and email always count as done - they're required to create the account.
export type ProfileItem = "photo" | "phone";

const ALWAYS_DONE_ITEMS = 2; // name, email
const TOTAL_ITEMS = ALWAYS_DONE_ITEMS + 2; // + photo, phone

export function getMissingProfileItems(user: CurrentUser): ProfileItem[] {
  const missing: ProfileItem[] = [];
  // An avatarKey from another role's set is treated as "nothing picked",
  // matching what ProfileScreen shows.
  const hasImage = !!user.photoMimeType || !!avatarSourceFor(user.avatarKey, avatarSetForRole(user.role));
  if (!hasImage) missing.push("photo");
  if (!user.phone?.trim()) missing.push("phone");
  return missing;
}

/** 0-100, in steps of 25 (50 for a brand-new account). */
export function getProfileCompletion(user: CurrentUser): { percent: number; missing: ProfileItem[] } {
  const missing = getMissingProfileItems(user);
  const done = TOTAL_ITEMS - missing.length;
  return { percent: Math.round((done / TOTAL_ITEMS) * 100), missing };
}

/** "Add a photo and your phone number" - the one-line "what's left". */
export function describeMissingProfileItems(missing: ProfileItem[]): string {
  const parts = missing.map((item) => (item === "photo" ? "a photo" : "your phone number"));
  if (parts.length === 0) return "Your profile is complete";
  return `Add ${parts.join(" and ")}`;
}
