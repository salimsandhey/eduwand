import { useCallback, useMemo, useState } from "react";
import { View, Text, Pressable, StyleSheet, ScrollView, ActivityIndicator, RefreshControl } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../../navigation/types";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../theme/ThemeContext";
import { spacing, softCardShadow } from "../../theme/tokens";
import { Screen } from "../../components/Screen";
import { api, AiFeatureInfo, CreditAccountSummary, CreditLedgerEntry, CreditUsageStats, PlanStatus } from "../../api/client";
import { getRelativeDateLabel } from "../../utils/date";

// Balance, runway, spend breakdown and ledger history for the signed-in
// teacher. Everything shown comes from GET /me/credits (backend/src/routes/
// teacher-credits.ts): feature names, descriptions, icons and costs are the
// backend's AiFeature rows (platform_admin-editable, and the same costs
// deductCredits() charges), and usage stats are computed server-side over the
// full ledger, not just the 50 rows listed under History.

type Props = NativeStackScreenProps<RootStackParamList, "Credits">;
type IoniconName = keyof typeof Ionicons.glyphMap;
type FeatureLookup = Map<string, AiFeatureInfo>;

const HISTORY_PREVIEW_COUNT = 8;
const LOW_RUNWAY_DAYS = 7;
const CHART_HEIGHT = 96;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// The teacher's trial / plan at a glance. Says nothing about where to buy -
// the app must not steer to an outside payment page.
function PlanNotice({ plan }: { plan: PlanStatus }) {
  const { colors } = useTheme();
  const live = plan.status === "trial" || plan.status === "active";
  const ends = plan.endsAt ? new Date(plan.endsAt) : null;
  const endsLabel = ends ? `${ends.getDate()} ${MONTHS[ends.getMonth()]}` : "";
  const days = plan.daysLeft ?? 0;

  const title = live ? (plan.status === "trial" ? "Free trial" : plan.planName ?? "Your plan") : plan.status === "none" ? "No active plan" : "Your plan has ended";
  const body = live
    ? `${days} day${days === 1 ? "" : "s"} left - ends ${endsLabel}. Credits from this period don't carry over.`
    : "AI features are paused. Your classes, students and saved content are not affected.";

  return (
    <View style={[planStyles.card, softCardShadow, { backgroundColor: colors.surface, borderLeftColor: live ? colors.accent : colors.danger }]}>
      <Text style={[planStyles.title, { color: colors.textPrimary }]}>{title}</Text>
      <Text style={[planStyles.body, { color: colors.textMuted }]}>{body}</Text>
    </View>
  );
}

const planStyles = StyleSheet.create({
  card: { marginBottom: 14, borderRadius: 14, borderLeftWidth: 3, padding: 14 },
  title: { fontSize: 15, fontWeight: "700" },
  body: { marginTop: 4, fontSize: 13, lineHeight: 19 },
});

