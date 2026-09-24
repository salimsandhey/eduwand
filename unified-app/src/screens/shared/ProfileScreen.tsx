import { ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, Animated, Easing, Image, ScrollView, StyleSheet, Text, TextInput, Pressable, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../theme/ThemeContext";
import { Screen } from "../../components/Screen";
import { SheetModal } from "../../components/SheetModal";
import { ProfilePhotoPicker, PickedPhoto } from "../../components/ProfilePhotoPicker";
import { useKeyboardOverlap } from "../../hooks/useKeyboardOverlap";
import { api } from "../../api/client";
import { avatarSetForRole, avatarSourceFor, resolveUserImageSource, userImageFillsFrame } from "../../theme/avatars";
import { describeMissingProfileItems, getProfileCompletion } from "../../utils/profileCompletion";

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
    deleteAccount,
  } = useAuth();
  const { colors, cardShadow, pressedOpacity } = useTheme();
  const navigation = useNavigation<any>();
  // The container sits inside <Screen edges={["bottom"]}>, above the navigation bar.
  const keyboard = useKeyboardOverlap({ bottomInset: useSafeAreaInsets().bottom });

  const [fullName, setFullName] = useState(user?.fullName ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  const [showPhotoSheet, setShowPhotoSheet] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoVersion, setPhotoVersion] = useState(0);
  const [photoErr, setPhotoErr] = useState<string | null>(null);

  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordMsg, setPasswordMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  // The form stays mounted and its height eases between 0 and its measured
  // height, so it opens and closes smoothly instead of popping in and out.
  const passwordProgress = useRef(new Animated.Value(0)).current;
  const [passwordFormHeight, setPasswordFormHeight] = useState(0);

  useEffect(() => {
    Animated.timing(passwordProgress, {
      toValue: showPasswordForm ? 1 : 0,
      duration: showPasswordForm ? 300 : 240,
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: false,
    }).start(({ finished }) => {
      // Clear only once it's fully closed, so the fields don't visibly empty mid-collapse.
      if (finished && !showPasswordForm) {
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
      }
    });
  }, [showPasswordForm, passwordProgress]);

  const [showDeleteForm, setShowDeleteForm] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [showDeletePassword, setShowDeletePassword] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [deleteErr, setDeleteErr] = useState<string | null>(null);

  const avatarSet = avatarSetForRole(user?.role);

  const profileCompletion = user ? getProfileCompletion(user) : null;
  // Shown while incomplete. Captured once on open so that finishing the
  // profile during this visit shows the "complete" state instead of the
  // line vanishing out from under the user mid-edit.
  const [showCompletion] = useState(() => !!profileCompletion && profileCompletion.percent < 100);

  const photoValue: PickedPhoto = useMemo(() => {
    if (!user) return { type: "none" };
    if (user.photoMimeType && accessToken) {
      return { type: "remote", uri: `${api.myPhotoUrl(accessToken)}&v=${photoVersion}` };
    }
    // A saved key from another set (a teacher still on an old default icon)
    // shows as "nothing picked", so the teacher only ever sees their own set.
    if (user.avatarKey && avatarSourceFor(user.avatarKey, avatarSet)) return { type: "avatar", avatarKey: user.avatarKey };
    return { type: "none" };
  }, [user, accessToken, photoVersion, avatarSet]);

  if (!user) return null;

  if (user.role === "student") {
    return (
      <Screen edges={["bottom"]}>
        <View style={styles.center}>
          <Text style={[styles.centerText, { color: colors.textMuted }]}>
            Profile editing isn't available for student accounts.
          </Text>
        </View>
      </Screen>
    );
  }

  const avatarSource = resolveUserImageSource({
    id: user.id,
    fullName: user.fullName,
    role: user.role,
    avatarKey: user.avatarKey,
    hasPhoto: !!user.photoMimeType,
    photoUrl: accessToken ? `${api.myPhotoUrl(accessToken)}&v=${photoVersion}` : null,
  });
  const avatarFills = userImageFillsFrame(user);
  const profileDirty = fullName.trim() !== (user.fullName ?? "") || phone.trim() !== (user.phone ?? "");
  const canChangePassword = !!currentPassword && !!newPassword && !!confirmPassword && !savingPassword;
  const isIndividualTeacher = user.role === "teacher" && user.accountType === "individual";

  async function handleSaveProfile() {
    setProfileMsg(null);
    if (fullName.trim().length < 2) {
      setProfileMsg({ tone: "err", text: "Name must be at least 2 characters" });
      return;
    }
    setSavingProfile(true);
    try {
      await updateProfile({ fullName: fullName.trim(), phone: phone.trim() || null });
      setProfileMsg({ tone: "ok", text: "Changes saved" });
    } catch (err) {
      setProfileMsg({ tone: "err", text: err instanceof Error ? err.message : "Could not save profile" });
    } finally {
      setSavingProfile(false);
    }
  }

  async function handlePhotoChange(next: PickedPhoto) {
    setShowPhotoSheet(false);
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

  function closePasswordForm() {
    setShowPasswordForm(false);
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
      closePasswordForm();
      setPasswordMsg({ tone: "ok", text: "Password updated" });
    } catch (err) {
      setPasswordMsg({ tone: "err", text: err instanceof Error ? err.message : "Could not change password" });
    } finally {
      setSavingPassword(false);
    }
  }

  function confirmDeleteAccount() {
    if (!deletePassword) {
      setDeleteErr("Enter your password to confirm");
      return;
    }
    setDeleteErr(null);
    Alert.alert(
      "Delete your account?",
      "This permanently removes your login and personal details from EduWand. This can't be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete account",
          style: "destructive",
          onPress: async () => {
            setDeletingAccount(true);
            try {
              await deleteAccount(deletePassword);
            } catch (err) {
              setDeleteErr(err instanceof Error ? err.message : "Could not delete account");
              setDeletingAccount(false);
            }
          },
        },
      ]
    );
  }

  const inputStyle = [
    styles.input,
    { backgroundColor: colors.surfaceRaised, borderColor: colors.border, color: colors.textPrimary },
  ];

  return (
    <Screen edges={["bottom"]}>
      <View
        ref={keyboard.ref}
        onLayout={keyboard.onLayout}
        collapsable={false}
        style={[styles.flex, { paddingBottom: keyboard.keyboardVisible ? keyboard.overlap : 0 }]}
      >
        <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <Pressable
              onPress={() => setShowPhotoSheet(true)}
              disabled={photoBusy}
              style={({ pressed }) => [styles.avatarButton, pressed && { opacity: pressedOpacity }]}
              accessibilityRole="button"
              accessibilityLabel="Change profile photo"
            >
              <View style={[styles.avatar, { backgroundColor: colors.surfaceRaised }]}>
                {photoBusy ? (
                  <ActivityIndicator color={colors.accent} />
                ) : (
                  <Image source={avatarSource} style={avatarFills ? styles.avatarFill : styles.avatarIcon} resizeMode={avatarFills ? "cover" : "contain"} />
                )}
              </View>
              <View style={[styles.avatarBadge, { backgroundColor: colors.accent, borderColor: colors.background }]}>
                <Ionicons name="camera" size={14} color={colors.accentOn} />
              </View>
            </Pressable>
            <Text style={[styles.name, { color: colors.textPrimary }]} numberOfLines={1}>{user.fullName}</Text>
            <Text style={[styles.role, { color: colors.textMuted }]}>{formatRole(user.role)}</Text>
            {photoErr ? <Text style={[styles.msg, { color: colors.danger }]}>{photoErr}</Text> : null}
          </View>

          {showCompletion && profileCompletion ? (
            <View style={styles.completion}>
              <View style={styles.completionRow}>
                <Text style={[styles.completionText, { color: colors.textSecondary }]}>
                  {profileCompletion.percent >= 100
                    ? "Your profile is complete"
                    : `${describeMissingProfileItems(profileCompletion.missing)} to complete your profile`}
                </Text>
                <Text style={[styles.completionPercent, { color: colors.accent }]}>{profileCompletion.percent}%</Text>
              </View>
              <View style={[styles.track, { backgroundColor: colors.backgroundMuted }]}>
                <View style={[styles.fill, { backgroundColor: colors.accent, width: `${profileCompletion.percent}%` }]} />
              </View>
            </View>
          ) : null}

          <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>Personal details</Text>
          <View style={[styles.card, { backgroundColor: colors.surface }, cardShadow]}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Full name</Text>
            <TextInput
              style={inputStyle}
              value={fullName}
              onChangeText={setFullName}
              placeholder="Your name"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="words"
            />

            <Text style={[styles.label, styles.labelSpaced, { color: colors.textSecondary }]}>Phone</Text>
            <TextInput
              style={inputStyle}
              value={phone}
              onChangeText={setPhone}
              placeholder="Add your phone number"
              placeholderTextColor={colors.textMuted}
              keyboardType="phone-pad"
            />

            <Text style={[styles.label, styles.labelSpaced, { color: colors.textSecondary }]}>Email</Text>
            <Text style={[styles.readOnly, { color: colors.textPrimary }]} numberOfLines={1}>{user.email}</Text>
            <Text style={[styles.helper, { color: colors.textMuted }]}>Only your school admin can change this.</Text>

            {profileMsg ? (
              <Text style={[styles.msg, { color: profileMsg.tone === "ok" ? colors.accent : colors.danger }]}>{profileMsg.text}</Text>
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
              {savingProfile ? <ActivityIndicator color={colors.accentOn} /> : <Text style={[styles.buttonText, { color: colors.accentOn }]}>Save changes</Text>}
            </Pressable>
          </View>

          <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>{isIndividualTeacher ? "Security & settings" : "Security"}</Text>
          <View style={[styles.card, styles.listCard, { backgroundColor: colors.surface }, cardShadow]}>
            <SettingsRow
              icon="lock-closed-outline"
              title="Change password"
              expanded={showPasswordForm}
              onPress={() => {
                setPasswordMsg(null);
                if (showPasswordForm) closePasswordForm();
                else setShowPasswordForm(true);
              }}
            >
              {passwordMsg && !showPasswordForm ? (
                <Text style={[styles.rowMsg, { color: passwordMsg.tone === "ok" ? colors.accent : colors.danger }]}>{passwordMsg.text}</Text>
              ) : null}
            </SettingsRow>

            <Animated.View
              style={{
                height: passwordProgress.interpolate({ inputRange: [0, 1], outputRange: [0, passwordFormHeight] }),
                opacity: passwordProgress.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 0.3, 1] }),
                overflow: "hidden",
              }}
              pointerEvents={showPasswordForm ? "auto" : "none"}
              importantForAccessibility={showPasswordForm ? "auto" : "no-hide-descendants"}
              accessibilityElementsHidden={!showPasswordForm}
            >
              <Animated.View
                style={[styles.rowBody, { transform: [{ translateY: passwordProgress.interpolate({ inputRange: [0, 1], outputRange: [-8, 0] }) }] }]}
                onLayout={(e) => setPasswordFormHeight(Math.ceil(e.nativeEvent.layout.height))}
              >
                <Text style={[styles.label, { color: colors.textSecondary }]}>Current password</Text>
                <PasswordField value={currentPassword} onChangeText={setCurrentPassword} visible={showCurrentPassword} onToggleVisibility={() => setShowCurrentPassword((v) => !v)} placeholder="••••••••" inputStyle={inputStyle} />

                <Text style={[styles.label, styles.labelSpaced, { color: colors.textSecondary }]}>New password</Text>
                <PasswordField value={newPassword} onChangeText={setNewPassword} visible={showNewPassword} onToggleVisibility={() => setShowNewPassword((v) => !v)} placeholder="At least 8 characters" inputStyle={inputStyle} />

                <Text style={[styles.label, styles.labelSpaced, { color: colors.textSecondary }]}>Confirm new password</Text>
                <PasswordField value={confirmPassword} onChangeText={setConfirmPassword} visible={showConfirmPassword} onToggleVisibility={() => setShowConfirmPassword((v) => !v)} placeholder="Re-enter new password" inputStyle={inputStyle} />

                {passwordMsg ? (
                  <Text style={[styles.msg, { color: passwordMsg.tone === "ok" ? colors.accent : colors.danger }]}>{passwordMsg.text}</Text>
                ) : null}

                <Pressable
                  onPress={handleChangePassword}
                  disabled={!canChangePassword}
                  style={({ pressed }) => [styles.button, { backgroundColor: colors.accent }, !canChangePassword && styles.buttonDisabled, pressed && { opacity: pressedOpacity }]}
                  accessibilityRole="button"
                >
                  {savingPassword ? <ActivityIndicator color={colors.accentOn} /> : <Text style={[styles.buttonText, { color: colors.accentOn }]}>Update password</Text>}
                </Pressable>
              </Animated.View>
            </Animated.View>

            {isIndividualTeacher ? (
              <View style={[styles.rowDivider, { borderTopColor: colors.border }]}>
                <SettingsRow icon="options-outline" title="School branding" caption="Logo and colors on your slides and reports" onPress={() => navigation.navigate("FormatTemplate")} />
              </View>
            ) : null}
          </View>

          <View style={styles.dangerZone}>
            {!showDeleteForm ? (
              <Pressable
                onPress={() => setShowDeleteForm(true)}
                style={({ pressed }) => [styles.deleteLink, pressed && { opacity: pressedOpacity }]}
                accessibilityRole="button"
              >
                <Text style={[styles.deleteLinkText, { color: colors.danger }]}>Delete account</Text>
              </Pressable>
            ) : (
              <View style={[styles.card, { backgroundColor: colors.surface }, cardShadow]}>
                <Text style={[styles.deleteTitle, { color: colors.danger }]}>Delete account</Text>
                <Text style={[styles.helper, styles.deleteText, { color: colors.textMuted }]}>
                  This permanently removes your login and personal details. Enter your password to confirm.
                </Text>
                <PasswordField
                  value={deletePassword}
                  onChangeText={setDeletePassword}
                  visible={showDeletePassword}
                  onToggleVisibility={() => setShowDeletePassword((v) => !v)}
                  placeholder="Your password"
                  inputStyle={inputStyle}
                />

                {deleteErr ? <Text style={[styles.msg, { color: colors.danger }]}>{deleteErr}</Text> : null}

                <Pressable
                  onPress={confirmDeleteAccount}
                  disabled={deletingAccount || !deletePassword}
                  style={({ pressed }) => [
                    styles.button,
                    { backgroundColor: colors.danger },
                    (deletingAccount || !deletePassword) && styles.buttonDisabled,
                    pressed && { opacity: pressedOpacity },
                  ]}
                  accessibilityRole="button"
                >
                  {deletingAccount ? <ActivityIndicator color="#FFFFFF" /> : <Text style={[styles.buttonText, { color: "#FFFFFF" }]}>Permanently delete account</Text>}
                </Pressable>

                <Pressable
                  onPress={() => {
                    setShowDeleteForm(false);
                    setDeletePassword("");
                    setDeleteErr(null);
                  }}
                  disabled={deletingAccount}
                  style={styles.cancelButton}
                  accessibilityRole="button"
                >
                  <Text style={[styles.cancelText, { color: colors.textMuted }]}>Cancel</Text>
                </Pressable>
              </View>
            )}
          </View>
        </ScrollView>
      </View>

      <SheetModal visible={showPhotoSheet} onClose={() => setShowPhotoSheet(false)} closeLabel="Close photo options">
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.sheetContent}>
          <ProfilePhotoPicker value={photoValue} onChange={handlePhotoChange} avatarSet={avatarSet} />
        </ScrollView>
      </SheetModal>
    </Screen>
  );
}

