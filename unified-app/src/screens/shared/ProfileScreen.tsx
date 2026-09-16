import { useMemo, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, Pressable, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useNavigation } from "@react-navigation/native";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../theme/ThemeContext";
import { Screen } from "../../components/Screen";
import { ProfilePhotoPicker, PickedPhoto } from "../../components/ProfilePhotoPicker";
import { api } from "../../api/client";

function formatRole(role: string) {
  return role.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

export function ProfileScreen() {
  const {
    user,
    accessToken,
    updateProfile,
    changePassword,
    uploadProfilePhoto,
    setProfileAvatar,
    removeProfilePhoto,
  } = useAuth();
  const { colors, pressedOpacity } = useTheme();
  const navigation = useNavigation<any>();

  const [fullName, setFullName] = useState(user?.fullName ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoVersion, setPhotoVersion] = useState(0);
  const [photoErr, setPhotoErr] = useState<string | null>(null);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordMsg, setPasswordMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  const photoValue: PickedPhoto = useMemo(() => {
    if (!user) return { type: "none" };
    if (user.photoMimeType && accessToken) {
      return { type: "remote", uri: `${api.myPhotoUrl(accessToken)}&v=${photoVersion}` };
    }
    if (user.avatarKey) return { type: "avatar", avatarKey: user.avatarKey };
    return { type: "none" };
  }, [user, accessToken, photoVersion]);

  if (!user) return null;

  if (user.role === "student") {
    return (
      <Screen>
        <View style={styles.center}>
          <Text style={[styles.centerText, { color: colors.textMuted }]}>
            Profile editing isn't available for student accounts.
          </Text>
        </View>
      </Screen>
    );
  }

  const profileDirty = fullName.trim() !== (user.fullName ?? "") || phone.trim() !== (user.phone ?? "");

  async function handleSaveProfile() {
    setProfileMsg(null);
    if (fullName.trim().length < 2) {
      setProfileMsg({ tone: "err", text: "Name must be at least 2 characters" });
      return;
    }
    setSavingProfile(true);
    try {
      await updateProfile({ fullName: fullName.trim(), phone: phone.trim() || null });
      setProfileMsg({ tone: "ok", text: "Profile updated" });
    } catch (err) {
      setProfileMsg({ tone: "err", text: err instanceof Error ? err.message : "Could not save profile" });
    } finally {
      setSavingProfile(false);
    }
  }

  async function handlePhotoChange(next: PickedPhoto) {
    setPhotoErr(null);
    setPhotoBusy(true);
    try {
      if (next.type === "photo") {
        await uploadProfilePhoto({ uri: next.uri, name: next.name, mimeType: next.mimeType });
      } else if (next.type === "avatar") {
        await setProfileAvatar(next.avatarKey);
      } else if (next.type === "none") {
        if (user!.photoMimeType || user!.avatarKey) await removeProfilePhoto();
      }
      setPhotoVersion((v) => v + 1);
    } catch (err) {
      setPhotoErr(err instanceof Error ? err.message : "Could not update photo");
    } finally {
      setPhotoBusy(false);
    }
  }

  async function handleChangePassword() {
    setPasswordMsg(null);
    if (newPassword.length < 8) {
      setPasswordMsg({ tone: "err", text: "New password must be at least 8 characters" });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordMsg({ tone: "err", text: "New passwords do not match" });
      return;
    }
    setSavingPassword(true);
    try {
      await changePassword(currentPassword, newPassword);
      setPasswordMsg({ tone: "ok", text: "Password updated" });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setPasswordMsg({ tone: "err", text: err instanceof Error ? err.message : "Could not change password" });
    } finally {
      setSavingPassword(false);
    }
  }

  const inputStyle = [
    styles.input,
    { backgroundColor: colors.surfaceRaised, borderColor: colors.border, color: colors.textPrimary },
  ];

  return (
    <Screen edges={["bottom"]}>
      <KeyboardAvoidingView style={styles.keyboardContainer} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" keyboardDismissMode="none">
        <LinearGradient colors={[colors.surface, colors.surfaceAccent]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.profileHero, { borderWidth: 1, borderColor: colors.border }]}>
          <View style={[styles.heroGlow, { backgroundColor: colors.accentSoft }]} />
          <View style={[styles.heroGlow, styles.heroGlowSecondary, { backgroundColor: colors.accentSoft }]} />

          <View style={styles.heroTopRow}>
            <View style={styles.heroTopText}>
              <Text style={[styles.heroEyebrow, { color: colors.accent }]}>ACCOUNT</Text>
              <Text style={[styles.heroTitle, { color: colors.textPrimary }]}>Edit Profile</Text>
              <Text style={[styles.heroSubtitle, { color: colors.textMuted }]}>Manage your photo, details, and security.</Text>
            </View>
            <View style={[styles.heroRoleChip, { backgroundColor: colors.accentSoft }]}>
              <Ionicons name="shield-checkmark-outline" size={11} color={colors.accent} />
              <Text style={[styles.heroRoleChipText, { color: colors.accent }]}>{formatRole(user.role)}</Text>
            </View>
          </View>

          <View style={[styles.photoPickerWrap, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}><ProfilePhotoPicker value={photoValue} onChange={handlePhotoChange} /></View>
          {photoBusy ? <ActivityIndicator color={colors.accent} style={{ marginTop: 10 }} /> : null}
          {photoErr ? <Text style={[styles.msg, { color: colors.danger }]}>{photoErr}</Text> : null}
        </LinearGradient>

        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.sectionHeading}><View style={[styles.sectionIcon, { backgroundColor: colors.accentSoft }]}><Ionicons name="person-outline" size={17} color={colors.accent} /></View><View><Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Personal details</Text><Text style={[styles.cardCaption, { color: colors.textMuted }]}>Keep your contact information up to date.</Text></View></View>

          <Text style={[styles.label, { color: colors.textSecondary }]}>Full name</Text>
          <TextInput
            style={inputStyle}
            value={fullName}
            onChangeText={setFullName}
            placeholder="Your name"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="words"
          />

          <Text style={[styles.label, { color: colors.textSecondary, marginTop: 12 }]}>Phone</Text>
          <TextInput
            style={inputStyle}
            value={phone}
            onChangeText={setPhone}
            placeholder="Optional"
            placeholderTextColor={colors.textMuted}
            keyboardType="phone-pad"
          />

          {profileMsg ? (
            <Text style={[styles.msg, { color: profileMsg.tone === "ok" ? colors.accent : colors.danger }]}>
              {profileMsg.text}
            </Text>
          ) : null}

          <Pressable
            onPress={handleSaveProfile}
            disabled={!profileDirty || savingProfile}
            style={({ pressed }) => [
              styles.button,
              { backgroundColor: colors.accent },
              (!profileDirty || savingProfile) && styles.buttonDisabled,
              pressed && { opacity: pressedOpacity },
            ]}
            accessibilityRole="button"
          >
            {savingProfile ? (
              <ActivityIndicator color={colors.accentOn} />
            ) : (
              <Text style={[styles.buttonText, { color: colors.accentOn }]}>Save changes</Text>
            )}
          </Pressable>
        </View>

        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.sectionHeading}><View style={[styles.sectionIcon, { backgroundColor: colors.accentSoft }]}><Ionicons name="shield-checkmark-outline" size={17} color={colors.accent} /></View><View><Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Account</Text><Text style={[styles.cardCaption, { color: colors.textMuted }]}>Managed by your school administrator.</Text></View></View>
          <ReadOnlyRow label="Email" value={user.email} colors={colors} />
          <ReadOnlyRow label="Role" value={formatRole(user.role)} colors={colors} />
          <ReadOnlyRow label="Status" value={formatRole(user.status)} colors={colors} last />
        </View>

        {user.role === "teacher" && user.accountType === "individual" ? (
          <Pressable
            style={({ pressed }) => [styles.card, styles.linkCard, { backgroundColor: colors.surface, borderColor: colors.border }, pressed && { opacity: pressedOpacity }]}
            onPress={() => navigation.navigate("FormatTemplate")}
            accessibilityRole="button"
          >
            <View style={[styles.sectionHeading, { marginBottom: 0, flex: 1 }]}><View style={[styles.sectionIcon, { backgroundColor: colors.accentSoft }]}><Ionicons name="options-outline" size={17} color={colors.accent} /></View><View style={{ flex: 1 }}><Text style={[styles.cardTitle, { color: colors.textPrimary }]}>School branding</Text><Text style={[styles.cardCaption, { color: colors.textMuted }]}>Logo, colors, and formatting used across your reports.</Text></View></View>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </Pressable>
        ) : null}

        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.sectionHeading}><View style={[styles.sectionIcon, { backgroundColor: colors.accentSoft }]}><Ionicons name="lock-closed-outline" size={17} color={colors.accent} /></View><View><Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Security</Text><Text style={[styles.cardCaption, { color: colors.textMuted }]}>Choose a strong password you do not reuse.</Text></View></View>

          <Text style={[styles.label, { color: colors.textSecondary }]}>Current password</Text>
          <PasswordField value={currentPassword} onChangeText={setCurrentPassword} visible={showCurrentPassword} onToggleVisibility={() => setShowCurrentPassword((visible) => !visible)} placeholder="••••••••" inputStyle={inputStyle} />

          <Text style={[styles.label, { color: colors.textSecondary, marginTop: 12 }]}>New password</Text>
          <PasswordField value={newPassword} onChangeText={setNewPassword} visible={showNewPassword} onToggleVisibility={() => setShowNewPassword((visible) => !visible)} placeholder="At least 8 characters" inputStyle={inputStyle} />

          <Text style={[styles.label, { color: colors.textSecondary, marginTop: 12 }]}>Confirm new password</Text>
          <PasswordField value={confirmPassword} onChangeText={setConfirmPassword} visible={showConfirmPassword} onToggleVisibility={() => setShowConfirmPassword((visible) => !visible)} placeholder="Re-enter new password" inputStyle={inputStyle} />

          {passwordMsg ? (
            <Text style={[styles.msg, { color: passwordMsg.tone === "ok" ? colors.accent : colors.danger }]}>
              {passwordMsg.text}
            </Text>
          ) : null}

          <Pressable
            onPress={handleChangePassword}
            disabled={!currentPassword || !newPassword || !confirmPassword || savingPassword}
            style={({ pressed }) => [
              styles.button,
              { backgroundColor: colors.accent },
              (!currentPassword || !newPassword || !confirmPassword || savingPassword) && styles.buttonDisabled,
              pressed && { opacity: pressedOpacity },
            ]}
            accessibilityRole="button"
          >
            {savingPassword ? (
              <ActivityIndicator color={colors.accentOn} />
            ) : (
              <Text style={[styles.buttonText, { color: colors.accentOn }]}>Change password</Text>
            )}
          </Pressable>
        </View>
      </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function PasswordField({ value, onChangeText, visible, onToggleVisibility, placeholder, inputStyle }: { value: string; onChangeText: (value: string) => void; visible: boolean; onToggleVisibility: () => void; placeholder: string; inputStyle: any }) {
  const { colors, pressedOpacity } = useTheme();
  return <View style={styles.passwordField}><TextInput style={[inputStyle, styles.passwordInput]} value={value} onChangeText={onChangeText} secureTextEntry={!visible} placeholder={placeholder} placeholderTextColor={colors.textMuted} autoCapitalize="none" autoCorrect={false} /><Pressable style={({ pressed }) => [styles.passwordToggle, pressed && { opacity: pressedOpacity }]} onPress={onToggleVisibility} hitSlop={8} accessibilityRole="button" accessibilityLabel={visible ? "Hide password" : "Show password"}><Ionicons name={visible ? "eye-off-outline" : "eye-outline"} size={19} color={colors.textMuted} /></Pressable></View>;
}

