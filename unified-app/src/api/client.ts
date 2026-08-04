const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";

interface ApiEnvelope<T> {
  data: T | null;
  meta?: Record<string, unknown>;
  error?: { code: string; message: string };
}

export class ApiError extends Error {
  constructor(public code: string, message: string) {
    super(message);
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

async function requestText(path: string, token: string): Promise<string> {
  const response = await fetch(`${API_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new ApiError("download_failed", "Download failed");
  }
  return response.text();
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

// ---- Enquiries ----

export type EnquiryStatus = "new" | "contacted" | "visit" | "application" | "admitted" | "enrolled" | "lost";
export type EnquirySource = "phone" | "walk_in" | "website" | "referral" | "event" | "social";

export interface Enquiry {
  id: string;
  schoolId: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string | null;
  source: EnquirySource;
  gradeInterest: string | null;
  status: EnquiryStatus;
  lostReason: string | null;
  ownerUserId: string | null;
  notes: string | null;
  duplicateOfEnquiryId: string | null;
  consentCaptured: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface EnquiryStageHistoryEntry {
  id: string;
  fromStatus: EnquiryStatus | null;
  toStatus: EnquiryStatus;
  changedByUserId: string | null;
  changedAt: string;
}

export interface EnquiryDetail extends Enquiry {
  stageHistory: EnquiryStageHistoryEntry[];
}

export interface PossibleDuplicate {
  id: string;
  contactName: string;
  status: EnquiryStatus;
  createdAt: string;
}

export interface CreateEnquiryInput {
  contactName: string;
  contactPhone: string;
  contactEmail?: string;
  source: EnquirySource;
  gradeInterest?: string;
  notes?: string;
  ownerUserId?: string;
  consentCaptured?: boolean;
}

export interface UpdateEnquiryInput {
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
  source?: EnquirySource;
  gradeInterest?: string;
  notes?: string;
  ownerUserId?: string;
  consentCaptured?: boolean;
  status?: EnquiryStatus;
  lostReason?: string;
}

// ---- Follow-up tasks & templates ----

export type MessageChannel = "sms" | "email";
export type FollowUpStatus = "pending" | "sent" | "failed" | "cancelled";

export interface MessageTemplate {
  id: string;
  schoolId: string;
  channel: MessageChannel;
  name: string;
  body: string;
  language: string;
}

export interface FollowUpTask {
  id: string;
  enquiryId: string;
  assignedToUserId: string;
  dueAt: string;
  channel: MessageChannel;
  templateId: string;
  status: FollowUpStatus;
  sentAt: string | null;
  enquiry?: { id: string; contactName: string; contactPhone: string; contactEmail: string | null };
}

// ---- Class sections / students ----

export interface ClassSection {
  id: string;
  academicYearId: string;
  className: string;
  sectionName: string;
}

export interface StudentStub {
  id: string;
  fullName: string;
  dateOfBirth: string;
  classSectionId: string;
  guardianName: string;
  guardianContact: string;
  admissionDate: string;
  feeStatus: string;
  sourceEnquiryId: string;
}

// ---- Exports ----

export interface CsvExportLog {
  id: string;
  schedule: string | null;
  runAt: string;
  rowCount: number;
  status: "success" | "failed";
  fileLocation: string | null;
}

export const api = {
  login: (email: string, password: string) =>
    request<AuthTokens>("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  me: (token: string) => request<CurrentUser>("/auth/me", {}, token),

  listEnquiries: (token: string, params: { status?: string; source?: string; ownerUserId?: string } = {}) =>
    requestEnvelope<Enquiry[]>(`/enquiries${toQueryString(params)}`, {}, token),
  createEnquiry: (token: string, input: CreateEnquiryInput) =>
    requestEnvelope<Enquiry>("/enquiries", { method: "POST", body: JSON.stringify(input) }, token),
  getEnquiry: (token: string, id: string) =>
    requestEnvelope<EnquiryDetail & { possibleDuplicates?: PossibleDuplicate[] }>(`/enquiries/${id}`, {}, token),
  updateEnquiry: (token: string, id: string, input: UpdateEnquiryInput) =>
    request<Enquiry>(`/enquiries/${id}`, { method: "PATCH", body: JSON.stringify(input) }, token),
  mergeEnquiry: (token: string, id: string, sourceEnquiryId: string) =>
    request<Enquiry>(`/enquiries/${id}/merge`, { method: "POST", body: JSON.stringify({ sourceEnquiryId }) }, token),
  confirmAdmission: (
    token: string,
    id: string,
    input: {
      fullName?: string;
      dateOfBirth: string;
      classSectionId: string;
      guardianName?: string;
      guardianContact?: string;
      admissionDate: string;
    }
  ) => request<StudentStub>(`/enquiries/${id}/confirm-admission`, { method: "POST", body: JSON.stringify(input) }, token),

  listMessageTemplates: (token: string, channel?: MessageChannel) =>
    request<MessageTemplate[]>(`/message-templates${toQueryString({ channel })}`, {}, token),

  listFollowUpTasks: (token: string, params: { assignedToUserId?: string; status?: string } = {}) =>
    request<FollowUpTask[]>(`/follow-up-tasks${toQueryString(params)}`, {}, token),
  createFollowUpTask: (
    token: string,
    input: { enquiryId: string; dueAt: string; channel: MessageChannel; templateId: string; assignedToUserId?: string }
  ) => request<FollowUpTask>("/follow-up-tasks", { method: "POST", body: JSON.stringify(input) }, token),
  sendFollowUpTask: (token: string, id: string) =>
    request<FollowUpTask>(`/follow-up-tasks/${id}/send`, { method: "POST" }, token),
  updateFollowUpTask: (token: string, id: string, input: { dueAt?: string; status?: "cancelled" }) =>
    request<FollowUpTask>(`/follow-up-tasks/${id}`, { method: "PATCH", body: JSON.stringify(input) }, token),

  listClassSections: (token: string) => request<ClassSection[]>("/class-sections", {}, token),

  runExport: (token: string) => request<CsvExportLog>("/exports/run", { method: "POST" }, token),
  listExportLog: (token: string) => requestEnvelope<CsvExportLog[]>("/exports/log", {}, token),
  downloadExport: (token: string, id: string) => requestText(`/exports/${id}/download`, token),
};