function SettingsRow({
  icon,
  title,
  caption,
  expanded,
  onPress,
  children,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  caption?: string;
  expanded?: boolean;
  onPress: () => void;
  children?: ReactNode;
}) {
  const { colors, pressedOpacity } = useTheme();
  const isToggle = expanded !== undefined;
  const rotation = useRef(new Animated.Value(expanded ? 1 : 0)).current;

  useEffect(() => {
    if (!isToggle) return;
    Animated.timing(rotation, {
      toValue: expanded ? 1 : 0,
      duration: 260,
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [expanded, isToggle, rotation]);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.settingsRow, pressed && { opacity: pressedOpacity }]}
      accessibilityRole="button"
      accessibilityState={expanded === undefined ? undefined : { expanded }}
    >
      <Ionicons name={icon} size={19} color={colors.textMuted} />
      <View style={styles.flex}>
        <Text style={[styles.rowTitle, { color: colors.textPrimary }]}>{title}</Text>
        {caption ? <Text style={[styles.helper, { color: colors.textMuted }]}>{caption}</Text> : null}
        {children}
      </View>
      {isToggle ? (
        <Animated.View style={{ transform: [{ rotate: rotation.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "180deg"] }) }] }}>
          <Ionicons name="chevron-down" size={18} color={colors.textMuted} />
        </Animated.View>
      ) : (
        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
      )}
    </Pressable>
  );
}

