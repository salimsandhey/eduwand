import { useCallback, useState } from "react";
import { Image, ImageSourcePropType, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../theme/ThemeContext";
import { Screen } from "../../components/Screen";
import { TypewriterText } from "../../components/TypewriterText";
import { resolveUserImageSource, userImageFillsFrame } from "../../theme/avatars";
import { api, CurrentUser } from "../../api/client";
import { capitalizeFirst } from "../../utils/text";
import { useTabBarScrollHandler } from "../../navigation/TabBarScrollContext";
import { useTabBarClearance } from "../../navigation/useTabBarClearance";
import { ProfileCompletionCard } from "../../components/ProfileCompletionCard";
import { ProfileHeroCard, ProfileHeroInfo } from "../../components/ProfileHeroCard";
import { getProfileCompletion } from "../../utils/profileCompletion";

const ENROLMENT_ROLES = ["front_desk", "counsellor"];

interface ToolItem {
  title: string;
  caption: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
}

function formatRole(role: string) {
  return role.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

export function MoreMenuScreen() {
  const tabBarClearance = useTabBarClearance();
  const handleTabBarScroll = useTabBarScrollHandler();
  const { user, accessToken, logout } = useAuth();
  const { colors, cardShadow, pressedOpacity } = useTheme();
  const navigation = useNavigation<any>();
  const [setupProgress, setSetupProgress] = useState<{ completed: number; total: number } | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!accessToken || user?.role !== "teacher") return;
      api
        .getOnboardingTasks(accessToken)
        .then((result) => setSetupProgress({ completed: result.completedCount, total: result.totalCount }))
        .catch(() => {});
    }, [accessToken, user?.role])
  );

  if (!user) return null;

  const setupCaption =
    setupProgress && setupProgress.completed < setupProgress.total
      ? `${setupProgress.completed} of ${setupProgress.total} steps done - finish to unlock badges`
      : setupProgress
      ? "All steps done"
      : "Finish your profile and unlock badges";

  const parentTabs = navigation.getParent();
  const root = parentTabs?.getParent();
  const isEnrolmentRole = ENROLMENT_ROLES.includes(user.role);
  const isTeacher = user.role === "teacher";
  const avatarSource = resolveUserImageSource({
    id: user.id,
    fullName: user.fullName,
    role: user.role,
    avatarKey: user.avatarKey,
    hasPhoto: !!user.photoMimeType,
    photoUrl: accessToken ? api.myPhotoUrl(accessToken) : null,
  });

  if (isEnrolmentRole) {
    return <EnrolmentMoreScreen user={user} avatarSource={avatarSource} logout={logout} />;
  }

  // authorizeForSchool only grants "Lesson format" and "Academic year" to
  // admin/leadership/platform_admin or a teacher on their own individual
  // school - a regular institutional teacher would just hit a 403, so these
  // two are individual-account only. See Docs/superpowers/plans/2026-09-09-
  // individual-teacher-onboarding-and-credits.md.
  const isIndividualTeacher = isTeacher && user.accountType === "individual";

  // Studio, Assignments, Analytics and Messages already have a permanent entry
  // point (a tab, or the Home header icon) - More only lists pages that have
  // no other way in, so those are left out here rather than duplicated.
  const tools: ToolItem[] = isTeacher
    ? [
        { title: "Credits", caption: "View balance and usage history", icon: "wallet-outline", onPress: () => root?.navigate("Credits") },
        { title: "Students", caption: "Roster across all your classes, add or invite students", icon: "people-outline", onPress: () => root?.navigate("Students") },
        { title: "Getting started", caption: setupCaption, icon: "checkmark-circle-outline", onPress: () => root?.navigate("GettingStarted") },
        { title: "Leaderboard", caption: "See how you rank in your school this month", icon: "trophy-outline", onPress: () => root?.navigate("Leaderboard") },
        ...(isIndividualTeacher
          ? [{ title: "Academic year", caption: "Start a new session when this one ends", icon: "calendar-outline" as const, onPress: () => root?.navigate("StartNewAcademicYear") }]
          : []),
      ]
    : [];

  const legalTools: ToolItem[] = [
    { title: "Privacy Policy", caption: "How we handle your data", icon: "shield-checkmark-outline", onPress: () => root?.navigate("LegalDocument", { contentKey: "privacy_policy", title: "Privacy Policy" }) },
    { title: "Terms of Service", caption: "The rules for using EduWand", icon: "document-text-outline", onPress: () => root?.navigate("LegalDocument", { contentKey: "terms_of_service", title: "Terms of Service" }) },
    { title: "About EduWand", caption: "What EduWand is, and who makes it", icon: "information-circle-outline", onPress: () => root?.navigate("LegalDocument", { contentKey: "about", title: "About EduWand" }) },
    { title: "Contact Us", caption: "Reach the EduWand team", icon: "call-outline", onPress: () => root?.navigate("Contact") },
  ];

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={[styles.container, { paddingBottom: tabBarClearance }]}
        showsVerticalScrollIndicator={false}
        onScroll={handleTabBarScroll}
        scrollEventThrottle={16}
      >
        <ProfileHeroCard
          avatar={<Image source={avatarSource} style={userImageFillsFrame(user) ? styles.avatarPhoto : styles.avatarImage} resizeMode={userImageFillsFrame(user) ? "cover" : "contain"} />}
          name={capitalizeFirst(user.fullName)}
          role={formatRole(user.role)}
          info={staffHeroInfo(user)}
          onAction={() => navigation.navigate("Profile")}
          actionLabel="Edit profile"
          animateName
        />

        <ProfileCompletionSection user={user} onPress={() => navigation.navigate("Profile")} />

        {tools.length > 0 ? <MenuSection title={isTeacher ? "Teaching tools" : "Tools"} items={tools} /> : null}

        <MenuSection title="Legal" items={legalTools} />

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Account</Text>
          <View style={[styles.menuGroup, { backgroundColor: colors.surface, borderWidth: 0 }, cardShadow]}>
            <MenuRow title="Edit profile" caption="Name, phone, photo, and password" icon="create-outline" onPress={() => navigation.navigate("Profile")} isLast={false} />
            <MenuRow title="Log out" caption="End this session on this device" icon="log-out-outline" onPress={logout} isLast danger />
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}

