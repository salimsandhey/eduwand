import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import type { CompositeScreenProps } from "@react-navigation/native";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { RootStackParamList, StudentTabParamList } from "../../navigation/types";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../theme/ThemeContext";
import { Screen } from "../../components/Screen";
import { SheetModal } from "../../components/SheetModal";
import { StudentAvatar } from "../../components/StudentAvatar";
import { ProfileHeroCard } from "../../components/ProfileHeroCard";
import { ProfilePhotoPicker, PickedPhoto } from "../../components/ProfilePhotoPicker";
import { avatarSourceFor } from "../../theme/avatars";
import { api, StudentProfile } from "../../api/client";
import { capitalizeFirst } from "../../utils/text";
import { useTabBarClearance } from "../../navigation/useTabBarClearance";
import { useTabBarScrollHandler } from "../../navigation/TabBarScrollContext";

type Props = CompositeScreenProps<BottomTabScreenProps<StudentTabParamList, "Profile">, NativeStackScreenProps<RootStackParamList>>;

function formatDate(value: string | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
}

// The student's own tab. Students sign in with phone + OTP and have no
// AppUser row, so their details aren't editable here (the school owns them) -
// only their profile picture is: a photo, one of the student avatars, or
// removed back to the default silhouette. Then the pages every account
// needs, and log out.
export function StudentProfileScreen({ navigation }: Props) {
  const { user, accessToken, logout, uploadProfilePhoto, setProfileAvatar, removeProfilePhoto } = useAuth();
  const { colors, cardShadow, pressedOpacity } = useTheme();
  const tabBarClearance = useTabBarClearance();
  const handleTabBarScroll = useTabBarScrollHandler();
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [showPhotoSheet, setShowPhotoSheet] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoVersion, setPhotoVersion] = useState(0);
  const [photoErr, setPhotoErr] = useState<string | null>(null);

  const photoValue = useMemo<PickedPhoto>(() => {
    if (user?.photoMimeType && accessToken) {
      return { type: "remote", uri: `${api.myPhotoUrl(accessToken)}&v=${photoVersion}` };
    }
    if (user?.avatarKey && avatarSourceFor(user.avatarKey, "student")) return { type: "avatar", avatarKey: user.avatarKey };
    return { type: "none" };
  }, [user?.photoMimeType, user?.avatarKey, accessToken, photoVersion]);

  async function handlePhotoChange(next: PickedPhoto) {
    setShowPhotoSheet(false);
    setPhotoErr(null);
    setPhotoBusy(true);
    try {
      if (next.type === "photo") {
        await uploadProfilePhoto({ uri: next.uri, name: next.name, mimeType: next.mimeType });
      } else if (next.type === "avatar") {
        await setProfileAvatar(next.avatarKey);
      } else if (next.type === "none") {
        if (user?.photoMimeType || user?.avatarKey) await removeProfilePhoto();
      }
      setPhotoVersion((v) => v + 1);
    } catch (err) {
      setPhotoErr(err instanceof Error ? err.message : "Could not update photo");
    } finally {
      setPhotoBusy(false);
    }
  }

  useFocusEffect(
    useCallback(() => {
      if (!accessToken) return;
      api.getStudentProfile(accessToken).then(setProfile).catch(() => {});
    }, [accessToken])
  );

  function confirmLogout() {
    Alert.alert("Log out?", "You'll need your phone number and a new code to sign back in.", [
      { text: "Cancel", style: "cancel" },
      { text: "Log out", style: "destructive", onPress: logout },
    ]);
  }

  const fullName = capitalizeFirst(profile?.fullName ?? user?.fullName ?? "Student");
  const classLabel = profile ? `${capitalizeFirst(profile.classSection.className)} ${capitalizeFirst(profile.classSection.sectionName)}` : null;

  // Class, phone and guardian are on the profile card above - these are the rest.
  const details: { label: string; value: string }[] = [
    { label: "Date of birth", value: formatDate(profile?.dateOfBirth) },
    { label: "Joined", value: formatDate(profile?.admissionDate) },
  ];

  const links: { label: string; icon: keyof typeof Ionicons.glyphMap; onPress: () => void }[] = [
    { label: "Help & Support", icon: "help-circle-outline", onPress: () => navigation.navigate("HelpSupport") },
    { label: "Contact Us", icon: "call-outline", onPress: () => navigation.navigate("Contact") },
    { label: "Privacy Policy", icon: "shield-checkmark-outline", onPress: () => navigation.navigate("LegalDocument", { contentKey: "privacy_policy", title: "Privacy Policy" }) },
    { label: "Terms of Service", icon: "document-text-outline", onPress: () => navigation.navigate("LegalDocument", { contentKey: "terms_of_service", title: "Terms of Service" }) },
    { label: "About EduWand", icon: "information-circle-outline", onPress: () => navigation.navigate("LegalDocument", { contentKey: "about", title: "About EduWand" }) },
  ];

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: tabBarClearance }]}
        showsVerticalScrollIndicator={false}
        onScroll={handleTabBarScroll}
        scrollEventThrottle={16}
      >
        <Text style={[styles.title, { color: colors.textPrimary }]}>Profile</Text>

        <ProfileHeroCard
          avatar={
            photoBusy || !user ? (
              <ActivityIndicator color={colors.accent} />
            ) : (
              <Pressable
                onPress={() => setShowPhotoSheet(true)}
                style={({ pressed }) => [styles.avatarFill, pressed && { opacity: pressedOpacity }]}
                accessibilityRole="button"
                accessibilityLabel="Change profile photo"
              >
                <StudentAvatar
                  studentId={user.id}
                  picture={user}
                  size={AVATAR_SIZE}
                  photoUrl={accessToken ? api.myPhotoUrl(accessToken) : null}
                  version={photoVersion}
                  style={styles.avatarFill}
                />
              </Pressable>
            )
          }
          name={fullName}
          role="Student"
          info={[
            { icon: "school-outline", label: "Class", value: classLabel ?? "—" },
            { icon: "call-outline", label: "Phone", value: profile?.guardianContact ?? user?.phone ?? "—" },
            { icon: "people-outline", label: "Guardian", value: profile?.guardianName ? capitalizeFirst(profile.guardianName) : "—" },
          ]}
          onAction={() => setShowPhotoSheet(true)}
          actionIcon="camera-outline"
          actionLabel="Change profile photo"
        />
        {photoErr ? <Text style={[styles.photoError, { color: colors.danger }]}>{photoErr}</Text> : null}

        <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>Details</Text>
        <View style={[styles.card, { backgroundColor: colors.surface }, cardShadow]}>
          {details.map((row, index) => (
            <View
              key={row.label}
              style={[styles.detailRow, index < details.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}
            >
              <Text style={[styles.detailLabel, { color: colors.textMuted }]}>{row.label}</Text>
              <Text style={[styles.detailValue, { color: colors.textPrimary }]} numberOfLines={1}>
                {row.value}
              </Text>
            </View>
          ))}
        </View>
        <Text style={[styles.footnote, { color: colors.textMuted }]}>Something wrong? Ask your school to update it.</Text>

        <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>Help & legal</Text>
        <View style={[styles.card, { backgroundColor: colors.surface }, cardShadow]}>
          {links.map((link, index) => (
            <Pressable
              key={link.label}
              onPress={link.onPress}
              style={({ pressed }) => [
                styles.linkRow,
                index < links.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
                pressed && { opacity: pressedOpacity },
              ]}
              accessibilityRole="button"
            >
              <Ionicons name={link.icon} size={19} color={colors.textMuted} />
              <Text style={[styles.linkLabel, { color: colors.textPrimary }]}>{link.label}</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
            </Pressable>
          ))}
        </View>

        <Pressable
          onPress={confirmLogout}
          style={({ pressed }) => [styles.card, styles.logout, { backgroundColor: colors.surface }, cardShadow, pressed && { opacity: pressedOpacity }]}
          accessibilityRole="button"
        >
          <Ionicons name="log-out-outline" size={19} color={colors.danger} />
          <Text style={[styles.logoutText, { color: colors.danger }]}>Log out</Text>
        </Pressable>
      </ScrollView>

      <SheetModal visible={showPhotoSheet} onClose={() => setShowPhotoSheet(false)} closeLabel="Close photo options">
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.sheetContent}>
          <ProfilePhotoPicker value={photoValue} onChange={handlePhotoChange} avatarSet="student" />
        </ScrollView>
      </SheetModal>
    </Screen>
  );
}

