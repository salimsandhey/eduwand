import { createContext, useContext, useState, ReactNode } from "react";
import { api, CurrentUser, StudentOtpMatch } from "../api/client";

interface AuthContextValue {
  user: CurrentUser | null;
  accessToken: string | null;
  isLoading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;

  // Student phone+OTP login is a 3-step flow instead of a single call - a
  // phone can match more than one StudentStub (siblings), so verifying the
  // code returns candidates to pick from before a real session is issued.
  requestStudentOtp: (phone: string) => Promise<string | undefined>;
  verifyStudentOtp: (phone: string, code: string) => Promise<StudentOtpMatch[]>;
  selectStudent: (studentStubId: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectionToken, setSelectionToken] = useState<string | null>(null);

  async function login(email: string, password: string) {
    setIsLoading(true);
    setError(null);
    try {
      const tokens = await api.login(email, password);
      const me = await api.me(tokens.accessToken);
      setAccessToken(tokens.accessToken);
      setUser(me);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
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

  async function verifyStudentOtp(phone: string, code: string): Promise<StudentOtpMatch[]> {
    setIsLoading(true);
    setError(null);
    try {
      const result = await api.verifyStudentOtp(phone, code);
      setSelectionToken(result.selectionToken);
      return result.students;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid code");
      throw err;
    } finally {
      setIsLoading(false);
    }
  }

  async function selectStudent(studentStubId: string) {
    if (!selectionToken) {
      setError("Session expired, request a new code");
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const tokens = await api.selectStudent(selectionToken, studentStubId);
      const me = await api.me(tokens.accessToken);
      setAccessToken(tokens.accessToken);
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
    setError(null);
    setSelectionToken(null);
  }

  return (
    <AuthContext.Provider
      value={{ user, accessToken, isLoading, error, login, logout, requestStudentOtp, verifyStudentOtp, selectStudent }}
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
