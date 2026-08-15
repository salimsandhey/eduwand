import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../theme/ThemeContext";
import { Screen } from "../components/Screen";
import { PageHeader } from "../components/PageHeader";
import { getAvatarSource } from "../theme/avatars";

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
  const { user, logout } = useAuth();
  const { colors, cardShadow, pressedOpacity } = useTheme();
  const navigation = useNavigation<any>();

  if (!user) return null;

  const parentTabs = navigation.getParent();
  const root = parentTabs?.getParent();
  const isEnrolmentRole = ENROLMENT_ROLES.includes(user.role);
  const isTeacher = user.role === "teacher";
  const avatarSource = getAvatarSource(user.id || user.fullName);

  const tools: ToolItem[] = isEnrolmentRole
    ? [
        {
          title: "Enquiries",
          caption: "Lead list",
          icon: "mail-open-outline",
          onPress: () => parentTabs?.navigate("Enquiries"),
        },
        {
          title: "Pipeline",
          caption: "Stage board",
          icon: "git-network-outline",
          onPress: () => parentTabs?.navigate("Pipeline"),
        },
        {
          title: "Bulk Upload",
          caption: "Import leads",
          icon: "cloud-upload-outline",
          onPress: () => root?.navigate("BulkUpload"),
        },
        {
          title: "CSV Export",
          caption: "Reports",
          icon: "download-outline",
          onPress: () => navigation.navigate("CsvExport"),
        },
      ]
    : isTeacher
      ? [
          {
            title: "Studio",
            caption: "Topics",
            icon: "book-outline",
            onPress: () => parentTabs?.navigate("Studio"),
          },
          {
            title: "Assignments",
            caption: "Class work",
            icon: "document-text-outline",
            onPress: () => parentTabs?.navigate("Assignment"),
          },
          {
            title: "Analytics",
            caption: "Insights",
            icon: "bar-chart-outline",
            onPress: () => parentTabs?.navigate("Analytics"),
          },
          {
            title: "Messages",
            caption: "Communication",
            icon: "chatbubbles-outline",
            onPress: () => root?.navigate("CommunicationHub"),
          },
        ]
      : [];

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <PageHeader
          eyebrow="Workspace"
          title="More"
          subtitle="Profile, tools, and account actions"
          icon="ellipsis-horizontal-outline"
        />

        <View style={[styles.profileStrip, { backgroundColor: colors.surface, borderColor: colors.border }, cardShadow]}>
          <View style={[styles.avatarFrame, { backgroundColor: colors.surfaceRaised, borderColor: colors.accent }]}>
            <Image source={avatarSource} style={styles.avatarImage} resizeMode="contain" />
          </View>
          <View style={styles.profileDetails}>
            <Text style={[styles.profileName, { color: colors.textPrimary }]} numberOfLines={1}>
              {user.fullName}
            </Text>
            <Text style={[styles.profileEmail, { color: colors.textMuted }]} numberOfLines={1}>
              {user.email}
            </Text>
            <View style={[styles.roleBadge, { backgroundColor: colors.accentSoft }]}>
              <Text style={[styles.roleBadgeText, { color: colors.accent }]}>{formatRole(user.role)}</Text>
            </View>
          </View>
        </View>

        {tools.length > 0 ? (
          <View style={styles.section}>
            <Text style={[styles.sectionHeader, { color: colors.textMuted }]}>Tools</Text>
            <View style={styles.toolGrid}>
              {tools.map((tool) => (
                <Pressable
                  key={tool.title}
                  onPress={tool.onPress}
                  style={({ pressed }) => [
                    styles.toolCard,
                    { backgroundColor: colors.surface, borderColor: colors.border },
                    cardShadow,
                    pressed && { opacity: pressedOpacity },
                  ]}
                  accessibilityRole="button"
                >
                  <View style={styles.toolTopRow}>
                    <View style={[styles.toolIcon, { backgroundColor: colors.accentSoft }]}>
                      <Ionicons name={tool.icon} size={18} color={colors.accent} />
                    </View>
                    <Ionicons name="arrow-forward" size={14} color={colors.textMuted} />
                  </View>
                  <Text style={[styles.toolTitle, { color: colors.textPrimary }]}>{tool.title}</Text>
                  <Text style={[styles.toolCaption, { color: colors.textMuted }]}>{tool.caption}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={[styles.sectionHeader, { color: colors.textMuted }]}>Account</Text>
          <Pressable
            style={({ pressed }) => [
              styles.logoutRow,
              { backgroundColor: colors.surface, borderColor: colors.border },
              pressed && { opacity: pressedOpacity },
            ]}
            onPress={logout}
            accessibilityRole="button"
          >
            <View style={[styles.logoutIcon, { backgroundColor: colors.surfaceRaised }]}>
              <Ionicons name="log-out-outline" size={18} color={colors.danger} />
            </View>
            <View style={styles.logoutTextBlock}>
              <Text style={[styles.logoutTitle, { color: colors.danger }]}>Log out</Text>
              <Text style={[styles.logoutCaption, { color: colors.textMuted }]}>End this session on this device</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </Pressable>
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    paddingTop: 14,
    paddingBottom: 110,
    gap: 16,
  },
  profileStrip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
  },
  avatarFrame: {
    width: 58,
    height: 58,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarImage: {
    width: 46,
    height: 46,
  },
  profileDetails: {
    flex: 1,
  },
  profileName: {
    fontSize: 17,
    fontWeight: "800",
    letterSpacing: 0,
  },
  profileEmail: {
    marginTop: 3,
    fontSize: 13,
    fontWeight: "500",
  },
  roleBadge: {
    alignSelf: "flex-start",
    marginTop: 8,
    minHeight: 26,
    borderRadius: 13,
    paddingHorizontal: 10,
    justifyContent: "center",
  },
  roleBadgeText: {
    fontSize: 11,
    fontWeight: "800",
  },
  section: {
    gap: 10,
  },
  sectionHeader: {
    paddingLeft: 2,
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  toolGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  toolCard: {
    width: "48%",
    minHeight: 120,
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
  },
  toolTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 18,
  },
  toolIcon: {
    width: 36,
    height: 36,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  toolTitle: {
    fontSize: 14,
    fontWeight: "800",
  },
  toolCaption: {
    marginTop: 5,
    fontSize: 12,
    fontWeight: "600",
  },
  logoutRow: {
    minHeight: 66,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  logoutIcon: {
    width: 38,
    height: 38,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  logoutTextBlock: {
    flex: 1,
  },
  logoutTitle: {
    fontSize: 14,
    fontWeight: "800",
  },
  logoutCaption: {
    marginTop: 3,
    fontSize: 12,
    fontWeight: "500",
  },
});
