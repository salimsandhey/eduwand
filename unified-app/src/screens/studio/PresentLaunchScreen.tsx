import { useCallback, useEffect, useState } from "react";
import { View, Text, Pressable, StyleSheet, ActivityIndicator, Share } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { RootStackParamList } from "../../navigation/types";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../theme/ThemeContext";
import { Screen } from "../../components/Screen";
import { api, getPresentControlLink, getPresentDisplayLink } from "../../api/client";
import { usePresentSession } from "../../hooks/usePresentSession";

type Props = NativeStackScreenProps<RootStackParamList, "PresentLaunch">;

// Starts a "present on a screen" session for a quick check and hands the
// teacher two links: one for whatever device is projected for the class
// (Display), one for whatever device the teacher taps answers on (Control) -
// deliberately not the same device, so students never see the teacher
// tapping. See backend/src/routes/present.ts and admin-dashboard's
// PresentDisplayPage/PresentControlPage.
export function PresentLaunchScreen({ route, navigation }: Props) {
  const { assessmentId } = route.params;
  const { accessToken } = useAuth();
  const { colors, cardShadow, pressedOpacity } = useTheme();

  const [code, setCode] = useState<string | null>(null);
  const [controlKey, setControlKey] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { state, ended } = usePresentSession(code);

  const start = useCallback(async () => {
    if (!accessToken) return;
    setIsStarting(true);
    setError(null);
    try {
      const session = await api.startPresentSession(accessToken, assessmentId);
      setCode(session.code);
      setControlKey(session.controlKey);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't start the session");
    } finally {
      setIsStarting(false);
    }
  }, [accessToken, assessmentId]);

  useEffect(() => {
    start();
  }, [start]);

  useEffect(() => {
    if (ended) navigation.replace("AssessmentInsight", { assessmentId });
  }, [ended, navigation, assessmentId]);

  async function finish() {
    if (!accessToken) return;
    try {
      await api.completeAssessment(accessToken, assessmentId);
    } finally {
      navigation.replace("AssessmentInsight", { assessmentId });
    }
  }

  const answeredCount = state?.answeredCount ?? 0;

  return (
    <Screen edges={["top", "bottom"]}>
      <View style={styles.topBar}>
        <Pressable
          style={({ pressed }) => [styles.backButton, { backgroundColor: colors.surface, borderColor: colors.border }, pressed && { opacity: pressedOpacity }]}
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
        </Pressable>
        <Text style={[styles.topTitle, { color: colors.textPrimary }]}>Present on a screen</Text>
      </View>

      {isStarting ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Text style={{ color: colors.danger, textAlign: "center", paddingHorizontal: 24 }}>{error}</Text>
          <Pressable style={[styles.retryButton, { backgroundColor: colors.accent }]} onPress={start}>
            <Text style={{ color: colors.accentOn, fontWeight: "800" }}>Try again</Text>
          </Pressable>
        </View>
      ) : code ? (
        <View style={styles.content}>
          <View style={[styles.codeCard, { backgroundColor: colors.surface, borderWidth: 0 }, cardShadow]}>
            <Text style={[styles.codeLabel, { color: colors.textMuted }]}>Session code</Text>
            <Text style={[styles.codeValue, { color: colors.accent }]}>{code}</Text>
            {state ? (
              <Text style={[styles.liveTicker, { color: colors.textSecondary }]}>
                {answeredCount} of {state.totalStudents} answered · Question {state.currentQuestionIndex + 1} of {state.questions.length}
              </Text>
            ) : null}
          </View>

          <LinkRow
            icon="tv-outline"
            title="Display"
            caption="Open this on the projector or classroom screen the class looks at."
            onShare={() => Share.share({ message: `Project this for the quiz: ${getPresentDisplayLink(code)}` })}
          />
          <LinkRow
            icon="phone-portrait-outline"
            title="Control"
            caption="Open this on your own laptop or phone browser - it's what you tap answers on."
            onShare={() => Share.share({ message: `Tap answers here: ${getPresentControlLink(code, controlKey ?? "")}` })}
          />

          <Text style={[styles.note, { color: colors.textMuted }]}>
            Students never see the Control page - keep it on a device only you're looking at.
          </Text>
        </View>
      ) : null}

      {code ? (
        <View style={styles.footer}>
          <Pressable style={({ pressed }) => [styles.endButton, { backgroundColor: colors.surfaceRaised }, pressed && { opacity: pressedOpacity }]} onPress={finish} accessibilityRole="button">
            <Text style={[styles.endButtonText, { color: colors.textPrimary }]}>End &amp; see results</Text>
          </Pressable>
        </View>
      ) : null}
    </Screen>
  );
}

function LinkRow({ icon, title, caption, onShare }: { icon: keyof typeof Ionicons.glyphMap; title: string; caption: string; onShare: () => void }) {
  const { colors, cardShadow, pressedOpacity } = useTheme();
  return (
    <View style={[styles.linkCard, { backgroundColor: colors.surface, borderWidth: 0 }, cardShadow]}>
      <View style={[styles.linkIcon, { backgroundColor: colors.accentSoft }]}>
        <Ionicons name={icon} size={20} color={colors.accent} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.linkTitle, { color: colors.textPrimary }]}>{title}</Text>
        <Text style={[styles.linkCaption, { color: colors.textMuted }]}>{caption}</Text>
      </View>
      <Pressable style={({ pressed }) => [styles.shareButton, { backgroundColor: colors.accentSoft }, pressed && { opacity: pressedOpacity }]} onPress={onShare} accessibilityRole="button" accessibilityLabel={`Share ${title} link`}>
        <Ionicons name="share-outline" size={18} color={colors.accent} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12, gap: 12 },
  backButton: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  topTitle: { fontSize: 17, fontWeight: "800" },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", gap: 14 },
  retryButton: { paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12 },
  content: { paddingHorizontal: 20, paddingTop: 8, gap: 12 },
  codeCard: { borderRadius: 18, padding: 22, alignItems: "center", gap: 4 },
  codeLabel: { fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.6 },
  codeValue: { fontSize: 40, fontWeight: "800", letterSpacing: 6, marginTop: 4 },
  liveTicker: { fontSize: 13, fontWeight: "600", marginTop: 10 },
  linkCard: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 16, padding: 14 },
  linkIcon: { width: 40, height: 40, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  linkTitle: { fontSize: 15, fontWeight: "800" },
  linkCaption: { fontSize: 12, marginTop: 2, lineHeight: 16 },
  shareButton: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  note: { fontSize: 12, textAlign: "center", marginTop: 4, paddingHorizontal: 8, lineHeight: 17 },
  footer: { paddingHorizontal: 20, paddingBottom: 16, paddingTop: 8 },
  endButton: { height: 50, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  endButtonText: { fontSize: 14, fontWeight: "800" },
});
