import { useEffect, useState } from "react";
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useTheme } from "../../theme/ThemeContext";
import { Screen } from "../../components/Screen";
import { softCardShadow } from "../../theme/tokens";
import { api, ContentPage } from "../../api/client";

// Purpose-built, not the generic markdown LegalDocumentScreen - a contact
// page reads better as tappable icon cards than a wall of text. The values
// themselves still come from ContentPage.fields (key "contact"), so support
// can change a phone number from the admin dashboard without an app release.
interface ContactRow {
  key: string;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  onPress?: () => void;
}

function buildRows(fields: Record<string, string>): ContactRow[] {
  const rows: ContactRow[] = [];
  if (fields.email) {
    rows.push({ key: "email", icon: "mail-outline", label: "Email", value: fields.email, onPress: () => Linking.openURL(`mailto:${fields.email}`) });
  }
  if (fields.phone) {
    rows.push({ key: "phone", icon: "call-outline", label: "Call", value: fields.phone, onPress: () => Linking.openURL(`tel:${fields.phone.replace(/\s/g, "")}`) });
  }
  if (fields.whatsapp) {
    rows.push({
      key: "whatsapp",
      icon: "logo-whatsapp",
      label: "WhatsApp",
      value: fields.whatsapp,
      onPress: () => Linking.openURL(`https://wa.me/${fields.whatsapp.replace(/[^0-9]/g, "")}`),
    });
  }
  if (fields.address) {
    rows.push({ key: "address", icon: "location-outline", label: "Office", value: fields.address });
  }
  if (fields.hours) {
    rows.push({ key: "hours", icon: "time-outline", label: "Hours", value: fields.hours });
  }
  return rows;
}

export function ContactScreen() {
  const { colors, pressedOpacity } = useTheme();
  const [page, setPage] = useState<ContentPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [retryTick, setRetryTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    api
      .getContentPage("contact")
      .then((result) => {
        if (!cancelled) setPage(result);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load this page");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [retryTick]);

  const rows = page?.fields ? buildRows(page.fields) : [];

  return (
    <Screen edges={["bottom"]}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <LinearGradient colors={[colors.accent, colors.accentDark]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
          <View style={styles.heroGlowLarge} />
          <View style={styles.heroGlowSmall} />
          <View style={styles.heroIcon}>
            <Ionicons name="chatbubbles-outline" size={26} color="#FFFFFF" />
          </View>
          <Text style={styles.heroTitle}>Contact Us</Text>
          <Text style={styles.heroSubtitle}>{page?.bodyMarkdown.trim() || "We're here to help."}</Text>
        </LinearGradient>

        {isLoading ? (
          <ActivityIndicator color={colors.accent} style={styles.loader} />
        ) : error || rows.length === 0 ? (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle-outline" size={22} color={colors.textMuted} />
            <Text style={[styles.errorText, { color: colors.textMuted }]}>{error ?? "Contact details aren't available right now."}</Text>
            <Pressable onPress={() => setRetryTick((n) => n + 1)} accessibilityRole="button" accessibilityLabel="Retry">
              <Text style={[styles.retryText, { color: colors.accent }]}>Tap to retry</Text>
            </Pressable>
          </View>
        ) : (
          <View style={[styles.card, { backgroundColor: colors.surface }, softCardShadow]}>
            {rows.map((row, index) => {
              const content = (
                <>
                  <View style={[styles.rowIcon, { backgroundColor: colors.accentSoft }]}>
                    <Ionicons name={row.icon} size={19} color={colors.accent} />
                  </View>
                  <View style={styles.rowCopy}>
                    <Text style={[styles.rowLabel, { color: colors.textMuted }]}>{row.label}</Text>
                    <Text style={[styles.rowValue, { color: colors.textPrimary }]}>{row.value}</Text>
                  </View>
                  {row.onPress ? <Ionicons name="chevron-forward" size={18} color={colors.textMuted} /> : null}
                </>
              );
              const rowStyle = [styles.row, index < rows.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border }];
              return row.onPress ? (
                <Pressable key={row.key} onPress={row.onPress} style={({ pressed }) => [...rowStyle, pressed && { opacity: pressedOpacity }]} accessibilityRole="button" accessibilityLabel={`${row.label}: ${row.value}`}>
                  {content}
                </Pressable>
              ) : (
                <View key={row.key} style={rowStyle}>
                  {content}
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 20, paddingTop: 6, paddingBottom: 60, gap: 20 },
  hero: { borderRadius: 24, paddingHorizontal: 22, paddingVertical: 26, alignItems: "center", overflow: "hidden" },
  heroGlowLarge: { position: "absolute", width: 150, height: 150, borderRadius: 75, right: -50, top: -60, backgroundColor: "#FFFFFF", opacity: 0.1 },
  heroGlowSmall: { position: "absolute", width: 64, height: 64, borderRadius: 32, left: -20, bottom: -24, backgroundColor: "#FFFFFF", opacity: 0.1 },
  heroIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: "rgba(255,255,255,0.18)", alignItems: "center", justifyContent: "center", marginBottom: 14, zIndex: 2 },
  heroTitle: { color: "#FFFFFF", fontSize: 22, fontWeight: "800", letterSpacing: -0.4, zIndex: 2 },
  heroSubtitle: { marginTop: 8, color: "rgba(255,255,255,0.85)", fontSize: 13, lineHeight: 19, textAlign: "center", maxWidth: "88%", zIndex: 2 },
  loader: { marginTop: 20 },
  errorBox: { alignItems: "center", gap: 10, marginTop: 20, paddingHorizontal: 20 },
  errorText: { fontSize: 13, fontWeight: "500", textAlign: "center" },
  retryText: { fontSize: 13, fontWeight: "700" },
  card: { borderRadius: 20, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 16, paddingVertical: 15 },
  rowIcon: { width: 40, height: 40, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  rowCopy: { flex: 1 },
  rowLabel: { fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.3 },
  rowValue: { marginTop: 2, fontSize: 14.5, fontWeight: "700" },
});
