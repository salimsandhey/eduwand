import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { RootStackParamList } from "../../navigation/types";
import { Screen } from "../../components/Screen";
import { PageHeader } from "../../components/PageHeader";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../theme/ThemeContext";
import { api, Enquiry, FollowUpTask } from "../../api/client";
import { typography } from "../../theme/tokens";
import { decorativeAssets } from "../../theme/decorativeAssets";

type Props = NativeStackScreenProps<RootStackParamList, "Notifications">;

type NotificationItem =
  | {
      id: string;
      type: "overdue" | "task";
      title: string;
      body: string;
      time: string;
      enquiryId?: string;
      priority: "high" | "normal";
    }
  | {
      id: string;
      type: "lead";
      title: string;
      body: string;
      time: string;
      enquiryId: string;
      priority: "normal";
    };

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recently";
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recently";
  return date.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

export function NotificationScreen({ navigation }: Props) {
  const { accessToken } = useAuth();
  const { colors, cardShadow, pressedOpacity } = useTheme();
  const [tasks, setTasks] = useState<FollowUpTask[]>([]);
  const [freshLeads, setFreshLeads] = useState<Enquiry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setIsLoading(true);
    setError(null);
    try {
      const [followUps, enquiries] = await Promise.all([
        api.listFollowUpTasks(accessToken, { status: "pending" }),
        api.listEnquiries(accessToken, { status: "new" }),
      ]);
      setTasks(followUps);
      setFreshLeads((enquiries.data ?? []).slice(0, 6));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load notifications");
    } finally {
      setIsLoading(false);
    }
  }, [accessToken]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const items = useMemo<NotificationItem[]>(() => {
    const now = Date.now();
    const taskItems: NotificationItem[] = tasks
      .slice()
      .sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime())
      .map((task) => {
        const overdue = new Date(task.dueAt).getTime() < now;
        const name = task.enquiry?.contactName ?? "Lead";
        return {
          id: `task-${task.id}`,
          type: overdue ? "overdue" : "task",
          title: overdue ? "Follow-up overdue" : "Follow-up scheduled",
          body: `${name} needs a ${task.channel.toUpperCase()} follow-up.`,
          time: `${overdue ? "Due" : "Due on"} ${formatDate(task.dueAt)}`,
          enquiryId: task.enquiry?.id,
          priority: overdue ? "high" : "normal",
        };
      });

    const leadItems: NotificationItem[] = freshLeads.map((lead) => ({
      id: `lead-${lead.id}`,
      type: "lead",
      title: "Fresh enquiry received",
      body: `${lead.contactName} is waiting in the new lead queue.`,
      time: formatTime(lead.createdAt),
      enquiryId: lead.id,
      priority: "normal",
    }));

    return [...taskItems, ...leadItems].slice(0, 12);
  }, [freshLeads, tasks]);

  const overdueCount = items.filter((item) => item.type === "overdue").length;

  return (
    <Screen edges={["bottom"]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <PageHeader
          eyebrow="Workspace"
          title="Notifications"
          subtitle="Follow-ups, fresh leads, and items that need attention."
          icon="notifications-outline"
          metrics={[
            { label: "Unread", value: items.length, tone: "accent" },
            { label: "Overdue", value: overdueCount, tone: overdueCount > 0 ? "danger" : "default" },
            { label: "Fresh", value: freshLeads.length },
          ]}
        />

        {isLoading ? (
          <View style={[styles.stateCard, { backgroundColor: colors.surface, borderColor: colors.border }, cardShadow]}>
            <ActivityIndicator color={colors.accent} />
            <Text style={[styles.stateText, { color: colors.textMuted }]}>Checking your latest updates...</Text>
          </View>
        ) : null}

        {error ? (
          <View style={[styles.stateCard, { backgroundColor: colors.surface, borderColor: colors.border }, cardShadow]}>
            <Ionicons name="alert-circle-outline" size={24} color={colors.danger} />
            <Text style={[styles.stateText, { color: colors.danger }]}>{error}</Text>
          </View>
        ) : null}

        {!isLoading && !error && items.length === 0 ? (
          <View style={[styles.stateCard, { backgroundColor: colors.surface, borderColor: colors.border }, cardShadow]}>
            <Image source={decorativeAssets.checkCircle} style={styles.emptyGraphic} resizeMode="contain" />
            <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>All clear</Text>
            <Text style={[styles.stateText, { color: colors.textMuted }]}>
              No urgent follow-ups or fresh lead alerts right now.
            </Text>
          </View>
        ) : null}

        {!isLoading && !error && items.length > 0 ? (
          <View style={styles.list}>
            {items.map((item) => {
              const isHigh = item.priority === "high";
              const icon =
                item.type === "lead" ? "person-add-outline" : item.type === "overdue" ? "alert-circle-outline" : "alarm-outline";
              return (
                <Pressable
                  key={item.id}
                  onPress={() => {
                    if (item.enquiryId) navigation.navigate("EnquiryDetail", { enquiryId: item.enquiryId });
                  }}
                  style={({ pressed }) => [
                    styles.notificationCard,
                    {
                      backgroundColor: colors.surface,
                      borderColor: isHigh ? colors.danger : colors.border,
                    },
                    cardShadow,
                    pressed && { opacity: pressedOpacity },
                  ]}
                  accessibilityRole="button"
                >
                  <View style={[styles.notificationIcon, { backgroundColor: isHigh ? "#FFE3EA" : colors.accentSoft }]}>
                    <Ionicons name={icon} size={18} color={isHigh ? colors.danger : colors.accent} />
                  </View>
                  <View style={styles.notificationBody}>
                    <View style={styles.notificationTopRow}>
                      <Text style={[styles.notificationTitle, { color: colors.textPrimary }]}>{item.title}</Text>
                      <View style={[styles.priorityDot, { backgroundColor: isHigh ? colors.danger : colors.accent }]} />
                    </View>
                    <Text style={[styles.notificationText, { color: colors.textSecondary }]}>{item.body}</Text>
                    <Text style={[styles.notificationTime, { color: isHigh ? colors.danger : colors.textMuted }]}>{item.time}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                </Pressable>
              );
            })}
          </View>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 16,
    paddingTop: 16,
    paddingBottom: 40,
    gap: 16,
  },
  list: {
    gap: 12,
  },
  notificationCard: {
    minHeight: 88,
    borderWidth: 1,
    borderRadius: 22,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  notificationIcon: {
    width: 44,
    height: 44,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  notificationBody: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  notificationTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  notificationTitle: {
    flex: 1,
    fontFamily: typography.fontFamily,
    fontSize: 14,
    fontWeight: "900",
  },
  priorityDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  notificationText: {
    fontFamily: typography.fontFamily,
    fontSize: 12.5,
    lineHeight: 18,
    fontWeight: "600",
  },
  notificationTime: {
    fontFamily: typography.fontFamily,
    fontSize: 11.5,
    fontWeight: "800",
  },
  stateCard: {
    borderWidth: 1,
    borderRadius: 24,
    padding: 22,
    alignItems: "center",
    gap: 10,
  },
  emptyGraphic: { width: 86, height: 86 },
  emptyTitle: {
    fontFamily: typography.fontFamily,
    fontSize: 18,
    fontWeight: "900",
  },
  stateText: {
    fontFamily: typography.fontFamily,
    textAlign: "center",
    fontSize: 13,
    lineHeight: 20,
    fontWeight: "600",
  },
});
