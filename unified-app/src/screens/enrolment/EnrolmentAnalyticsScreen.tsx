import { ReactNode, useCallback, useState } from "react";
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Defs, LinearGradient as SvgLinearGradient, Path, Stop } from "react-native-svg";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../theme/ThemeContext";
import { Screen } from "../../components/Screen";
import { ThemeColors } from "../../theme/tokens";
import { usePipelineStages } from "../../hooks/usePipelineStages";
import { useTabBarScrollHandler } from "../../navigation/TabBarScrollContext";
import {
  api,
  PipelineStage,
  EnrolmentFunnel,
  EnrolmentBySource,
  EnrolmentCounsellorPerformance,
  EnrolmentTrend,
  EnrolmentStageVelocity,
  EnrolmentLostReasons,
  EnrolmentTaskOutcomes,
  EnrolmentGradeDemand,
  EnrolmentYearlyTrend,
} from "../../api/client";
import { capitalizeFirst } from "../../utils/text";

const PALETTE = ["#7359D9", "#F2675B", "#E5A72D", "#3B9EDB", "#2FA678", "#C24039"];

const TASK_STATUS_COLORS: Record<string, string> = {
  sent: "#2FA678",
  pending: "#E5A72D",
  failed: "#C24039",
  cancelled: "#8A8A9A",
};

