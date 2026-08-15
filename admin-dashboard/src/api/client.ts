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

async function requestText(path: string, token: string): Promise<string> {
  const response = await fetch(`${API_URL}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) {
    throw new ApiError("download_failed", "Download failed");
  }
  return response.text();
}

async function requestEnvelope<T>(path: string, options: RequestInit = {}, token?: string): Promise<ApiEnvelope<T>> {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      // Fastify's JSON body parser rejects an empty body when Content-Type is
      // application/json (FST_ERR_CTP_EMPTY_JSON_BODY) - only send it for
      // requests that actually have a body (e.g. not a bodyless DELETE).
      ...(options.body ? { "Content-Type": "application/json" } : {}),
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
  // Keyed by whatever pipeline stages the school has configured (FR-EG-3) - no
  // longer a fixed enum, so this isn't Record<EnquiryStatus, number> anymore.
  byStatus: Record<string, number>;
  totalCount: number;
  convertedCount: number;
  conversionRate: number;
}

export interface PipelineStage {
  id: string;
  key: string;
  label: string;
  order: number;
  isTerminal: boolean;
  isConverted: boolean;
}

export interface CreatePipelineStageInput {
  key: string;
  label: string;
  isTerminal?: boolean;
  isConverted?: boolean;
}

export interface UpdatePipelineStageInput {
  label?: string;
  order?: number;
  isTerminal?: boolean;
  isConverted?: boolean;
}

export interface AiUsageResponse {
  totalGenerations: number;
  avgGradingTurnaroundMs: number | null;
  generationsByTeacher: { teacherUserId: string; fullName: string; count: number }[];
  featureUsage: { feature: string; count: number }[];
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
  avgResponseHours: number | null;
}

export interface TrendResponse {
  periods: { period: string; newEnquiries: number; converted: number }[];
}

interface DateRangeParams {
  startDate?: string;
  endDate?: string;
  schoolId?: string;
  [key: string]: string | undefined;
}

// ---- Users ----

export interface AppUserSummary {
  id: string;
  fullName: string;
  email: string;
  role: string;
  status: string;
  schoolId: string | null;
}

export interface InviteUserInput {
  fullName: string;
  email: string;
  role: string;
  schoolId?: string;
  trustId?: string;
}

// ---- Academic structure (academic years / class sections) ----

export interface ClassSection {
  id: string;
  academicYearId: string;
  className: string;
  sectionName: string;
}

export interface AcademicYear {
  id: string;
  schoolId: string;
  label: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
  classSections: ClassSection[];
}

export interface CreateAcademicYearInput {
  label: string;
  startDate: string;
  endDate: string;
  isCurrent?: boolean;
}

export interface CreateClassSectionInput {
  academicYearId: string;
  className: string;
  sectionName: string;
}

// ---- Audit log ----

export interface AuditLogEntry {
  id: string;
  actorEmail: string;
  action: string;
  targetType: string;
  targetId: string | null;
  targetLabel: string | null;
  schoolId: string | null;
  trustId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

// ---- Message templates ----

export type MessageChannel = "sms" | "email";

export interface MessageTemplate {
  id: string;
  schoolId: string;
  channel: MessageChannel;
  name: string;
  body: string;
  language: string;
  createdAt: string;
}

export interface CreateMessageTemplateInput {
  channel: MessageChannel;
  name: string;
  body: string;
  language?: string;
}

// ---- CSV exports ----

export interface CsvExportLogEntry {
  id: string;
  schoolId: string;
  runAt: string;
  rowCount: number;
  status: "success" | "failed";
  fileLocation: string | null;
}

export interface CsvExportSchedule {
  schoolId: string;
  frequency: "daily" | "weekly";
  isActive: boolean;
}

// ---- Onboarding: trusts & schools ----

export interface TrustSummary {
  id: string;
  name: string;
  status: string;
}

export interface TrustDetail extends TrustSummary {
  legalName: string | null;
  contactEmail: string | null;
  contactPersonName: string | null;
  contactPersonPhone: string | null;
  registeredAddress: string | null;
  gstNumber: string | null;
  trustType: string | null;
  expectedSchoolCount: number | null;
  createdAt: string;
  schools: { id: string; name: string; board: string; status: string }[];
}

export interface CreateTrustInput {
  name: string;
  legalName?: string;
  contactEmail?: string;
  contactPersonName?: string;
  contactPersonPhone?: string;
  registeredAddress?: string;
  gstNumber?: string;
  trustType?: string;
  expectedSchoolCount?: number;
}

export interface School {
  id: string;
  trustId: string;
  name: string;
  board: string;
  status: string;
}

export interface SchoolReadiness {
  hasCurrentAcademicYear: boolean;
  hasClassSections: boolean;
  hasAdmin: boolean;
  ready: boolean;
  missing: string[];
}

export interface SchoolDetail extends School {
  address: string | null;
  timezone: string;
  principalName: string | null;
  principalPhone: string | null;
  expectedStudentStrength: number | null;
  createdAt: string;
  readiness: SchoolReadiness;
}

export interface CreateSchoolInput {
  // Only platform_admin can create a school, and always names the trust
  // explicitly - see backend/src/routes/schools.ts.
  trustId: string;
  name: string;
  board: string;
  address?: string;
  timezone?: string;
  principalName?: string;
  principalPhone?: string;
  expectedStudentStrength?: number;
}

export interface UpdateTrustInput {
  name?: string;
  legalName?: string;
  contactEmail?: string;
  contactPersonName?: string;
  contactPersonPhone?: string;
  registeredAddress?: string;
  gstNumber?: string;
  trustType?: string;
  expectedSchoolCount?: number;
  status?: string;
}

export interface UpdateSchoolInput {
  name?: string;
  board?: string;
  address?: string;
  timezone?: string;
  principalName?: string;
  principalPhone?: string;
  expectedStudentStrength?: number;
  status?: string;
}

export interface UpdateUserInput {
  role?: string;
  status?: string;
  schoolId?: string;
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
  getTrend: (token: string, params: { months?: number; schoolId?: string } = {}) =>
    request<TrendResponse>(
      `/analytics/enrolment/trend${toQueryString({
        months: params.months !== undefined ? String(params.months) : undefined,
        schoolId: params.schoolId,
      })}`,
      {},
      token
    ),

  getAiUsage: (token: string, params: { schoolId?: string } = {}) =>
    request<AiUsageResponse>(`/analytics/ai/usage${toQueryString(params)}`, {}, token),

  listPipelineStages: (token: string, params: { schoolId?: string } = {}) =>
    request<PipelineStage[]>(`/pipeline-stages${toQueryString(params)}`, {}, token),
  createPipelineStage: (token: string, input: CreatePipelineStageInput, params: { schoolId?: string } = {}) =>
    request<PipelineStage>(`/pipeline-stages${toQueryString(params)}`, { method: "POST", body: JSON.stringify(input) }, token),
  updatePipelineStage: (token: string, id: string, input: UpdatePipelineStageInput, params: { schoolId?: string } = {}) =>
    request<PipelineStage>(`/pipeline-stages/${id}${toQueryString(params)}`, { method: "PATCH", body: JSON.stringify(input) }, token),

  listUsers: (token: string, params: { schoolId?: string } = {}) =>
    request<AppUserSummary[]>(`/users${toQueryString(params)}`, {}, token),
  inviteUser: (token: string, input: InviteUserInput) =>
    requestEnvelope<AppUserSummary>("/users", { method: "POST", body: JSON.stringify(input) }, token),
  updateUser: (token: string, id: string, input: UpdateUserInput) =>
    request<AppUserSummary>(`/users/${id}`, { method: "PATCH", body: JSON.stringify(input) }, token),
  resetUserPassword: (token: string, id: string) =>
    requestEnvelope<AppUserSummary>(`/users/${id}/reset-password`, { method: "POST" }, token),

  listAcademicYears: (token: string, schoolId: string) =>
    request<AcademicYear[]>(`/schools/${schoolId}/academic-years`, {}, token),
  createAcademicYear: (token: string, schoolId: string, input: CreateAcademicYearInput) =>
    request<AcademicYear>(`/schools/${schoolId}/academic-years`, { method: "POST", body: JSON.stringify(input) }, token),
  setCurrentAcademicYear: (token: string, schoolId: string, academicYearId: string) =>
    request<AcademicYear>(
      `/schools/${schoolId}/academic-years/${academicYearId}`,
      { method: "PATCH", body: JSON.stringify({ isCurrent: true }) },
      token
    ),
  createClassSection: (token: string, schoolId: string, input: CreateClassSectionInput) =>
    request<ClassSection>(`/schools/${schoolId}/class-sections`, { method: "POST", body: JSON.stringify(input) }, token),

  listAuditLog: (token: string, params: { schoolId?: string; page?: number; pageSize?: number } = {}) =>
    requestEnvelope<AuditLogEntry[]>(
      `/audit-log${toQueryString({
        schoolId: params.schoolId,
        page: params.page !== undefined ? String(params.page) : undefined,
        pageSize: params.pageSize !== undefined ? String(params.pageSize) : undefined,
      })}`,
      {},
      token
    ),

  listMessageTemplates: (token: string, params: { channel?: MessageChannel; schoolId?: string } = {}) =>
    request<MessageTemplate[]>(`/message-templates${toQueryString(params)}`, {}, token),
  createMessageTemplate: (token: string, input: CreateMessageTemplateInput, params: { schoolId?: string } = {}) =>
    request<MessageTemplate>(`/message-templates${toQueryString(params)}`, { method: "POST", body: JSON.stringify(input) }, token),

  runCsvExport: (token: string, params: { schoolId?: string } = {}) =>
    requestEnvelope<CsvExportLogEntry>(`/exports/run${toQueryString(params)}`, { method: "POST" }, token),
  listCsvExportLog: (token: string, params: { schoolId?: string; page?: number; pageSize?: number } = {}) =>
    requestEnvelope<CsvExportLogEntry[]>(
      `/exports/log${toQueryString({
        schoolId: params.schoolId,
        page: params.page !== undefined ? String(params.page) : undefined,
        pageSize: params.pageSize !== undefined ? String(params.pageSize) : undefined,
      })}`,
      {},
      token
    ),
  downloadExport: (token: string, id: string, params: { schoolId?: string } = {}) =>
    requestText(`/exports/${id}/download${toQueryString(params)}`, token),
  getCsvExportSchedule: (token: string, params: { schoolId?: string } = {}) =>
    request<CsvExportSchedule | null>(`/exports/schedule${toQueryString(params)}`, {}, token),
  updateCsvExportSchedule: (
    token: string,
    input: { frequency?: "daily" | "weekly"; isActive?: boolean },
    params: { schoolId?: string } = {}
  ) => request<CsvExportSchedule>(`/exports/schedule${toQueryString(params)}`, { method: "PUT", body: JSON.stringify(input) }, token),

  listTrusts: (token: string) => request<TrustSummary[]>("/trusts", {}, token),
  getTrust: (token: string, id: string) => request<TrustDetail>(`/trusts/${id}`, {}, token),
  createTrust: (token: string, input: CreateTrustInput) =>
    request<TrustDetail>("/trusts", { method: "POST", body: JSON.stringify(input) }, token),
  updateTrust: (token: string, id: string, input: UpdateTrustInput) =>
    request<TrustSummary>(`/trusts/${id}`, { method: "PATCH", body: JSON.stringify(input) }, token),
  deleteTrust: (token: string, id: string) => request<{ deleted: true }>(`/trusts/${id}`, { method: "DELETE" }, token),

  listSchools: (token: string, trustId?: string) =>
    request<School[]>(`/schools${toQueryString({ trustId })}`, {}, token),
  getSchool: (token: string, id: string) => request<SchoolDetail>(`/schools/${id}`, {}, token),
  createSchool: (token: string, input: CreateSchoolInput) =>
    request<School>("/schools", { method: "POST", body: JSON.stringify(input) }, token),
  updateSchool: (token: string, id: string, input: UpdateSchoolInput) =>
    request<SchoolDetail>(`/schools/${id}`, { method: "PATCH", body: JSON.stringify(input) }, token),
  deleteSchool: (token: string, id: string) => request<{ deleted: true }>(`/schools/${id}`, { method: "DELETE" }, token),
};
