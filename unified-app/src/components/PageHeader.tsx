import { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../theme/ThemeContext";

interface HeaderMetric {
  label: string;
  value: string | number;
  tone?: "default" | "accent" | "danger";
}

interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  metrics?: HeaderMetric[];
  action?: ReactNode;
}

export function PageHeader({ eyebrow, title, subtitle, icon, metrics = [], action }: PageHeaderProps) {
  const { colors, cardShadow } = useTheme();

  return (
    <View style={[styles.header, { backgroundColor: colors.surface, borderColor: colors.border }, cardShadow]}>
      <View style={styles.topRow}>
        <View style={styles.titleBlock}>
          {eyebrow ? <Text style={[styles.eyebrow, { color: colors.accent }]}>{eyebrow}</Text> : null}
          <Text style={[styles.title, { color: colors.textPrimary }]}>{title}</Text>
          {subtitle ? <Text style={[styles.subtitle, { color: colors.textMuted }]}>{subtitle}</Text> : null}
        </View>
        {action ? (
          action
        ) : icon ? (
          <View style={[styles.iconWrap, { backgroundColor: colors.accentSoft }]}>
            <Ionicons name={icon} size={18} color={colors.accent} />
          </View>
        ) : null}
      </View>

      {metrics.length > 0 ? (
        <View style={styles.metricRow}>
          {metrics.map((metric) => {
            const isAccent = metric.tone === "accent";
            const isDanger = metric.tone === "danger";
            const color = isDanger ? colors.danger : isAccent ? colors.accent : colors.textPrimary;
            return (
              <View key={metric.label} style={[styles.metricItem, { backgroundColor: colors.surfaceRaised }]}>
                <Text style={[styles.metricValue, { color }]}>{metric.value}</Text>
                <Text style={[styles.metricLabel, { color: colors.textMuted }]} numberOfLines={1}>
                  {metric.label}
                </Text>
              </View>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
    gap: 14,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 14,
  },
  titleBlock: {
    flex: 1,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  title: {
    marginTop: 5,
    fontSize: 24,
    lineHeight: 29,
    fontWeight: "800",
    letterSpacing: 0,
  },
  subtitle: {
    marginTop: 5,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "500",
  },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  metricRow: {
    flexDirection: "row",
    gap: 8,
  },
  metricItem: {
    flex: 1,
    minHeight: 58,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 9,
    justifyContent: "center",
  },
  metricValue: {
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: 0,
  },
  metricLabel: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: "700",
  },
});