// Matches ProfileHeroCard's avatar frame, which the avatar fills edge to edge.
const AVATAR_SIZE = 76;

const styles = StyleSheet.create({
  content: { paddingHorizontal: 16, paddingTop: 16 },
  title: { fontSize: 24, fontWeight: "800", letterSpacing: -0.5, marginBottom: 14 },
  card: { borderRadius: 18, paddingHorizontal: 16 },
  // Square fill - the card's rounded frame does the clipping, same as the staff cards.
  avatarFill: { width: "100%", height: "100%", borderRadius: 0 },
  photoError: { fontSize: 12, marginTop: 8, marginLeft: 4 },
  sheetContent: { paddingTop: 4, paddingBottom: 8 },
  sectionTitle: { fontSize: 11, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.5, marginTop: 22, marginBottom: 8, marginLeft: 4 },
  detailRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 16, paddingVertical: 14 },
  detailLabel: { fontSize: 13, fontWeight: "500" },
  detailValue: { flexShrink: 1, fontSize: 14, fontWeight: "700", textAlign: "right" },
  footnote: { fontSize: 11.5, marginTop: 8, marginLeft: 4 },
  linkRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14 },
  linkLabel: { flex: 1, fontSize: 14, fontWeight: "600" },
  logout: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 15, marginTop: 22 },
  logoutText: { fontSize: 14, fontWeight: "700" },
});
