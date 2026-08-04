const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000/api/v1";

interface ApiEnvelope<T> {
  data: T | null;
  meta?: Record<string, unknown>;
  error?: { code: string; message: string };
}

export class ApiError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

async function requestEnvelope<T>(path: string, options: RequestInit = {}, token?: string): Promise<ApiEnvelope<T>> {
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

  return body;
}

async function request<T>(path: string, options: RequestInit = {}, token?: string): Promise<T> {
  const body = await requestEnvelope<T>(path, options, token);
  return body.data as T;
}

function toQueryString(params: Record<string, string | undefined>): string {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== "");
  if (entries.length === 0) return "";
  return "?" + entries.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v as string)}`).join("&");
}

// ---- Auth ----

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

// ---- Analytics ----

export type EnquiryStatus = "new" | "contacted" | "visit" | "application" | "admitted" | "enrolled" | "lost";
export type EnquirySource = "phone" | "walk_in" | "website" | "referral" | "event" | "social";

export interface FunnelResponse {
  byStatus: Record<EnquiryStatus, number>;
  totalCount: number;
  convertedCount: number;
  conversionRate: number;
}

export interface BySourceResponse {
  bySource: Partial<Record<EnquirySource, number>>;
  totalCount: number;
}

export interface CounsellorPerformanceEntry {
  ownerUserId: string;
  fullName: string;
  totalCount: number;
  convertedCount: number;
  conversionRate: number;
}

interface DateRangeParams {
  startDate?: string;
  endDate?: string;
  [key: string]: string | undefined;
}

// ---- Users ----

export interface AppUserSummary {
  id: string;
  fullName: string;
  email: string;
  role: string;
  status: string;
}

export interface InviteUserInput {
  fullName: string;
  email: string;
  role: string;
  schoolId?: string;
  trustId?: string;
}

// ---- Onboarding: trusts & schools ----

export interface TrustSummary {
  id: string;
  name: string;
  status: string;
}

export interface School {
  id: string;
  trustId: string;
  name: string;
  board: string;
  status: string;
}

export interface CreateSchoolInput {
  trustId?: string;
  name: string;
  board: string;
  address?: string;
  timezone?: string;
}

export const api = {
  login: (email: string, password: string) =>
    request<AuthTokens>("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  me: (token: string) => request<CurrentUser>("/auth/me", {}, token),

  getFunnel: (token: string, params: DateRangeParams = {}) =>
    request<FunnelResponse>(`/analytics/enrolment/funnel${toQueryString(params)}`, {}, token),
  getBySource: (token: string, params: DateRangeParams = {}) =>
    request<BySourceResponse>(`/analytics/enrolment/by-source${toQueryString(params)}`, {}, token),
  getCounsellorPerformance: (token: string, params: DateRangeParams = {}) =>
    request<CounsellorPerformanceEntry[]>(`/analytics/enrolment/counsellor-performance${toQueryString(params)}`, {}, token),

  listUsers: (token: string) => request<AppUserSummary[]>("/users", {}, token),
  inviteUser: (token: string, input: InviteUserInput) =>
    requestEnvelope<AppUserSummary>("/users", { method: "POST", body: JSON.stringify(input) }, token),

  listTrusts: (token: string) => request<TrustSummary[]>("/trusts", {}, token),
  createTrust: (token: string, name: string, contactEmail?: string) =>
    request<TrustSummary>("/trusts", { method: "POST", body: JSON.stringify({ name, contactEmail }) }, token),
  createSchool: (token: string, input: CreateSchoolInput) =>
    request<School>("/schools", { method: "POST", body: JSON.stringify(input) }, token),
};