// Profile-completion progress under the profile card - only while something
// is still missing; a complete profile shows nothing here.
function ProfileCompletionSection({ user, onPress }: { user: CurrentUser; onPress: () => void }) {
  const { percent, missing } = getProfileCompletion(user);
  if (percent >= 100) return null;
  return <ProfileCompletionCard percent={percent} missing={missing} onPress={onPress} />;
}

function EnrolmentMoreScreen({
  user,
  avatarSource,
  logout,
}: {
  user: CurrentUser;
  avatarSource: ImageSourcePropType;
  logout: () => void;
}) {
  const { colors, cardShadow, pressedOpacity } = useTheme();
  const tabBarClearance = useTabBarClearance(18);
  const navigation = useNavigation<any>();
  const parentTabs = navigation.getParent();
  const root = parentTabs?.getParent();
  const handleTabBarScroll = useTabBarScrollHandler();

  // Enquiries, Analytics and Tasks already have a tab, and Notifications has
  // both the bell in this screen's own header and one on Home - More only
  // lists pages that have no other way in, so those are left out here.
  const sections: { title: string; rows: ToolItem[] }[] = [
    {
      title: "Quick tools",
      rows: [
        { title: "Bulk Upload", caption: "Import multiple enquiries", icon: "cloud-upload-outline", onPress: () => root?.navigate("BulkUpload") },
        { title: "CSV Export", caption: "Export enquiry data", icon: "download-outline", onPress: () => navigation.navigate("CsvExport") },
        { title: "Pipeline board", caption: "Kanban view of every stage", icon: "git-network-outline", onPress: () => root?.navigate("Pipeline") },
      ],
    },
    {
      title: "Legal",
      rows: [
        { title: "Privacy Policy", caption: "How we handle your data", icon: "shield-checkmark-outline", onPress: () => root?.navigate("LegalDocument", { contentKey: "privacy_policy", title: "Privacy Policy" }) },
        { title: "Terms of Service", caption: "The rules for using EduWand", icon: "document-text-outline", onPress: () => root?.navigate("LegalDocument", { contentKey: "terms_of_service", title: "Terms of Service" }) },
        { title: "About EduWand", caption: "What EduWand is, and who makes it", icon: "information-circle-outline", onPress: () => root?.navigate("LegalDocument", { contentKey: "about", title: "About EduWand" }) },
        { title: "Contact Us", caption: "Reach the EduWand team", icon: "call-outline", onPress: () => root?.navigate("Contact") },
      ],
    },
    {
      title: "Account",
      rows: [
        { title: "Profile & preferences", caption: "Manage your account settings", icon: "person-circle-outline", onPress: () => navigation.navigate("Profile") },
        {
          title: "Help & support",
          caption: "Get help and contact support",
          icon: "help-circle-outline",
          onPress: () => root?.navigate("HelpSupport"),
        },
      ],
    },
  ];

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={[styles.eContainer, { paddingBottom: tabBarClearance }]}
        showsVerticalScrollIndicator={false}
        onScroll={handleTabBarScroll}
        scrollEventThrottle={16}
      >
        <View style={styles.eHeader}>
          <View style={styles.eHeaderText}>
            <TypewriterText text="More" style={[styles.ePageTitle, { color: colors.textPrimary }]} cursorColor={colors.primaryBrand} />
            <Text style={[styles.ePageSubtitle, { color: colors.textMuted }]}>Tools and account</Text>
          </View>
          <Pressable
            onPress={() => root?.navigate("Notifications")}
            style={({ pressed }) => [styles.eBell, { backgroundColor: colors.surface, borderColor: colors.border }, pressed && { opacity: pressedOpacity }]}
            accessibilityRole="button"
            accessibilityLabel="Open notifications"
          >
            <Ionicons name="notifications-outline" size={20} color={colors.accent} />
          </Pressable>
        </View>

        <ProfileHeroCard
          avatar={
            <Image
              source={avatarSource}
              style={user.photoMimeType ? styles.avatarPhoto : styles.avatarImage}
              resizeMode={user.photoMimeType ? "cover" : "contain"}
            />
          }
          name={capitalizeFirst(user.fullName)}
          role={formatRole(user.role)}
          info={staffHeroInfo(user)}
          onAction={() => navigation.navigate("Profile")}
          actionLabel="Edit profile"
        />

        <ProfileCompletionSection user={user} onPress={() => navigation.navigate("Profile")} />

        {sections.map((section) => (
          <View key={section.title} style={styles.eSection}>
            <Text style={[styles.eSectionTitle, { color: colors.textPrimary }]}>{section.title}</Text>
            <View style={[styles.eGroup, { backgroundColor: colors.surface, borderWidth: 0 }, cardShadow]}>
              {section.rows.map((row, index) => (
                <Pressable
                  key={row.title}
                  onPress={row.onPress}
                  style={({ pressed }) => [
                    styles.eRow,
                    index < section.rows.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border },
                    pressed && { opacity: pressedOpacity },
                  ]}
                  accessibilityRole="button"
                >
                  <View style={[styles.eRowIcon, { backgroundColor: colors.accentSoft }]}>
                    <Ionicons name={row.icon} size={18} color={colors.accent} />
                  </View>
                  <View style={styles.eRowCopy}>
                    <Text style={[styles.eRowTitle, { color: colors.textPrimary }]}>{row.title}</Text>
                    <Text style={[styles.eRowCaption, { color: colors.textMuted }]}>{row.caption}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                </Pressable>
              ))}
            </View>
          </View>
        ))}

        <Pressable
          onPress={logout}
          style={({ pressed }) => [styles.eLogout, { backgroundColor: colors.danger + "14" }, pressed && { opacity: pressedOpacity }]}
          accessibilityRole="button"
          accessibilityLabel="Log out"
        >
          <View style={styles.eLogoutLeft}>
            <Ionicons name="log-out-outline" size={18} color={colors.danger} />
            <Text style={[styles.eLogoutText, { color: colors.danger }]}>Log out</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.danger} />
        </Pressable>
      </ScrollView>
    </Screen>
  );
}