function PasswordField({ value, onChangeText, visible, onToggleVisibility, placeholder, inputStyle }: { value: string; onChangeText: (value: string) => void; visible: boolean; onToggleVisibility: () => void; placeholder: string; inputStyle: any }) {
  const { colors, pressedOpacity } = useTheme();
  return <View style={styles.passwordField}><TextInput style={[inputStyle, styles.passwordInput]} value={value} onChangeText={onChangeText} secureTextEntry={!visible} placeholder={placeholder} placeholderTextColor={colors.textMuted} autoCapitalize="none" autoCorrect={false} /><Pressable style={({ pressed }) => [styles.passwordToggle, pressed && { opacity: pressedOpacity }]} onPress={onToggleVisibility} hitSlop={8} accessibilityRole="button" accessibilityLabel={visible ? "Hide password" : "Show password"}><Ionicons name={visible ? "eye-off-outline" : "eye-outline"} size={19} color={colors.textMuted} /></Pressable></View>;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { padding: 20, paddingBottom: 32, flexGrow: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32 },
  centerText: { fontSize: 14, textAlign: "center", fontWeight: "500" },
  header: { alignItems: "center", paddingTop: 4, paddingBottom: 8 },
  avatarButton: { position: "relative" },
  avatar: { width: 96, height: 96, borderRadius: 48, overflow: "hidden", alignItems: "center", justifyContent: "center" },
  avatarFill: { width: "100%", height: "100%" },
  avatarIcon: { width: 60, height: 60 },
  avatarBadge: { position: "absolute", right: 0, bottom: 2, width: 30, height: 30, borderRadius: 15, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  name: { marginTop: 12, fontSize: 19, fontWeight: "800", letterSpacing: -0.3 },
  role: { marginTop: 2, fontSize: 13, fontWeight: "500" },
  completion: { marginTop: 16 },
  completionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  completionText: { flex: 1, fontSize: 12, fontWeight: "600" },
  completionPercent: { fontSize: 13, fontWeight: "800" },
  track: { height: 5, borderRadius: 3, overflow: "hidden", marginTop: 8 },
  fill: { height: "100%", borderRadius: 3 },
  sectionTitle: { marginTop: 24, marginBottom: 8, marginLeft: 4, fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.4 },
  card: { borderRadius: 20, padding: 16 },
  listCard: { paddingVertical: 4 },
  label: { fontSize: 12, fontWeight: "700", marginBottom: 6 },
  labelSpaced: { marginTop: 14 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, height: 44, fontSize: 14 },
  readOnly: { fontSize: 14, fontWeight: "600" },
  helper: { marginTop: 2, fontSize: 11, lineHeight: 15, fontWeight: "500" },
  passwordField: { position: "relative" },
  passwordInput: { paddingRight: 46 },
  passwordToggle: { position: "absolute", width: 44, height: 44, right: 0, top: 0, alignItems: "center", justifyContent: "center" },
  msg: { fontSize: 12, fontWeight: "600", marginTop: 12 },
  rowMsg: { fontSize: 11, fontWeight: "600", marginTop: 2 },
  button: { height: 46, borderRadius: 12, alignItems: "center", justifyContent: "center", marginTop: 16 },
  buttonDisabled: { opacity: 0.45 },
  buttonText: { fontSize: 14, fontWeight: "800" },
  settingsRow: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 52, paddingVertical: 10 },
  rowTitle: { fontSize: 14, fontWeight: "700" },
  rowBody: { paddingBottom: 14 },
  rowDivider: { borderTopWidth: StyleSheet.hairlineWidth },
  dangerZone: { marginTop: 24 },
  deleteLink: { alignSelf: "center", paddingVertical: 10, paddingHorizontal: 16 },
  deleteLinkText: { fontSize: 13, fontWeight: "700" },
  deleteTitle: { fontSize: 15, fontWeight: "800" },
  deleteText: { marginTop: 4, marginBottom: 12 },
  cancelButton: { alignItems: "center", marginTop: 12 },
  cancelText: { fontSize: 13, fontWeight: "600" },
  sheetContent: { paddingTop: 4, paddingBottom: 8 },
});