function formatSource(value: string): string {
  return value.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function monthLabel(period: string): string {
  const [year, month] = period.split("-").map(Number);
  if (!year || !month) return period;
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-IN", { month: "short" });
}

export function EnrolmentAnalyticsScreen() {
  const { accessToken } = useAuth();
  const { colors, cardShadow } = useTheme();
  const { stages } = usePipelineStages();
  const handleTabBarScroll = useTabBarScrollHandler();

  const [funnel, setFunnel] = useState<EnrolmentFunnel | null>(null);
  const [bySource, setBySource] = useState<EnrolmentBySource | null>(null);
  const [counsellorPerformance, setCounsellorPerformance] = useState<EnrolmentCounsellorPerformance[] | null>(null);
  const [trend, setTrend] = useState<EnrolmentTrend | null>(null);
  const [stageVelocity, setStageVelocity] = useState<EnrolmentStageVelocity[] | null>(null);
  const [lostReasons, setLostReasons] = useState<EnrolmentLostReasons | null>(null);
  const [taskOutcomes, setTaskOutcomes] = useState<EnrolmentTaskOutcomes | null>(null);
  const [gradeDemand, setGradeDemand] = useState<EnrolmentGradeDemand | null>(null);
  const [yearlyTrend, setYearlyTrend] = useState<EnrolmentYearlyTrend | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setIsLoading(true);
    try {
      const [
        funnelRes,
        bySourceRes,
        counsellorRes,
        trendRes,
        stageVelocityRes,
        lostReasonsRes,
        taskOutcomesRes,
        gradeDemandRes,
        yearlyTrendRes,
      ] = await Promise.all([
        api.getEnrolmentFunnel(accessToken),
        api.getEnrolmentBySource(accessToken),
        api.getEnrolmentCounsellorPerformance(accessToken),
        api.getEnrolmentTrend(accessToken, 6),
        api.getEnrolmentStageVelocity(accessToken),
        api.getEnrolmentLostReasons(accessToken),
        api.getEnrolmentTaskOutcomes(accessToken),
        api.getEnrolmentGradeDemand(accessToken),
        api.getEnrolmentYearlyTrend(accessToken),
      ]);
      setFunnel(funnelRes);
      setBySource(bySourceRes);
      setCounsellorPerformance(counsellorRes);
      setTrend(trendRes);
      setStageVelocity(stageVelocityRes);
      setLostReasons(lostReasonsRes);
      setTaskOutcomes(taskOutcomesRes);
      setGradeDemand(gradeDemandRes);
      setYearlyTrend(yearlyTrendRes);
    } catch {
      setFunnel(null);
      setBySource(null);
      setCounsellorPerformance(null);
      setTrend(null);
      setStageVelocity(null);
      setLostReasons(null);
      setTaskOutcomes(null);
      setGradeDemand(null);
      setYearlyTrend(null);
    } finally {
      setIsLoading(false);
    }
  }, [accessToken]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const hasAnyData = !!(funnel || bySource || counsellorPerformance || trend);

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={load} tintColor={colors.accent} />}
        onScroll={handleTabBarScroll}
        scrollEventThrottle={16}
      >
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>Analytics</Text>
          <Text style={[styles.subtitle, { color: colors.textMuted }]}>
            How your pipeline is performing across enquiries, sources, and stages.
          </Text>
        </View>

        {isLoading && !hasAnyData ? (
          <ActivityIndicator color={colors.accent} style={{ marginVertical: 32 }} />
        ) : (
          <>
            <ChartCard title="Enquiry trend" subtitle="New enquiries vs. conversions, last 6 months" icon="trending-up-outline" colors={colors} cardShadow={cardShadow}>
              <AreaTrendChart series={trend?.periods.map((p) => ({ key: p.period, label: monthLabel(p.period), newEnquiries: p.newEnquiries, converted: p.converted })) ?? []} colors={colors} />
            </ChartCard>

            <ChartCard title="Year-on-year growth" subtitle="New enquiries vs. conversions, by year" icon="stats-chart-outline" colors={colors} cardShadow={cardShadow}>
              <AreaTrendChart series={yearlyTrend?.years.map((y) => ({ key: y.year, label: y.year, newEnquiries: y.newEnquiries, converted: y.converted })) ?? []} colors={colors} />
            </ChartCard>

            <ChartCard title="Source breakdown" subtitle="Where your enquiries are coming from" icon="pie-chart-outline" colors={colors} cardShadow={cardShadow}>
              <SourceChart bySource={bySource} colors={colors} />
            </ChartCard>

            <ChartCard title="Grade-wise demand" subtitle="Enquiries by grade interest" icon="school-outline" colors={colors} cardShadow={cardShadow}>
              <GradeDemandChart gradeDemand={gradeDemand} colors={colors} />
            </ChartCard>

            <ChartCard title="Pipeline funnel" subtitle="Leads by pipeline stage" icon="filter-outline" colors={colors} cardShadow={cardShadow}>
              <FunnelChart funnel={funnel} stages={stages} colors={colors} />
            </ChartCard>

            <ChartCard title="Stage velocity" subtitle="Average days a lead spends in a stage before moving on" icon="speedometer-outline" colors={colors} cardShadow={cardShadow}>
              <StageVelocityChart stageVelocity={stageVelocity} colors={colors} />
            </ChartCard>

            <ChartCard title="Lost reasons" subtitle="Why leads are marked lost" icon="close-circle-outline" colors={colors} cardShadow={cardShadow}>
              <LostReasonsChart lostReasons={lostReasons} colors={colors} />
            </ChartCard>

            <ChartCard title="Follow-up outcomes" subtitle="Status of every follow-up task" icon="checkmark-done-outline" colors={colors} cardShadow={cardShadow}>
              <TaskStatusChart taskOutcomes={taskOutcomes} colors={colors} />
            </ChartCard>

            <ChartCard title="Channel effectiveness" subtitle="Share of follow-ups actually sent, by channel" icon="radio-outline" colors={colors} cardShadow={cardShadow}>
              <ChannelEffectivenessChart taskOutcomes={taskOutcomes} colors={colors} />
            </ChartCard>

            <ChartCard title="Counsellor performance" subtitle="Conversion rate, top 5 counsellors" icon="people-outline" colors={colors} cardShadow={cardShadow}>
              <TeamChart data={counsellorPerformance} colors={colors} />
            </ChartCard>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

function ChartCard({
  title,
  subtitle,
  icon,
  colors,
  cardShadow,
  children,
}: {
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  colors: ThemeColors;
  cardShadow: ReturnType<typeof useTheme>["cardShadow"];
  children: ReactNode;
}) {
  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, cardShadow]}>
      <View style={styles.cardHeader}>
        <Ionicons name={icon} size={16} color={colors.textMuted} />
        <View style={styles.cardHeaderText}>
          <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>{title}</Text>
          <Text style={[styles.cardSubtitle, { color: colors.textMuted }]}>{subtitle}</Text>
        </View>
      </View>
      <View style={[styles.cardDivider, { backgroundColor: colors.border }]} />
      <View style={styles.chartArea}>{children}</View>
    </View>
  );
}

