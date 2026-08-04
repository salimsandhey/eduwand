const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";

interface ApiEnvelope<T> {
  data: T | null;
  meta?: Record<string, unknown>;
  error?: { code: string; message: string };
}

class ApiError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

async function request<T>(path: string, options: RequestInit = {}, token?: string): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  const body: ApiEnvelope<T> = await response.json();

  if (!response.ok || body.error) {
    throw new ApiError(body.error?.code ?? "unknown_error", body.error?.message ?? "Request failed");
  }

  return body.data as T;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface CurrentUser {
  id: string;
  fullName: string;
  email: string;
  role: string;
  schoolId: string | null;
  trustId: string | null;
  status: string;
}

export const api = {
  login: (email: string, password: string) =>
    request<AuthTokens>("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  me: (token: string) => request<CurrentUser>("/auth/me", {}, token),
};

export { ApiError };