function ReadOnlyRow({
  label,
  value,
  colors,
  last,
}: {
  label: string;
  value: string;
  colors: ReturnType<typeof useTheme>["colors"];
  last?: boolean;
}) {
  return (
    <View style={[styles.roRow, !last && { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth }]}>
      <Text style={[styles.roLabel, { color: colors.textMuted }]}>{label}</Text>
      <Text style={[styles.roValue, { color: colors.textPrimary }]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  keyboardContainer: { flex: 1 },
  container: { padding: 20, paddingBottom: 164, gap: 16, flexGrow: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32 },
  centerText: { fontSize: 14, textAlign: "center", fontWeight: "500" },
  profileHero: { minHeight: 232, borderRadius: 22, padding: 18, overflow: "hidden" },
  heroGlow: { position: "absolute", width: 190, height: 190, borderRadius: 95, right: -55, top: -72, opacity: 0.7 },
  heroGlowSecondary: { width: 150, height: 150, borderRadius: 75, right: undefined, left: -60, top: undefined, bottom: -70, opacity: 0.5 },
  heroTopRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 },
  heroTopText: { flex: 1 },
  heroEyebrow: { fontSize: 10, fontWeight: "800", letterSpacing: 1.1 },
  heroTitle: { marginTop: 3, fontSize: 27, lineHeight: 33, fontWeight: "800", letterSpacing: -0.7 },
  heroSubtitle: { marginTop: 3, fontSize: 12, lineHeight: 17, fontWeight: "500" },
  heroRoleChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#FFFFFF",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexShrink: 0,
  },
  heroRoleChipText: { fontSize: 10, fontWeight: "800" },
  photoPickerWrap: { marginTop: 18, borderRadius: 18, padding: 14, borderWidth: 1 },
  card: { borderWidth: 1, borderRadius: 20, padding: 16 },
  linkCard: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sectionHeading: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 16 }, sectionIcon: { width: 34, height: 34, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  cardTitle: {
    fontSize: 15,
    fontWeight: "800",
  },
  cardCaption: { marginTop: 2, fontSize: 11, lineHeight: 15, fontWeight: "500" },
  label: { fontSize: 12, fontWeight: "700", marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 44,
    fontSize: 14,
  },
  passwordField: { position: "relative" },
  passwordInput: { paddingRight: 46 },
  passwordToggle: { position: "absolute", width: 44, height: 44, right: 0, top: 0, alignItems: "center", justifyContent: "center" },
  msg: { fontSize: 12, fontWeight: "600", marginTop: 12 },
  button: {
    height: 46,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 16,
  },
  buttonDisabled: { opacity: 0.45 },
  buttonText: { fontSize: 14, fontWeight: "800" },
  roRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 16,
    paddingVertical: 11,
  },
  roLabel: { fontSize: 13, fontWeight: "600" },
  roValue: { fontSize: 13, fontWeight: "700", flexShrink: 1, textAlign: "right" },
});