function BarChart({
  bars,
  colors,
  valueSuffix = "",
}: {
  bars: { label: string; value: number; color: string }[];
  colors: ThemeColors;
  valueSuffix?: string;
}) {
  if (bars.length === 0) {
    return <Text style={[styles.chartEmpty, { color: colors.textMuted }]}>No data yet.</Text>;
  }
  const maxValue = Math.max(1, ...bars.map((bar) => bar.value));
  return (
    <View style={styles.chartRow}>
      {bars.map((bar) => (
        <View key={bar.label} style={styles.chartCol}>
          <Text style={[styles.chartValue, { color: colors.textSecondary }]} numberOfLines={1}>
            {bar.value}
            {valueSuffix}
          </Text>
          <View style={[styles.chartTrack, { backgroundColor: colors.surfaceRaised }]}>
            <View
              style={[
                styles.chartFill,
                { height: `${Math.max(4, (bar.value / maxValue) * 100)}%`, backgroundColor: bar.color },
              ]}
            />
          </View>
          <Text style={[styles.chartLabel, { color: colors.textMuted }]} numberOfLines={1}>
            {bar.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

function AreaTrendChart({
  series,
  colors,
}: {
  series: { key: string; label: string; newEnquiries: number; converted: number }[];
  colors: ThemeColors;
}) {
  const [width, setWidth] = useState(280);
  if (series.length === 0) {
    return <Text style={[styles.chartEmpty, { color: colors.textMuted }]}>No data yet.</Text>;
  }

  const height = 140;
  const paddingX = 6;
  const paddingY = 14;
  const innerWidth = Math.max(1, width - paddingX * 2);
  const innerHeight = height - paddingY * 2;
  const maxValue = Math.max(1, ...series.flatMap((p) => [p.newEnquiries, p.converted]));
  const stepX = series.length > 1 ? innerWidth / (series.length - 1) : 0;

  const pointsFor = (key: "newEnquiries" | "converted") =>
    series.map((p, i) => ({
      x: paddingX + i * stepX,
      y: paddingY + innerHeight - (p[key] / maxValue) * innerHeight,
    }));

  const linePath = (points: { x: number; y: number }[]) =>
    points.map((pt, i) => `${i === 0 ? "M" : "L"} ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`).join(" ");

  const areaPath = (points: { x: number; y: number }[]) => {
    if (points.length === 0) return "";
    const floorY = paddingY + innerHeight;
    return `${linePath(points)} L ${points[points.length - 1].x.toFixed(1)} ${floorY} L ${points[0].x.toFixed(1)} ${floorY} Z`;
  };

  const newPoints = pointsFor("newEnquiries");
  const convertedPoints = pointsFor("converted");

  return (
    <View style={{ width: "100%" }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <Svg width={width} height={height}>
        <Defs>
          <SvgLinearGradient id="trendAreaFill" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#7359D9" stopOpacity={0.32} />
            <Stop offset="1" stopColor="#7359D9" stopOpacity={0} />
          </SvgLinearGradient>
        </Defs>
        <Path d={areaPath(newPoints)} fill="url(#trendAreaFill)" />
        <Path d={linePath(newPoints)} stroke="#7359D9" strokeWidth={2.5} fill="none" strokeLinejoin="round" strokeLinecap="round" />
        <Path
          d={linePath(convertedPoints)}
          stroke="#2FA678"
          strokeWidth={2.5}
          fill="none"
          strokeLinejoin="round"
          strokeLinecap="round"
          strokeDasharray="6,5"
        />
        {newPoints.map((pt, i) => (
          <Circle key={`n-${i}`} cx={pt.x} cy={pt.y} r={3} fill="#7359D9" />
        ))}
        {convertedPoints.map((pt, i) => (
          <Circle key={`c-${i}`} cx={pt.x} cy={pt.y} r={3} fill="#2FA678" />
        ))}
      </Svg>
      <View style={styles.trendLabelRow}>
        {series.map((p) => (
          <Text key={p.key} style={[styles.chartLabel, styles.trendLabel, { color: colors.textMuted }]} numberOfLines={1}>
            {p.label}
          </Text>
        ))}
      </View>
      <View style={styles.chartLegendRow}>
        <LegendDot color="#7359D9" label="New" colors={colors} />
        <LegendDot color="#2FA678" label="Converted" colors={colors} />
      </View>
    </View>
  );
}

function DonutChart({
  items,
  colors,
  valueSuffix = "",
}: {
  items: { label: string; value: number; color: string }[];
  colors: ThemeColors;
  valueSuffix?: string;
}) {
  if (items.length === 0) {
    return <Text style={[styles.chartEmpty, { color: colors.textMuted }]}>No data yet.</Text>;
  }
  const total = items.reduce((sum, item) => sum + item.value, 0) || 1;
  const size = 132;
  const strokeWidth = 20;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  let cumulative = 0;
  const segments = items.map((item) => {
    const fraction = item.value / total;
    const dash = Math.max(0, fraction * circumference - 2);
    const rotation = (cumulative / total) * 360 - 90;
    cumulative += item.value;
    return { ...item, dash, rotation };
  });

  return (
    <View style={styles.donutWrap}>
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={radius} stroke={colors.surfaceRaised} strokeWidth={strokeWidth} fill="none" />
        {segments.map((seg, i) => (
          <Circle
            key={i}
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={seg.color}
            strokeWidth={strokeWidth}
            fill="none"
            strokeDasharray={`${seg.dash} ${circumference}`}
            strokeLinecap="round"
            origin={`${size / 2}, ${size / 2}`}
            rotation={seg.rotation}
          />
        ))}
      </Svg>
      <View style={styles.donutLegend}>
        {items.map((item) => (
          <View key={item.label} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: item.color }]} />
            <Text style={[styles.donutLegendLabel, { color: colors.textSecondary }]} numberOfLines={1}>
              {item.label} · {item.value}
              {valueSuffix}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function SourceChart({ bySource, colors }: { bySource: EnrolmentBySource | null; colors: ThemeColors }) {
  const entries = Object.entries(bySource?.bySource ?? {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);
  const items = entries.map(([source, value], index) => ({
    label: formatSource(source),
    value,
    color: PALETTE[index % PALETTE.length],
  }));
  return <DonutChart items={items} colors={colors} />;
}

function GradeDemandChart({ gradeDemand, colors }: { gradeDemand: EnrolmentGradeDemand | null; colors: ThemeColors }) {
  const entries = Object.entries(gradeDemand?.byGrade ?? {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);
  const bars = entries.map(([grade, value], index) => ({
    label: grade,
    value,
    color: PALETTE[index % PALETTE.length],
  }));
  return <BarChart bars={bars} colors={colors} />;
}

function FunnelChart({
  funnel,
  stages,
  colors,
}: {
  funnel: EnrolmentFunnel | null;
  stages: PipelineStage[];
  colors: ThemeColors;
}) {
  if (!funnel || stages.length === 0) {
    return <Text style={[styles.chartEmpty, { color: colors.textMuted }]}>No funnel data yet.</Text>;
  }
  const bars = stages.map((stage) => ({
    label: stage.label,
    value: funnel.byStatus[stage.key] ?? 0,
    color: stage.isConverted ? "#2FA678" : "#7359D9",
  }));
  return (
    <>
      <BarChart bars={bars} colors={colors} />
      <Text style={[styles.chartFootnote, { color: colors.textMuted }]}>
        {funnel.convertedCount} of {funnel.totalCount} leads converted ({Math.round(funnel.conversionRate * 100)}%)
      </Text>
    </>
  );
}

function StageVelocityChart({ stageVelocity, colors }: { stageVelocity: EnrolmentStageVelocity[] | null; colors: ThemeColors }) {
  const withData = (stageVelocity ?? []).filter((stage) => stage.avgDays !== null);
  if (withData.length === 0) {
    return <Text style={[styles.chartEmpty, { color: colors.textMuted }]}>Not enough stage movement yet.</Text>;
  }
  const bars = withData.map((stage, index) => ({
    label: stage.stageLabel,
    value: stage.avgDays ?? 0,
    color: PALETTE[index % PALETTE.length],
  }));
  return <BarChart bars={bars} colors={colors} valueSuffix="d" />;
}

function LostReasonsChart({ lostReasons, colors }: { lostReasons: EnrolmentLostReasons | null; colors: ThemeColors }) {
  const entries = Object.entries(lostReasons?.byReason ?? {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);
  if (entries.length === 0) {
    return <Text style={[styles.chartEmpty, { color: colors.textMuted }]}>No lost leads recorded yet.</Text>;
  }
  const bars = entries.map(([reason, value], index) => ({
    label: reason,
    value,
    color: PALETTE[index % PALETTE.length],
  }));
  return <BarChart bars={bars} colors={colors} />;
}

function TaskStatusChart({ taskOutcomes, colors }: { taskOutcomes: EnrolmentTaskOutcomes | null; colors: ThemeColors }) {
  const entries = Object.entries(taskOutcomes?.byStatus ?? {});
  if (entries.length === 0) {
    return <Text style={[styles.chartEmpty, { color: colors.textMuted }]}>No follow-up tasks yet.</Text>;
  }
  const bars = entries.map(([status, value]) => ({
    label: status.charAt(0).toUpperCase() + status.slice(1),
    value,
    color: TASK_STATUS_COLORS[status] ?? "#7359D9",
  }));
  return <BarChart bars={bars} colors={colors} />;
}

function ChannelEffectivenessChart({ taskOutcomes, colors }: { taskOutcomes: EnrolmentTaskOutcomes | null; colors: ThemeColors }) {
  const channels = taskOutcomes?.channelEffectiveness ?? [];
  if (channels.length === 0) {
    return <Text style={[styles.chartEmpty, { color: colors.textMuted }]}>No follow-up tasks yet.</Text>;
  }
  const bars = channels.map((channel, index) => ({
    label: formatSource(channel.channel),
    value: Math.round(channel.sentRate * 100),
    color: PALETTE[index % PALETTE.length],
  }));
  return <BarChart bars={bars} colors={colors} valueSuffix="%" />;
}

function TeamChart({ data, colors }: { data: EnrolmentCounsellorPerformance[] | null; colors: ThemeColors }) {
  const bars = (data ?? []).slice(0, 5).map((counsellor, index) => ({
    label: capitalizeFirst(counsellor.fullName.split(" ")[0] ?? counsellor.fullName),
    value: Math.round(counsellor.conversionRate * 100),
    color: PALETTE[index % PALETTE.length],
  }));
  return <BarChart bars={bars} colors={colors} valueSuffix="%" />;
}

function LegendDot({ color, label, colors }: { color: string; label: string; colors: ThemeColors }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={[styles.legendLabel, { color: colors.textMuted }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 140, gap: 16 },
  header: { gap: 6, marginBottom: 4 },
  title: { fontSize: 28, fontWeight: "800", letterSpacing: -0.6 },
  subtitle: { fontSize: 13, lineHeight: 19, fontWeight: "500" },
  card: { borderRadius: 16, borderWidth: 1, padding: 16, gap: 4 },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  cardHeaderText: { flex: 1, gap: 2 },
  cardTitle: { fontSize: 14, fontWeight: "700", letterSpacing: -0.1 },
  cardSubtitle: { fontSize: 12, fontWeight: "500" },
  cardDivider: { height: 1, marginTop: 12 },
  chartArea: { marginTop: 16, alignItems: "center" },
  chartEmpty: { fontSize: 13, fontWeight: "500", paddingVertical: 24 },
  chartRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    alignSelf: "stretch",
    gap: 6,
  },
  chartCol: { flex: 1, alignItems: "center" },
  chartValue: { fontSize: 11, fontWeight: "700", marginBottom: 6 },
  chartTrack: { width: 20, height: 96, borderRadius: 4, overflow: "hidden", justifyContent: "flex-end" },
  chartTrackNarrow: { width: 9 },
  chartGroupTrack: { flexDirection: "row", alignItems: "flex-end", gap: 3, height: 96 },
  chartFill: { width: "100%", borderRadius: 4 },
  chartLabel: { marginTop: 6, fontSize: 10, fontWeight: "600" },
  chartFootnote: { marginTop: 14, fontSize: 12, fontWeight: "600", textAlign: "center" },
  chartLegendRow: { flexDirection: "row", justifyContent: "center", gap: 18, marginTop: 14 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendLabel: { fontSize: 11, fontWeight: "700" },
  trendLabelRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 2 },
  trendLabel: { flex: 1, textAlign: "center" },
  donutWrap: { flexDirection: "row", alignItems: "center", gap: 18, alignSelf: "stretch" },
  donutLegend: { flex: 1, gap: 8 },
  donutLegendLabel: { flex: 1, fontSize: 12, fontWeight: "600" },
});