function formatNumber(value: number): string {
  return Math.round(value).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function formatTime(iso: string): string {
  const date = new Date(iso);
  const hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours % 12 || 12}:${minutes} ${hours < 12 ? "am" : "pm"}`;
}

function localDayKey(iso: string): string {
  const date = new Date(iso);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

// "YYYY-MM-DD" from the server's daily buckets -> "Tue 22 Sep".
function formatDayKey(key: string, withWeekday = true): string {
  const [year, month, day] = key.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  const base = `${day} ${MONTHS[month - 1]}`;
  return withWeekday ? `${WEEKDAYS[date.getDay()]} ${base}` : base;
}

// The icon name is admin data, so it may not be a real glyph - fall back
// rather than render Ionicons' "?" box.
function iconFor(name: string | undefined, fallback: IoniconName): IoniconName {
  return name && name in Ionicons.glyphMap ? (name as IoniconName) : fallback;
}

function featureLabel(features: FeatureLookup, key: string | null): string {
  return (key ? features.get(key)?.label : undefined) ?? "AI usage";
}

function ledgerTitle(features: FeatureLookup, entry: CreditLedgerEntry): string {
  if (entry.reason === "ai_usage") return featureLabel(features, entry.note);
  if (entry.reason === "admin_topup") return entry.createdByName ? `Top-up by ${entry.createdByName}` : "Top-up";
  if (entry.reason === "plan_grant") return "Starting credits";
  return entry.reason;
}

function ledgerIcon(features: FeatureLookup, entry: CreditLedgerEntry): IoniconName {
  if (entry.reason === "ai_usage") return iconFor(entry.note ? features.get(entry.note)?.icon : undefined, "flash-outline");
  if (entry.reason === "admin_topup") return "add-circle-outline";
  return "wallet-outline";
}

function describeRunway(balance: number, averageDailySpend: number): { text: string; days: number | null } {
  if (balance <= 0) return { text: "Out of credits", days: 0 };
  if (averageDailySpend <= 0) return { text: "No AI usage in the last 30 days", days: null };
  const days = Math.floor(balance / averageDailySpend);
  if (days > 365) return { text: "Lasts over a year at your current pace", days };
  const perDay = formatNumber(Math.max(1, averageDailySpend));
  return { text: `Lasts about ${days} day${days === 1 ? "" : "s"} at ~${perDay} credits/day`, days };
}

export function CreditsScreen({ navigation }: Props) {
  const { accessToken, user } = useAuth();
  const { colors, cardShadow, pressedOpacity } = useTheme();

  const [summary, setSummary] = useState<CreditAccountSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAllHistory, setShowAllHistory] = useState(false);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setError(null);
    try {
      setSummary(await api.getMyCredits(accessToken));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load credits");
    } finally {
      setIsLoading(false);
    }
  }, [accessToken]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function refresh() {
    setIsRefreshing(true);
    await load();
    setIsRefreshing(false);
  }

  const balance = summary?.balance ?? 0;
  const stats = summary?.stats;
  const features = useMemo<FeatureLookup>(() => new Map((summary?.features ?? []).map((f) => [f.key, f])), [summary]);
  const coverageFeatures = (summary?.features ?? []).filter((f) => f.showOnCredits && f.cost > 0);
  const cheapestCost = Math.min(...coverageFeatures.map((f) => f.cost));
  const runway = describeRunway(balance, stats?.averageDailySpend ?? 0);
  const cannotAffordAnything = Number.isFinite(cheapestCost) && balance < cheapestCost;
  const isRunningLow = cannotAffordAnything || (runway.days !== null && runway.days < LOW_RUNWAY_DAYS);

  return (
    <Screen edges={["top", "bottom"]}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={refresh} tintColor={colors.accent} colors={[colors.accent]} />}
      >
        <View style={styles.topBar}>
          <Pressable
            onPress={() => navigation.goBack()}
            style={({ pressed }) => [styles.backButton, { backgroundColor: colors.surface, borderColor: colors.border }, pressed && { opacity: pressedOpacity }]}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
          </Pressable>
          <Text style={[styles.title, { color: colors.textPrimary }]}>Credits</Text>
        </View>

        {isLoading && !summary ? (
          <ActivityIndicator color={colors.accent} style={styles.loader} />
        ) : !summary ? (
          <Text style={[styles.error, { color: colors.danger }]}>{error}</Text>
        ) : (
          <>
            {error ? <Text style={[styles.inlineError, { color: colors.danger }]}>{error}</Text> : null}

            {summary.subscription ? <PlanNotice plan={summary.subscription} /> : null}

            <BalanceCard balance={balance} stats={stats} runwayText={runway.text} />

            {isRunningLow ? (
              <View style={[styles.notice, { backgroundColor: colors.surface, borderLeftColor: colors.danger }, cardShadow]}>
                <Text style={[styles.noticeTitle, { color: colors.textPrimary }]}>
                  {cannotAffordAnything ? "Not enough credits for AI actions" : "Credits running low"}
                </Text>
                <Text style={[styles.noticeBody, { color: colors.textMuted }]}>
                  {cannotAffordAnything
                    ? `The cheapest AI action costs ${cheapestCost} credits, so AI actions are blocked until you get a top-up.`
                    : `At your current pace this runs out in about ${runway.days} day${runway.days === 1 ? "" : "s"}.`}{" "}
                  {user?.accountType === "individual" ? "Your credits reset when a new plan period starts." : "Ask your school admin for a top-up."}
                </Text>
              </View>
            ) : null}

            {coverageFeatures.length > 0 ? (
              <>
                <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>Your balance covers</Text>
                <View style={[styles.card, { backgroundColor: colors.surface }, cardShadow]}>
                  {coverageFeatures.map((feature, index) => {
                    const count = Math.floor(Math.max(0, balance) / feature.cost);
                    return (
                      <View
                        key={feature.key}
                        style={[styles.coverageRow, index < coverageFeatures.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}
                      >
                        <Ionicons name={iconFor(feature.icon, "flash-outline")} size={20} color={colors.textMuted} />
                        <View style={styles.rowCopy}>
                          <Text style={[styles.rowTitle, { color: colors.textPrimary }]}>{feature.label}</Text>
                          <Text style={[styles.rowMeta, { color: colors.textMuted }]}>
                            {feature.description ? `${feature.description} · ` : ""}
                            {feature.cost} credits each
                          </Text>
                        </View>
                        <View style={styles.coverageCount}>
                          <Text style={[styles.coverageValue, { color: count > 0 ? colors.textPrimary : colors.textMuted }]}>
                            {formatNumber(count)}
                          </Text>
                          <Text style={[styles.coverageUnit, { color: colors.textMuted }]}>more</Text>
                        </View>
                      </View>
                    );
                  })}
                </View>
              </>
            ) : null}

            {stats?.daily?.length ? <DailyUsageChart daily={stats.daily} /> : null}

            {stats ? <FeatureBreakdown stats={stats} features={features} /> : null}

            <HistoryList
              features={features}
              entries={summary.ledgerEntries}
              showAll={showAllHistory}
              onToggleShowAll={() => setShowAllHistory((current) => !current)}
            />

            {user?.accountType === "individual" ? (
              <>
                <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>Plan changes</Text>
                <Pressable
                  onPress={() => navigation.navigate("RequestSubjectChange")}
                  style={({ pressed }) => [styles.linkRow, { backgroundColor: colors.surface }, cardShadow, pressed && { opacity: pressedOpacity }]}
                  accessibilityRole="button"
                >
                  <Ionicons name="swap-horizontal-outline" size={18} color={colors.textMuted} />
                  <Text style={[styles.linkText, { color: colors.textPrimary }]}>Request a subject change</Text>
                  <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                </Pressable>
                <Pressable
                  onPress={() => navigation.navigate("RequestClassChange")}
                  style={({ pressed }) => [styles.linkRow, { backgroundColor: colors.surface }, cardShadow, pressed && { opacity: pressedOpacity }]}
                  accessibilityRole="button"
                >
                  <Ionicons name="school-outline" size={18} color={colors.textMuted} />
                  <Text style={[styles.linkText, { color: colors.textPrimary }]}>Request a class change</Text>
                  <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                </Pressable>
              </>
            ) : null}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

function BalanceCard({ balance, stats, runwayText }: { balance: number; stats: CreditUsageStats | undefined; runwayText: string }) {
  const { colors } = useTheme();
  const totalGranted = stats?.totalGranted ?? 0;
  const remainingShare = totalGranted > 0 ? Math.min(1, Math.max(0, balance / totalGranted)) : 0;

  return (
    <View style={[styles.balanceCard, { backgroundColor: colors.accent }]}>
      <Text style={styles.balanceLabel}>Available credits</Text>
      <Text style={styles.balanceValue}>{formatNumber(balance)}</Text>

      {totalGranted > 0 ? (
        <>
          <View style={styles.balanceTrack} accessibilityLabel={`${Math.round(remainingShare * 100)} percent of granted credits left`}>
            <View style={[styles.balanceFill, { width: `${remainingShare * 100}%` }]} />
          </View>
          <View style={styles.balanceMetaRow}>
            <Text style={styles.balanceMeta}>{formatNumber(stats?.totalSpent ?? 0)} used</Text>
            <Text style={styles.balanceMeta}>of {formatNumber(totalGranted)} granted</Text>
          </View>
        </>
      ) : null}

      <View style={styles.balanceDivider} />
      <View style={styles.runwayRow}>
        <Ionicons name="time-outline" size={15} color="#FFFFFF" />
        <Text style={styles.runwayText}>{runwayText}</Text>
      </View>
    </View>
  );
}

function DailyUsageChart({ daily }: { daily: CreditUsageStats["daily"] }) {
  const { colors, cardShadow } = useTheme();
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const todayKey = daily[daily.length - 1].date;
  const active = daily.find((d) => d.date === selectedDate) ?? daily[daily.length - 1];
  const maxCredits = Math.max(1, ...daily.map((d) => d.credits));
  const total = daily.reduce((sum, d) => sum + d.credits, 0);
  const activeDays = daily.filter((d) => d.credits > 0).length;

  return (
    <>
      <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>Last 14 days</Text>
      <View style={[styles.card, styles.chartCard, { backgroundColor: colors.surface }, cardShadow]}>
        <View style={styles.chartHeader}>
          <View>
            <Text style={[styles.chartDay, { color: colors.textMuted }]}>
              {active.date === todayKey ? "Today" : formatDayKey(active.date)}
            </Text>
            <Text style={[styles.chartValue, { color: colors.textPrimary }]}>
              {formatNumber(active.credits)}
              <Text style={[styles.chartValueUnit, { color: colors.textMuted }]}> credits</Text>
            </Text>
          </View>
          <View style={styles.chartTotals}>
            <Text style={[styles.chartTotalValue, { color: colors.textPrimary }]}>{formatNumber(total)}</Text>
            <Text style={[styles.chartTotalLabel, { color: colors.textMuted }]}>
              over {activeDays} active day{activeDays === 1 ? "" : "s"}
            </Text>
          </View>
        </View>

        <View style={[styles.chartBars, { borderBottomColor: colors.border }]}>
          {daily.map((d) => {
            const isActive = d.date === active.date;
            const height = d.credits > 0 ? Math.max(4, (d.credits / maxCredits) * CHART_HEIGHT) : 2;
            return (
              <Pressable
                key={d.date}
                onPress={() => setSelectedDate(d.date)}
                style={styles.chartBarSlot}
                accessibilityRole="button"
                accessibilityLabel={`${formatDayKey(d.date)}: ${d.credits} credits`}
                accessibilityState={{ selected: isActive }}
              >
                <View
                  style={[
                    styles.chartBar,
                    {
                      height,
                      backgroundColor: isActive ? colors.accent : d.credits > 0 ? colors.accentSoftAlt : colors.border,
                    },
                  ]}
                />
              </Pressable>
            );
          })}
        </View>
        <View style={styles.chartAxis}>
          <Text style={[styles.chartAxisLabel, { color: colors.textMuted }]}>{formatDayKey(daily[0].date, false)}</Text>
          <Text style={[styles.chartAxisLabel, { color: colors.textMuted }]}>Today</Text>
        </View>
      </View>
    </>
  );
}

function FeatureBreakdown({ stats, features }: { stats: CreditUsageStats; features: FeatureLookup }) {
  const { colors, cardShadow } = useTheme();

  return (
    <>
      <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>Where credits went · 30 days</Text>
      <View style={[styles.card, { backgroundColor: colors.surface }, cardShadow]}>
        {stats.byFeature.length === 0 ? (
          <Text style={[styles.cardEmpty, { color: colors.textMuted }]}>No AI usage in the last 30 days.</Text>
        ) : (
          stats.byFeature.map((row, index) => {
            const share = stats.spentLast30Days > 0 ? row.credits / stats.spentLast30Days : 0;
            return (
              <View
                key={row.feature}
                style={[styles.breakdownRow, index < stats.byFeature.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}
              >
                <View style={styles.breakdownTop}>
                  <Text style={[styles.rowTitle, styles.breakdownLabel, { color: colors.textPrimary }]} numberOfLines={1}>
                    {featureLabel(features, row.feature)}
                  </Text>
                  <Text style={[styles.breakdownCredits, { color: colors.textPrimary }]}>{formatNumber(row.credits)}</Text>
                </View>
                <View style={[styles.breakdownTrack, { backgroundColor: colors.backgroundMuted }]}>
                  <View style={[styles.breakdownFill, { width: `${share * 100}%`, backgroundColor: colors.accent }]} />
                </View>
                <Text style={[styles.rowMeta, { color: colors.textMuted }]}>
                  {row.count} use{row.count === 1 ? "" : "s"} · {Math.round(share * 100)}% of spend
                </Text>
              </View>
            );
          })
        )}
      </View>
    </>
  );
}

function HistoryList({
  features,
  entries,
  showAll,
  onToggleShowAll,
}: {
  features: FeatureLookup;
  entries: CreditLedgerEntry[];
  showAll: boolean;
  onToggleShowAll: () => void;
}) {
  const { colors, cardShadow, pressedOpacity } = useTheme();
  const visible = showAll ? entries : entries.slice(0, HISTORY_PREVIEW_COUNT);

  // Consecutive entries (already newest-first) grouped under one day heading.
  const groups: { key: string; entries: CreditLedgerEntry[] }[] = [];
  for (const entry of visible) {
    const key = localDayKey(entry.createdAt);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.entries.push(entry);
    else groups.push({ key, entries: [entry] });
  }

  return (
    <>
      <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>History</Text>
      {entries.length === 0 ? (
        <Text style={[styles.emptyText, { color: colors.textMuted }]}>No credit activity yet.</Text>
      ) : (
        <>
          {groups.map((group) => (
            <View key={group.key} style={styles.historyGroup}>
              <Text style={[styles.historyDay, { color: colors.textSecondary }]}>{getRelativeDateLabel(group.entries[0].createdAt)}</Text>
              <View style={[styles.card, { backgroundColor: colors.surface }, cardShadow]}>
                {group.entries.map((entry, index) => (
                  <View
                    key={entry.id}
                    style={[styles.historyRow, index < group.entries.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}
                  >
                    <Ionicons name={ledgerIcon(features, entry)} size={18} color={colors.textMuted} />
                    <View style={styles.rowCopy}>
                      <Text style={[styles.rowTitle, { color: colors.textPrimary }]} numberOfLines={1}>{ledgerTitle(features, entry)}</Text>
                      <Text style={[styles.rowMeta, { color: colors.textMuted }]} numberOfLines={1}>
                        {formatTime(entry.createdAt)}
                        {entry.reason !== "ai_usage" && entry.note ? ` · ${entry.note}` : ""}
                      </Text>
                    </View>
                    <View style={styles.historyAmounts}>
                      <Text style={[styles.historyDelta, { color: entry.delta >= 0 ? colors.accent : colors.textPrimary }]}>
                        {entry.delta >= 0 ? "+" : "−"}
                        {formatNumber(Math.abs(entry.delta))}
                      </Text>
                      <Text style={[styles.historyBalance, { color: colors.textMuted }]}>Bal {formatNumber(entry.balanceAfter)}</Text>
                    </View>
                  </View>
                ))}
              </View>
            </View>
          ))}

          {entries.length > HISTORY_PREVIEW_COUNT ? (
            <Pressable
              onPress={onToggleShowAll}
              hitSlop={8}
              style={({ pressed }) => [styles.showAllButton, pressed && { opacity: pressedOpacity }]}
              accessibilityRole="button"
            >
              <Text style={[styles.showAllText, { color: colors.accent }]}>
                {showAll ? "Show less" : `Show all ${entries.length} entries`}
              </Text>
            </Pressable>
          ) : null}
        </>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 20,
    fontWeight: "800",
  },
  loader: {
    marginTop: 40,
  },
  error: {
    marginTop: 20,
    textAlign: "center",
  },
  inlineError: {
    marginTop: spacing.md,
    fontSize: 13,
  },
  balanceCard: {
    marginTop: 20,
    borderRadius: 18,
    padding: 20,
  },
  balanceLabel: {
    color: "#FFFFFF",
    opacity: 0.85,
    fontSize: 13,
    fontWeight: "600",
  },
  balanceValue: {
    color: "#FFFFFF",
    fontSize: 38,
    fontWeight: "800",
    marginTop: 2,
    letterSpacing: -0.5,
  },
  balanceTrack: {
    marginTop: 14,
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.25)",
    overflow: "hidden",
  },
  balanceFill: {
    height: 6,
    borderRadius: 3,
    backgroundColor: "#FFFFFF",
  },
  balanceMetaRow: {
    marginTop: 8,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  balanceMeta: {
    color: "#FFFFFF",
    opacity: 0.85,
    fontSize: 12,
    fontWeight: "500",
  },
  balanceDivider: {
    marginTop: 14,
    height: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(255,255,255,0.35)",
  },
  runwayRow: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  runwayText: {
    flex: 1,
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "600",
  },
  notice: {
    ...softCardShadow,
    marginTop: 14,
    borderRadius: 14,
    borderLeftWidth: 3,
    padding: 14,
  },
  noticeTitle: {
    fontSize: 14,
    fontWeight: "700",
  },
  noticeBody: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 19,
  },
  noticeAction: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
  },
  noticeActionText: {
    fontSize: 13,
    fontWeight: "700",
  },
  sectionLabel: {
    marginTop: 24,
    marginBottom: 10,
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  card: {
    ...softCardShadow,
    borderRadius: 14,
    overflow: "hidden",
  },
  cardEmpty: {
    padding: 14,
    fontSize: 13,
  },
  rowCopy: {
    flex: 1,
  },
  rowTitle: {
    fontSize: 14,
    fontWeight: "700",
  },
  rowMeta: {
    marginTop: 2,
    fontSize: 12,
  },
  coverageRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  coverageCount: {
    alignItems: "flex-end",
  },
  coverageValue: {
    fontSize: 18,
    fontWeight: "800",
  },
  coverageUnit: {
    fontSize: 11,
    fontWeight: "500",
  },
  chartCard: {
    padding: 14,
  },
  chartHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  chartDay: {
    fontSize: 12,
    fontWeight: "600",
  },
  chartValue: {
    marginTop: 2,
    fontSize: 22,
    fontWeight: "800",
  },
  chartValueUnit: {
    fontSize: 13,
    fontWeight: "600",
  },
  chartTotals: {
    alignItems: "flex-end",
  },
  chartTotalValue: {
    fontSize: 14,
    fontWeight: "700",
  },
  chartTotalLabel: {
    marginTop: 2,
    fontSize: 11,
  },
  chartBars: {
    marginTop: 16,
    height: CHART_HEIGHT,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  chartBarSlot: {
    flex: 1,
    height: "100%",
    justifyContent: "flex-end",
  },
  chartBar: {
    borderTopLeftRadius: 3,
    borderTopRightRadius: 3,
  },
  chartAxis: {
    marginTop: 6,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  chartAxisLabel: {
    fontSize: 11,
  },
  breakdownRow: {
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  breakdownTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  breakdownLabel: {
    flex: 1,
  },
  breakdownCredits: {
    fontSize: 14,
    fontWeight: "700",
  },
  breakdownTrack: {
    marginTop: 8,
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
  },
  breakdownFill: {
    height: 6,
    borderRadius: 3,
  },
  historyGroup: {
    marginBottom: 12,
  },
  historyDay: {
    marginBottom: 6,
    fontSize: 13,
    fontWeight: "600",
  },
  historyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  historyAmounts: {
    alignItems: "flex-end",
  },
  historyDelta: {
    fontSize: 15,
    fontWeight: "800",
  },
  historyBalance: {
    marginTop: 2,
    fontSize: 11,
  },
  emptyText: {
    fontSize: 13,
  },
  showAllButton: {
    alignSelf: "center",
    paddingVertical: 6,
  },
  showAllText: {
    fontSize: 13,
    fontWeight: "700",
  },
  linkRow: {
    ...softCardShadow,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 14,
    padding: 14,
  },
  linkText: {
    flex: 1,
    fontSize: 14,
    fontWeight: "700",
  },
});