function MenuSection({ title, items }: { title: string; items: ToolItem[] }) {
  const { colors, cardShadow } = useTheme();
  return <View style={styles.section}><Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>{title}</Text><View style={[styles.menuGroup, { backgroundColor: colors.surface, borderWidth: 0 }, cardShadow]}>{items.map((item, index) => <MenuRow key={item.title} {...item} isLast={index === items.length - 1} />)}</View></View>;
}

function staffHeroInfo(user: CurrentUser): ProfileHeroInfo[] {
  return [
    { icon: "mail-outline", label: "Email", value: user.email },
    { icon: "call-outline", label: "Phone", value: user.phone || "Not set" },
    { icon: "shield-checkmark-outline", label: "Status", value: formatRole(user.status) },
  ];
}

function MenuRow({ title, caption, icon, onPress, isLast, danger = false }: ToolItem & { isLast: boolean; danger?: boolean }) {
  const { colors, pressedOpacity } = useTheme();
  const iconColor = danger ? colors.danger : colors.accent;
  return <Pressable style={({ pressed }) => [styles.menuRow, !isLast && { borderBottomWidth: 1, borderBottomColor: colors.border }, pressed && { opacity: pressedOpacity }]} onPress={onPress} accessibilityRole="button"><View style={[styles.menuIcon, { backgroundColor: danger ? "#FFF0F3" : colors.accentSoft }]}><Ionicons name={icon} size={18} color={iconColor} /></View><View style={styles.menuCopy}><Text style={[styles.menuTitle, { color: danger ? colors.danger : colors.textPrimary }]}>{title}</Text><Text style={[styles.menuCaption, { color: colors.textMuted }]}>{caption}</Text></View><Ionicons name="chevron-forward" size={18} color={colors.textMuted} /></Pressable>;
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 20, paddingTop: 6, paddingBottom: 132, gap: 18 },
  eContainer: { paddingHorizontal: 16, paddingTop: 6, paddingBottom: 150, gap: 18 },
  eHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 2 },
  eHeaderText: { flex: 1 },
  ePageTitle: { fontSize: 30, fontWeight: "800", letterSpacing: -0.6 },
  ePageSubtitle: { marginTop: 4, fontSize: 13, fontWeight: "500" },
  eBell: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  eSection: { gap: 10 },
  eSectionTitle: { fontSize: 16, fontWeight: "800", letterSpacing: -0.3, paddingLeft: 4 },
  eGroup: { borderWidth: 1, borderRadius: 18, overflow: "hidden" },
  eRow: { minHeight: 68, paddingHorizontal: 14, paddingVertical: 12, flexDirection: "row", alignItems: "center", gap: 12 },
  eRowIcon: { width: 40, height: 40, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  eRowCopy: { flex: 1 },
  eRowTitle: { fontSize: 14.5, fontWeight: "800", letterSpacing: -0.2 },
  eRowCaption: { marginTop: 2, fontSize: 11.5, fontWeight: "500" },
  eLogout: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderRadius: 16, paddingHorizontal: 16, paddingVertical: 16 },
  eLogoutLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  eLogoutText: { fontSize: 14, fontWeight: "800" },
  avatarImage: { width: 64, height: 64 }, avatarPhoto: { width: "100%", height: "100%" },
  featureCard: { minHeight: 76, borderWidth: 1, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 11, flexDirection: "row", alignItems: "center", gap: 12 },
  featureCopy: { flex: 1 }, featureIcon: { width: 40, height: 40, borderRadius: 13, alignItems: "center", justifyContent: "center" }, featureTitle: { fontSize: 14, fontWeight: "800" }, featureCaption: { marginTop: 2, fontSize: 11, lineHeight: 15, fontWeight: "500" }, featureAction: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  section: { gap: 9 }, sectionTitle: { fontSize: 15, fontWeight: "800", paddingLeft: 4 },
  menuGroup: { borderWidth: 1, borderRadius: 20, overflow: "hidden" },
  menuRow: { minHeight: 76, paddingHorizontal: 16, paddingVertical: 11, flexDirection: "row", alignItems: "center", gap: 12 },
  menuIcon: { width: 38, height: 38, borderRadius: 13, alignItems: "center", justifyContent: "center" }, menuCopy: { flex: 1 }, menuTitle: { fontSize: 14, lineHeight: 18, fontWeight: "800" }, menuCaption: { marginTop: 2, fontSize: 11, lineHeight: 15, fontWeight: "500" },
});
