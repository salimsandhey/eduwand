import { useState } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useTheme } from "../../theme/ThemeContext";
import { Screen } from "../../components/Screen";
import { softCardShadow } from "../../theme/tokens";

const SUPPORT_EMAIL = "support@eduwand.com";
const SUPPORT_PHONE = "+91 22 4000 1234";

const FAQS: { question: string; answer: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  {
    question: "How do I log a new enquiry?",
    answer: "Go to Enquiries and tap New Enquiry, or use the New enquiry quick action on Home.",
    icon: "person-add-outline",
  },
  {
    question: "How do I move a lead through the pipeline?",
    answer: "Open the lead from Pipeline or Enquiries and update its stage from the enquiry detail screen.",
    icon: "git-network-outline",
  },
  {
    question: "Where can I see overdue follow-ups?",
    answer: "The Tasks tab groups your follow-ups into Overdue, Today, and Upcoming.",
    icon: "time-outline",
  },
  {
    question: "Who do I contact for account issues?",
    answer: "Reach the EduWand support team using the email or phone number above and we'll get back to you.",
    icon: "shield-checkmark-outline",
  },
];

export function HelpSupportScreen() {
  const { colors, cardShadow, pressedOpacity } = useTheme();
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  return (
    <Screen edges={["bottom"]}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <LinearGradient colors={[colors.accent, colors.accentDark]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
          <View style={styles.heroGlowLarge} />
          <View style={styles.heroGlowSmall} />
          <View style={styles.heroIcon}>
            <Ionicons name="help-buoy-outline" size={26} color="#FFFFFF" />
          </View>
          <Text style={styles.heroTitle}>Help & support</Text>
          <Text style={styles.heroSubtitle}>
            We&apos;re here if you get stuck. Reach the team directly or check a quick answer below.
          </Text>
        </LinearGradient>

        <View style={[styles.contactCard, { backgroundColor: colors.surface, borderWidth: 0 }, cardShadow]}>
          <Pressable
            onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}`)}
            style={({ pressed }) => [styles.contactTile, pressed && { opacity: pressedOpacity }]}
            accessibilityRole="button"
            accessibilityLabel="Email support"
          >
            <View style={[styles.contactIcon, { backgroundColor: colors.accentSoft }]}>
              <Ionicons name="mail-outline" size={20} color={colors.accent} />
            </View>
            <Text style={[styles.contactLabel, { color: colors.textPrimary }]}>Email us</Text>
            <Text style={[styles.contactValue, { color: colors.textMuted }]} numberOfLines={1}>
              {SUPPORT_EMAIL}
            </Text>
          </Pressable>

          <View style={[styles.contactDivider, { backgroundColor: colors.border }]} />

          <Pressable
            onPress={() => Linking.openURL(`tel:${SUPPORT_PHONE.replace(/\s/g, "")}`)}
            style={({ pressed }) => [styles.contactTile, pressed && { opacity: pressedOpacity }]}
            accessibilityRole="button"
            accessibilityLabel="Call support"
          >
            <View style={[styles.contactIcon, { backgroundColor: colors.accentSoft }]}>
              <Ionicons name="call-outline" size={20} color={colors.accent} />
            </View>
            <Text style={[styles.contactLabel, { color: colors.textPrimary }]}>Call us</Text>
            <Text style={[styles.contactValue, { color: colors.textMuted }]} numberOfLines={1}>
              {SUPPORT_PHONE}
            </Text>
          </Pressable>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Frequently asked</Text>
          <View style={[styles.faqCard, { backgroundColor: colors.surface, borderWidth: 0 }, cardShadow]}>
            {FAQS.map((faq, index) => {
              const isOpen = openFaq === index;
              return (
                <View
                  key={faq.question}
                  style={index < FAQS.length - 1 ? { borderBottomWidth: 1, borderBottomColor: colors.border } : undefined}
                >
                  <Pressable
                    onPress={() => setOpenFaq(isOpen ? null : index)}
                    style={({ pressed }) => [styles.faqRow, pressed && { opacity: pressedOpacity }]}
                    accessibilityRole="button"
                  >
                    <View style={[styles.faqIcon, { backgroundColor: colors.accentSoft }]}>
                      <Ionicons name={faq.icon} size={16} color={colors.accent} />
                    </View>
                    <Text style={[styles.faqQuestion, { color: colors.textPrimary }]}>{faq.question}</Text>
                    <Ionicons name={isOpen ? "chevron-up" : "chevron-down"} size={18} color={colors.textMuted} />
                  </Pressable>
                  {isOpen ? (
                    <Text style={[styles.faqAnswer, { color: colors.textSecondary }]}>{faq.answer}</Text>
                  ) : null}
                </View>
              );
            })}
          </View>
        </View>

        <Pressable
          onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}`)}
          style={({ pressed }) => [styles.ctaButton, { backgroundColor: colors.accent }, pressed && { opacity: pressedOpacity }]}
          accessibilityRole="button"
          accessibilityLabel="Contact support"
        >
          <Text style={[styles.ctaButtonText, { color: colors.accentOn }]}>Still need help? Contact support</Text>
          <Ionicons name="arrow-forward" size={16} color={colors.accentOn} />
        </Pressable>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 20, paddingTop: 6, paddingBottom: 60, gap: 20 },
  hero: {
    borderRadius: 24,
    paddingHorizontal: 22,
    paddingVertical: 26,
    alignItems: "center",
    overflow: "hidden",
  },
  heroGlowLarge: {
    position: "absolute",
    width: 150,
    height: 150,
    borderRadius: 75,
    right: -50,
    top: -60,
    backgroundColor: "#FFFFFF",
    opacity: 0.1,
  },
  heroGlowSmall: {
    position: "absolute",
    width: 64,
    height: 64,
    borderRadius: 32,
    left: -20,
    bottom: -24,
    backgroundColor: "#FFFFFF",
    opacity: 0.1,
  },
  heroIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
    zIndex: 2,
  },
  heroTitle: { color: "#FFFFFF", fontSize: 22, fontWeight: "800", letterSpacing: -0.4, zIndex: 2 },
  heroSubtitle: {
    marginTop: 8,
    color: "rgba(255,255,255,0.85)",
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center",
    maxWidth: "88%",
    zIndex: 2,
  },
  contactCard: {
    ...softCardShadow,
    flexDirection: "row",
    alignItems: "stretch",
    borderRadius: 20,
  },
  contactTile: { flex: 1, alignItems: "center", paddingVertical: 18, paddingHorizontal: 8, gap: 6 },
  contactDivider: { width: 1, alignSelf: "stretch", marginVertical: 14 },
  contactIcon: { width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  contactLabel: { fontSize: 13.5, fontWeight: "800" },
  contactValue: { fontSize: 11, fontWeight: "500" },
  section: { gap: 10 },
  sectionTitle: { fontSize: 15, fontWeight: "800", paddingLeft: 4 },
  faqCard: { borderRadius: 18, borderWidth: 1, overflow: "hidden" },
  faqRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingVertical: 14 },
  faqIcon: { width: 32, height: 32, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  faqQuestion: { flex: 1, fontSize: 13.5, fontWeight: "700", lineHeight: 18 },
  faqAnswer: { paddingHorizontal: 14, paddingBottom: 14, paddingLeft: 58, fontSize: 12.5, lineHeight: 18 },
  ctaButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 14,
    paddingVertical: 15,
  },
  ctaButtonText: { fontSize: 13.5, fontWeight: "800" },
});
