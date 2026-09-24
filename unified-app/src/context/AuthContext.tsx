import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import * as SecureStore from "expo-secure-store";
import { api, AuthTokens, CurrentUser, StudentOtpMatch, UpdateProfileInput, setSessionHandlers } from "../api/client";

const ACCESS_TOKEN_KEY = "eduwand_access_token";
const REFRESH_TOKEN_KEY = "eduwand_refresh_token";

async function persistTokens(tokens: AuthTokens) {
  await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, tokens.accessToken);
  await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, tokens.refreshToken);
}

async function clearPersistedTokens() {
  await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY);
  await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
}

interface AuthContextValue {
  user: CurrentUser | null;
  accessToken: string | null;
  isLoading: boolean;
  isRestoring: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;

  signupTeacher: (input: { fullName: string; email: string; password: string; board: string; phone?: string; workspaceName?: string }) => Promise<void>;

  requestStudentOtp: (phone: string) => Promise<string | undefined>;
  verifyStudentOtp: (phone: string, code: string) => Promise<{ students: StudentOtpMatch[]; selectionToken: string }>;
  selectStudent: (studentStubId: string, selectionTokenOverride?: string) => Promise<void>;

  updateProfile: (input: UpdateProfileInput) => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  uploadProfilePhoto: (file: { uri: string; name: string; mimeType: string }) => Promise<void>;
  setProfileAvatar: (avatarKey: string) => Promise<void>;
  removeProfilePhoto: () => Promise<void>;
  markOnboardingTourSeen: () => Promise<void>;
  dismissProfilePrompt: () => Promise<void>;
  deleteAccount: (password: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isRestoring, setIsRestoring] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectionToken, setSelectionToken] = useState<string | null>(null);

  // Registered once so any API call anywhere in the app can silently refresh
  // an expired access token, or force a logout if the refresh token itself
  // is dead - keeps the session alive until the user explicitly logs out.
  useEffect(() => {
    setSessionHandlers({
      getRefreshToken: () => refreshToken,
      onTokensRefreshed: (tokens) => {
        setAccessToken(tokens.accessToken);
        setRefreshToken(tokens.refreshToken);
        persistTokens(tokens).catch(() => {});
      },
      onSessionExpired: () => {
        setUser(null);
        setAccessToken(null);
        setRefreshToken(null);
        clearPersistedTokens().catch(() => {});
      },
    });
    return () => setSessionHandlers(null);
  }, [refreshToken]);

  useEffect(() => {
    (async () => {
      try {
        const [storedAccessToken, storedRefreshToken] = await Promise.all([
          SecureStore.getItemAsync(ACCESS_TOKEN_KEY),
          SecureStore.getItemAsync(REFRESH_TOKEN_KEY),
        ]);
        if (!storedRefreshToken) return;

        setRefreshToken(storedRefreshToken);
        let me = storedAccessToken ? await api.me(storedAccessToken).catch(() => null) : null;

        if (!me) {
          const tokens = await api.refresh(storedRefreshToken);
          setAccessToken(tokens.accessToken);
          setRefreshToken(tokens.refreshToken);
          await persistTokens(tokens);
          me = await api.me(tokens.accessToken);
        } else {
          setAccessToken(storedAccessToken!);
        }

        setUser(me);
      } catch {
        await clearPersistedTokens();
      } finally {
        setIsRestoring(false);
      }
    })();
  }, []);

  async function login(email: string, password: string) {
    setIsLoading(true);
    setError(null);
    try {
      const tokens = await api.login(email, password);
      const me = await api.me(tokens.accessToken);
      setAccessToken(tokens.accessToken);
      setRefreshToken(tokens.refreshToken);
      await persistTokens(tokens);
      setUser(me);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setIsLoading(false);
    }
  }

  // Individual-teacher self-signup - not a login (no existing account to
  // authenticate against), but lands the teacher in the app the same way
  // login/selectStudent do: tokens from the signup response, then /auth/me,
  // then persist + setUser. See Docs/superpowers/plans/2026-09-09-
  // individual-teacher-onboarding-and-credits.md.
  async function signupTeacher(input: { fullName: string; email: string; password: string; board: string; phone?: string; workspaceName?: string }) {
    setIsLoading(true);
    setError(null);
    try {
      const tokens = await api.signupTeacher(input);
      const me = await api.me(tokens.accessToken);
      setAccessToken(tokens.accessToken);
      setRefreshToken(tokens.refreshToken);
      await persistTokens(tokens);
      setUser(me);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Signup failed");
    } finally {
      setIsLoading(false);
    }
  }

  async function requestStudentOtp(phone: string): Promise<string | undefined> {
    setIsLoading(true);
    setError(null);
    try {
      const result = await api.requestStudentOtp(phone);
      return result.devOtp;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send code");
      throw err;
    } finally {
      setIsLoading(false);
    }
  }

  async function verifyStudentOtp(phone: string, code: string): Promise<{ students: StudentOtpMatch[]; selectionToken: string }> {
    setIsLoading(true);
    setError(null);
    try {
      const result = await api.verifyStudentOtp(phone, code);
      setSelectionToken(result.selectionToken);
      return { students: result.students, selectionToken: result.selectionToken };
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid code");
      throw err;
    } finally {
      setIsLoading(false);
    }
  }

  async function selectStudent(studentStubId: string, selectionTokenOverride?: string) {
    const token = selectionTokenOverride ?? selectionToken;
    if (!token) {
      setError("Session expired, request a new code");
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const tokens = await api.selectStudent(token, studentStubId);
      const me = await api.me(tokens.accessToken);
      setAccessToken(tokens.accessToken);
      setRefreshToken(tokens.refreshToken);
      await persistTokens(tokens);
      setUser(me);
      setSelectionToken(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setIsLoading(false);
    }
  }

  function logout() {
    setUser(null);
    setAccessToken(null);
    setRefreshToken(null);
    setError(null);
    setSelectionToken(null);
    clearPersistedTokens().catch(() => {});
  }

  async function updateProfile(input: UpdateProfileInput) {
    if (!accessToken) throw new Error("Not signed in");
    const updated = await api.updateProfile(accessToken, input);
    setUser(updated);
  }

  async function changePassword(currentPassword: string, newPassword: string) {
    if (!accessToken) throw new Error("Not signed in");
    await api.changeMyPassword(accessToken, { currentPassword, newPassword });
  }

  async function uploadProfilePhoto(file: { uri: string; name: string; mimeType: string }) {
    if (!accessToken) throw new Error("Not signed in");
    const updated = await api.uploadMyPhoto(accessToken, file);
    setUser(updated);
  }

  async function setProfileAvatar(avatarKey: string) {
    if (!accessToken) throw new Error("Not signed in");
    const updated = await api.setMyAvatar(accessToken, avatarKey);
    setUser(updated);
  }

  async function removeProfilePhoto() {
    if (!accessToken) throw new Error("Not signed in");
    const updated = await api.removeMyPhoto(accessToken);
    setUser(updated);
  }

  async function deleteAccount(password: string) {
    if (!accessToken) throw new Error("Not signed in");
    await api.deleteMyAccount(accessToken, password);
    setUser(null);
    setAccessToken(null);
    setRefreshToken(null);
    setError(null);
    setSelectionToken(null);
    await clearPersistedTokens();
  }

  async function markOnboardingTourSeen() {
    if (!accessToken || !user) return;
    setUser({ ...user, hasSeenOnboardingTour: true });
    try {
      await api.markOnboardingTourSeen(accessToken);
    } catch {
      // Non-critical - worst case the tour shows once more next login.
    }
  }

  async function dismissProfilePrompt() {
    if (!accessToken || !user) return;
    setUser({ ...user, hasDismissedProfilePrompt: true });
    try {
      await api.dismissProfilePrompt(accessToken);
    } catch {
      // Non-critical - worst case the prompt shows once more next launch.
    }
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        accessToken,
        isLoading,
        isRestoring,
        error,
        login,
        logout,
        signupTeacher,
        requestStudentOtp,
        verifyStudentOtp,
        selectStudent,
        updateProfile,
        changePassword,
        uploadProfilePhoto,
        setProfileAvatar,
        removeProfilePhoto,
        markOnboardingTourSeen,
        dismissProfilePrompt,
        deleteAccount,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
