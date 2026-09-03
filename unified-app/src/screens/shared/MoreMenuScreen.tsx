import { Alert, Image, ImageSourcePropType, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useNavigation } from "@react-navigation/native";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../theme/ThemeContext";
import { Screen } from "../../components/Screen";
import { resolveUserImageSource } from "../../theme/avatars";
import { decorativeAssets } from "../../theme/decorativeAssets";
import { api, CurrentUser } from "../../api/client";

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
  const { user, accessToken, logout } = useAuth();
  const { colors, pressedOpacity } = useTheme();
  const navigation = useNavigation<any>();

  if (!user) return null;

  const parentTabs = navigation.getParent();
  const root = parentTabs?.getParent();
  const isEnrolmentRole = ENROLMENT_ROLES.includes(user.role);
  const isTeacher = user.role === "teacher";
  const avatarSource = resolveUserImageSource({
    id: user.id,
    fullName: user.fullName,
    avatarKey: user.avatarKey,
    hasPhoto: !!user.photoMimeType,
    photoUrl: accessToken ? api.myPhotoUrl(accessToken) : null,
  });

  if (isEnrolmentRole) {
    return <EnrolmentMoreScreen user={user} avatarSource={avatarSource} logout={logout} />;
  }

  const tools: ToolItem[] = isTeacher
    ? [
        { title: "Studio", caption: "Manage topics and generated lessons", icon: "book-outline", onPress: () => parentTabs?.navigate("Studio") },
        { title: "Assignments", caption: "Create and review class work", icon: "document-text-outline", onPress: () => parentTabs?.navigate("Assignment") },
        { title: "Analytics", caption: "View attainment and class progress", icon: "bar-chart-outline", onPress: () => parentTabs?.navigate("Analytics") },
      ]
    : [];

  const communicationTools: ToolItem[] = isTeacher
    ? [{ title: "Messages", caption: "Stay connected with your class", icon: "chatbubble-ellipses-outline", onPress: () => root?.navigate("CommunicationHub") }]
    : [];

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <LinearGradient colors={[colors.accent, colors.accentDark]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.profileGradient}>
          <View style={styles.profileGlowLarge} />
          <View style={styles.profileGlowSmall} />

          <Pressable style={({ pressed }) => [styles.profileArrow, pressed && { opacity: pressedOpacity }]} onPress={() => navigation.navigate("Profile")} accessibilityRole="button" accessibilityLabel="Edit profile" hitSlop={6}>
            <Ionicons name="create-outline" size={17} color={colors.accentOn} />
          </Pressable>

          <View style={styles.profileHeroRow}>
            <View style={[styles.avatarFrame, { backgroundColor: colors.accentSoft }]}>
              <Image source={avatarSource} style={user.photoMimeType ? styles.avatarPhoto : styles.avatarImage} resizeMode={user.photoMimeType ? "cover" : "contain"} />
            </View>

            <View style={styles.profileDivider} />

            <View style={styles.profileRightCol}>
              <Text style={[styles.profileName, { color: colors.accentOn }]} numberOfLines={1}>{user.fullName}</Text>
              <Text style={[styles.profileRole, { color: colors.accentSoft }]} numberOfLines={1}>{formatRole(user.role)}</Text>

              <View style={styles.profileInfoList}>
                <HeroInfoItem icon="mail-outline" label="Email" value={user.email} colors={colors} />
                <HeroInfoItem icon="call-outline" label="Phone" value={user.phone || "Not set"} colors={colors} />
                <HeroInfoItem icon="shield-checkmark-outline" label="Status" value={formatRole(user.status)} colors={colors} />
              </View>
            </View>
          </View>
        </LinearGradient>

        {isTeacher ? <Pressable style={({ pressed }) => [styles.featureCard, { backgroundColor: colors.accentSoft, borderColor: colors.accentSoftAlt }, pressed && { opacity: pressedOpacity }]} onPress={() => parentTabs?.navigate("Studio")} accessibilityRole="button">
          <View style={[styles.featureIcon, { backgroundColor: colors.surface }]}><Ionicons name="color-wand-outline" size={20} color={colors.accent} /></View><View style={styles.featureCopy}><Text style={[styles.featureTitle, { color: colors.textPrimary }]}>AI lesson studio</Text><Text style={[styles.featureCaption, { color: colors.textSecondary }]}>Plan and manage your teaching with AI.</Text></View>
          <View style={[styles.featureAction, { backgroundColor: colors.accent }]}><Ionicons name="arrow-forward" size={19} color={colors.accentOn} /></View>
        </Pressable> : null}

        {tools.length > 0 ? <MenuSection title={isTeacher ? "Teaching tools" : "Tools"} items={tools} /> : null}
        {communicationTools.length > 0 ? <MenuSection title="Communication" items={communicationTools} /> : null}

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Account</Text>
          <View style={[styles.menuGroup, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <MenuRow title="Edit profile" caption="Name, phone, photo, and password" icon="create-outline" onPress={() => navigation.navigate("Profile")} isLast={false} />
            <MenuRow title="Log out" caption="End this session on this device" icon="log-out-outline" onPress={logout} isLast danger />
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
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
  const navigation = useNavigation<any>();
  const parentTabs = navigation.getParent();
  const root = parentTabs?.getParent();

  const sections: { title: string; rows: ToolItem[] }[] = [
    {
      title: "Quick tools",
      rows: [
        { title: "Bulk Upload", caption: "Import multiple enquiries", icon: "cloud-upload-outline", onPress: () => root?.navigate("BulkUpload") },
        { title: "CSV Export", caption: "Export enquiry data", icon: "download-outline", onPress: () => navigation.navigate("CsvExport") },
        { title: "Notifications", caption: "View recent updates", icon: "notifications-outline", onPress: () => root?.navigate("Notifications") },
      ],
    },
    {
      title: "Manage",
      rows: [
        { title: "Enquiries", caption: "View and manage all leads", icon: "people-outline", onPress: () => parentTabs?.navigate("Enquiries") },
        { title: "Pipeline", caption: "Track admissions stages", icon: "git-network-outline", onPress: () => parentTabs?.navigate("Pipeline") },
        { title: "Tasks", caption: "Manage follow-ups", icon: "checkbox-outline", onPress: () => parentTabs?.navigate("Tasks") },
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
          onPress: () => Alert.alert("Help & support", "Reach the EduWand team at support@eduwand.com for help with your account."),
        },
      ],
    },
  ];

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.eContainer} showsVerticalScrollIndicator={false}>
        <View style={styles.eHeader}>
          <View style={styles.eHeaderText}>
            <Text style={[styles.ePageTitle, { color: colors.textPrimary }]}>More</Text>
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

        <View style={[styles.idCard, { backgroundColor: colors.surface, borderColor: colors.border }, cardShadow]}>
          <Image source={decorativeAssets.idCard} style={styles.idCardWatermark} resizeMode="contain" />

          <View style={styles.idTopRow}>
            <View style={[styles.idAvatarRing, { borderColor: colors.accent }]}>
              <View style={[styles.idAvatar, { backgroundColor: colors.accentSoft }]}>
                <Image
                  source={avatarSource}
                  style={user.photoMimeType ? styles.idAvatarPhoto : styles.idAvatarIllustration}
                  resizeMode={user.photoMimeType ? "cover" : "contain"}
                />
              </View>
            </View>

            <View style={styles.idNameCol}>
              <Text style={[styles.idName, { color: colors.textPrimary }]} numberOfLines={1}>
                {user.fullName}
              </Text>
              <View style={[styles.idRoleBadge, { backgroundColor: colors.accentSoft }]}>
                <Ionicons name="shield-checkmark-outline" size={11} color={colors.accent} />
                <Text style={[styles.idRoleBadgeText, { color: colors.accent }]} numberOfLines={1}>
                  {formatRole(user.role)}
                </Text>
              </View>
            </View>
          </View>

          <View style={[styles.idDivider, { backgroundColor: colors.border }]} />

          <View style={styles.idContactRow}>
            <View style={styles.idContactItem}>
              <Ionicons name="mail-outline" size={13} color={colors.textMuted} />
              <Text style={[styles.idContactText, { color: colors.textSecondary }]} numberOfLines={1}>
                {user.email}
              </Text>
            </View>
            <View style={styles.idContactItem}>
              <Ionicons name="call-outline" size={13} color={colors.textMuted} />
              <Text style={[styles.idContactText, { color: colors.textSecondary }]} numberOfLines={1}>
                {user.phone || "Not set"}
              </Text>
            </View>
          </View>

          <Pressable
            onPress={() => navigation.navigate("Profile")}
            style={({ pressed }) => [styles.idManageBtn, { backgroundColor: colors.accent }, pressed && { opacity: pressedOpacity }]}
            accessibilityRole="button"
            accessibilityLabel="Manage profile"
          >
            <Text style={[styles.idManageBtnText, { color: colors.accentOn }]}>Manage profile</Text>
            <Ionicons name="arrow-forward" size={14} color={colors.accentOn} />
          </Pressable>
        </View>

        {sections.map((section) => (
          <View key={section.title} style={styles.eSection}>
            <Text style={[styles.eSectionTitle, { color: colors.textPrimary }]}>{section.title}</Text>
            <View style={[styles.eGroup, { backgroundColor: colors.surface, borderColor: colors.border }, cardShadow]}>
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
  const { colors } = useTheme();
  return <View style={styles.section}><Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>{title}</Text><View style={[styles.menuGroup, { backgroundColor: colors.surface, borderColor: colors.border }]}>{items.map((item, index) => <MenuRow key={item.title} {...item} isLast={index === items.length - 1} />)}</View></View>;
}

function HeroInfoItem({
  icon,
  label,
  value,
  colors,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  colors: ReturnType<typeof useTheme>["colors"];
}) {
  return (
    <View style={styles.heroInfoItem}>
      <Ionicons name={icon} size={12} color={colors.accentSoft} style={styles.heroInfoIcon} />
      <View style={styles.heroInfoText}>
        <Text style={[styles.heroInfoLabel, { color: colors.accentSoft }]}>{label}</Text>
        <Text style={[styles.heroInfoValue, { color: colors.accentOn }]} numberOfLines={1}>{value}</Text>
      </View>
    </View>
  );
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
  idCard: {
    borderRadius: 22,
    borderWidth: 1,
    padding: 18,
    gap: 14,
    overflow: "hidden",
  },
  idCardWatermark: {
    position: "absolute",
    right: -18,
    bottom: -18,
    width: 96,
    height: 96,
    opacity: 0.08,
  },
  idTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    zIndex: 2,
  },
  idAvatarRing: {
    width: 68,
    height: 68,
    borderRadius: 22,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    padding: 3,
  },
  idAvatar: {
    width: "100%",
    height: "100%",
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  idAvatarPhoto: { width: "100%", height: "100%" },
  idAvatarIllustration: { width: "78%", height: "78%" },
  idNameCol: { flex: 1, gap: 6 },
  idName: { fontSize: 18, fontWeight: "800", letterSpacing: -0.3 },
  idRoleBadge: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  idRoleBadgeText: { fontSize: 11, fontWeight: "800" },
  idDivider: { height: 1, zIndex: 2 },
  idContactRow: { gap: 8, zIndex: 2 },
  idContactItem: { flexDirection: "row", alignItems: "center", gap: 8 },
  idContactText: { flex: 1, fontSize: 12.5, fontWeight: "600" },
  idManageBtn: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 11,
    zIndex: 2,
  },
  idManageBtnText: { fontSize: 13, fontWeight: "800" },
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
  profileGradient: { minHeight: 190, borderRadius: 24, paddingHorizontal: 18, paddingVertical: 18, overflow: "hidden" },
  profileGlowLarge: { position: "absolute", width: 142, height: 142, right: -53, top: -62, borderRadius: 71, backgroundColor: "#FFFFFF", opacity: 0.1 },
  profileGlowSmall: { position: "absolute", width: 58, height: 58, right: 40, bottom: -32, borderRadius: 29, backgroundColor: "#FFFFFF", opacity: 0.1 },
  profileArrow: { position: "absolute", top: 16, right: 16, width: 34, height: 34, borderRadius: 17, backgroundColor: "rgba(255,255,255,0.16)", alignItems: "center", justifyContent: "center", zIndex: 2 },
  profileHeroRow: { flexDirection: "row", alignItems: "flex-start", marginTop: 34, gap: 14, zIndex: 1 },
  profileDivider: { width: 1, alignSelf: "stretch", backgroundColor: "rgba(255,255,255,0.2)" },
  profileRightCol: { flex: 1 },
  avatarFrame: {
    width: 76,
    height: 76,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderWidth: 2.5,
    borderColor: "rgba(255,255,255,0.55)",
    flexShrink: 0,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 4,
  },
  avatarImage: { width: 64, height: 64 }, avatarPhoto: { width: "100%", height: "100%" },
  profileName: { fontSize: 18, lineHeight: 23, fontWeight: "800" }, profileRole: { marginTop: 2, fontSize: 12, lineHeight: 16, fontWeight: "600" },
  profileInfoList: { marginTop: 12, gap: 10 },
  heroInfoItem: { flexDirection: "row", alignItems: "flex-start", gap: 6 },
  heroInfoIcon: { marginTop: 2 },
  heroInfoText: { flex: 1 },
  heroInfoLabel: { fontSize: 8, letterSpacing: 0.6, fontWeight: "800" },
  heroInfoValue: { marginTop: 2, fontSize: 12, lineHeight: 15, fontWeight: "700" },
  featureCard: { minHeight: 76, borderWidth: 1, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 11, flexDirection: "row", alignItems: "center", gap: 12 },
  featureCopy: { flex: 1 }, featureIcon: { width: 40, height: 40, borderRadius: 13, alignItems: "center", justifyContent: "center" }, featureTitle: { fontSize: 14, fontWeight: "800" }, featureCaption: { marginTop: 2, fontSize: 11, lineHeight: 15, fontWeight: "500" }, featureAction: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  section: { gap: 9 }, sectionTitle: { fontSize: 15, fontWeight: "800", paddingLeft: 4 },
  menuGroup: { borderWidth: 1, borderRadius: 20, overflow: "hidden" },
  menuRow: { minHeight: 76, paddingHorizontal: 16, paddingVertical: 11, flexDirection: "row", alignItems: "center", gap: 12 },
  menuIcon: { width: 38, height: 38, borderRadius: 13, alignItems: "center", justifyContent: "center" }, menuCopy: { flex: 1 }, menuTitle: { fontSize: 14, lineHeight: 18, fontWeight: "800" }, menuCaption: { marginTop: 2, fontSize: 11, lineHeight: 15, fontWeight: "500" },
});
