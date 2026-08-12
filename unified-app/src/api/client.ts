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
      // Fastify's JSON body parser rejects an empty body when Content-Type is
      // application/json (FST_ERR_CTP_EMPTY_JSON_BODY) - only send it for
      // requests that actually have a body (e.g. not a bodyless POST/DELETE).
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

async function requestText(path: string, token: string): Promise<string> {
  const response = await fetch(`${API_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new ApiError("download_failed", "Download failed");
  }
  return response.text();
}

// No Content-Type header here, deliberately - fetch/React Native sets the
// multipart boundary itself from the FormData body. requestEnvelope's default
// "application/json" header would break the upload if reused for this.
async function requestMultipart<T>(path: string, formData: FormData, token: string): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });
  const body: ApiEnvelope<T> = await response.json();
  if (!response.ok || body.error) {
    throw new ApiError(body.error?.code ?? "unknown_error", body.error?.message ?? "Request failed");
  }
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

// ---- Student login (phone + OTP) ----

export interface StudentOtpMatch {
  id: string;
  fullName: string;
  schoolId: string;
  classSectionId: string;
}

export interface StudentVerifyOtpResult {
  selectionToken: string;
  students: StudentOtpMatch[];
}

// ---- Student portal (read-only) ----

export type StudentSubmissionStatus = "not_submitted" | "submitted" | "graded";

export interface StudentAssignmentView {
  id: string;
  title: string;
  questions: AssignmentQuestion[];
  publishedAt: string | null;
  submissionStatus: StudentSubmissionStatus;
  grade: { finalScore: number | null; finalFeedback: string | null; releasedAt: string | null } | null;
}

export interface StudentProfile {
  id: string;
  fullName: string;
  dateOfBirth: string;
  classSectionId: string;
  admissionDate: string;
}

// ---- Pipeline stages (FR-EG-3: configurable per school, not a fixed enum) ----

export interface PipelineStage {
  id: string;
  key: string;
  label: string;
  order: number;
  isTerminal: boolean;
  isConverted: boolean;
}

// ---- Enquiries ----

// Stage keys are now school-configured (see PipelineStage above), not a fixed
// union - kept as `string` so a custom stage key doesn't fail to type-check.
export type EnquiryStatus = string;
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
  duplicateOfEnquiryId: string | null;
  consentCaptured: boolean;
  erasedAt: string | null;
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

export interface EnquiryNote {
  id: string;
  enquiryId: string;
  authorUserId: string | null;
  author: { fullName: string } | null;
  body: string;
  createdAt: string;
}

export type ActivityType = "stage_change" | "note_added" | "task_created" | "task_sent";

export interface ActivityItem {
  id: string;
  type: ActivityType;
  occurredAt: string;
  actorName: string | null;
  payload: Record<string, unknown>;
}

export interface EnquiryDetail extends Enquiry {
  stageHistory: EnquiryStageHistoryEntry[];
  notes: EnquiryNote[];
  activity: ActivityItem[];
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
  ownerUserId?: string;
  consentCaptured?: boolean;
}

export interface UpdateEnquiryInput {
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
  source?: EnquirySource;
  gradeInterest?: string;
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

// ---- Lesson Studio (FR-AI-1, FR-AI-5) ----

export interface LessonPlan {
  id: string;
  topic: string;
  board: string;
  format: string;
  classSectionId: string | null;
  content: string;
  createdAt: string;
}

export interface ResearchReport {
  id: string;
  topic: string;
  board: string;
  content: string;
  createdAt: string;
}

// ---- Assignment Lab (FR-AI-2, FR-AI-3) ----

export interface AssignmentQuestion {
  id: string;
  prompt: string;
  type?: string;
}

export interface Assignment {
  id: string;
  title: string;
  classSectionId: string;
  questions: AssignmentQuestion[];
  personalisationEnabled: boolean;
  status: "draft" | "published";
  publishedAt: string | null;
  createdAt: string;
}

export type PersonalisationStatus = "pending" | "approved" | "overridden" | "opted_out";

export interface PersonalisationSuggestion {
  id: string;
  assignmentId: string;
  studentStubId: string;
  studentStub?: { id: string; fullName: string };
  suggestedMix: Record<string, number>;
  reasoning: string;
  status: PersonalisationStatus;
  appliedMix: Record<string, number> | null;
  decidedAt: string | null;
}

export interface SubmissionRecord {
  id: string;
  assignmentId: string;
  studentStubId: string;
  studentStub?: { id: string; fullName: string };
  answers: Record<string, string>;
  submittedAt: string;
  grade?: GradeRecord | null;
}

export interface GradeRecord {
  id: string;
  submissionId: string;
  aiScore: number | null;
  aiFeedback: string | null;
  finalScore: number | null;
  finalFeedback: string | null;
  flaggedForAttention: boolean;
  status: "pending" | "ai_graded" | "released";
  releasedAt: string | null;
}

export interface AssignmentDetail extends Assignment {
  personalisationSuggestions: PersonalisationSuggestion[];
  submissions: SubmissionRecord[];
}

// ---- Teacher Analytics (FR-AI-4) ----

export interface ClassAnalytics {
  classAverage: number | null;
  submissionCount: number;
  students: { studentStubId: string; fullName: string; averageScore: number; submissionCount: number }[];
  struggleAreas: { assignmentId: string; title: string; averageScore: number }[];
}

export interface StudentAnalytics {
  studentStubId: string;
  fullName: string;
  averageScore: number | null;
  history: { assignmentTitle: string; score: number | null; submittedAt: string }[];
}

// ---- Documents (FR-EG-6) ----

export interface EnquiryDocument {
  id: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  uploadedAt: string;
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

export interface CsvExportSchedule {
  id: string;
  frequency: "daily" | "weekly";
  isActive: boolean;
  lastRunAt: string | null;
}

export const api = {
  login: (email: string, password: string) =>
    request<AuthTokens>("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  me: (token: string) => request<CurrentUser>("/auth/me", {}, token),

  requestPasswordReset: (email: string) =>
    request<{ message: string; devOtp?: string }>("/auth/request-password-reset", {
      method: "POST",
      body: JSON.stringify({ email }),
    }),
  resetPassword: (email: string, code: string, newPassword: string) =>
    request<{ message: string }>("/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ email, code, newPassword }),
    }),

  requestStudentOtp: (phone: string) =>
    request<{ message: string; devOtp?: string }>("/auth/student/request-otp", {
      method: "POST",
      body: JSON.stringify({ phone }),
    }),
  verifyStudentOtp: (phone: string, code: string) =>
    request<StudentVerifyOtpResult>("/auth/student/verify-otp", {
      method: "POST",
      body: JSON.stringify({ phone, code }),
    }),
  selectStudent: (selectionToken: string, studentStubId: string) =>
    request<AuthTokens>("/auth/student/select", {
      method: "POST",
      body: JSON.stringify({ selectionToken, studentStubId }),
    }),

  getStudentProfile: (token: string) => request<StudentProfile>("/student/me", {}, token),
  listStudentAssignments: (token: string) => request<StudentAssignmentView[]>("/student/assignments", {}, token),

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
  eraseEnquiry: (token: string, id: string) => request<Enquiry>(`/enquiries/${id}/erase`, { method: "POST" }, token),
  addEnquiryNote: (token: string, id: string, body: string) =>
    request<EnquiryNote>(`/enquiries/${id}/notes`, { method: "POST", body: JSON.stringify({ body }) }, token),
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
  bulkCreateEnquiries: (token: string, rows: CreateEnquiryInput[]) =>
    request<{ createdCount: number; errors: { row: number; message: string }[] }>(
      "/enquiries/bulk",
      { method: "POST", body: JSON.stringify({ rows }) },
      token
    ),

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

  listPipelineStages: (token: string) => request<PipelineStage[]>("/pipeline-stages", {}, token),

  generateLessonPlan: (
    token: string,
    input: { topic: string; board: string; format: string; classSectionId?: string }
  ) => request<LessonPlan>("/lesson-plans/generate", { method: "POST", body: JSON.stringify(input) }, token),
  listLessonPlans: (token: string) => request<LessonPlan[]>("/lesson-plans", {}, token),
  generateResearchReport: (token: string, input: { topic: string; board: string }) =>
    request<ResearchReport>("/research-reports/generate", { method: "POST", body: JSON.stringify(input) }, token),
  listResearchReports: (token: string) => request<ResearchReport[]>("/research-reports", {}, token),

  createAssignment: (
    token: string,
    input: { title: string; classSectionId: string; questions: AssignmentQuestion[]; personalisationEnabled?: boolean }
  ) => request<Assignment>("/assignments", { method: "POST", body: JSON.stringify(input) }, token),
  listAssignments: (token: string) => request<Assignment[]>("/assignments", {}, token),
  getAssignment: (token: string, id: string) => request<AssignmentDetail>(`/assignments/${id}`, {}, token),
  publishAssignment: (token: string, id: string) => request<Assignment>(`/assignments/${id}/publish`, { method: "POST" }, token),
  generatePersonalisationSuggestions: (token: string, assignmentId: string) =>
    request<PersonalisationSuggestion[]>(`/assignments/${assignmentId}/personalisation-suggestions`, { method: "POST" }, token),
  decidePersonalisationSuggestion: (
    token: string,
    id: string,
    input: { status: "approved" | "overridden" | "opted_out"; appliedMix?: Record<string, number> }
  ) => request<PersonalisationSuggestion>(`/personalisation-suggestions/${id}`, { method: "PATCH", body: JSON.stringify(input) }, token),
  listStudents: (token: string, classSectionId?: string) =>
    requestEnvelope<StudentStub[]>(`/students${toQueryString({ classSectionId })}`, {}, token),
  createSubmission: (token: string, input: { assignmentId: string; studentStubId: string; answers: Record<string, string> }) =>
    request<SubmissionRecord>("/submissions", { method: "POST", body: JSON.stringify(input) }, token),
  gradeSubmission: (token: string, submissionId: string) =>
    request<GradeRecord>(`/submissions/${submissionId}/grade`, { method: "POST" }, token),
  updateGrade: (token: string, gradeId: string, input: { finalScore?: number; finalFeedback?: string }) =>
    request<GradeRecord>(`/grades/${gradeId}`, { method: "PATCH", body: JSON.stringify(input) }, token),
  releaseGrades: (token: string, assignmentId: string) =>
    request<{ releasedCount: number }>(`/assignments/${assignmentId}/release-grades`, { method: "POST" }, token),
  getClassAnalytics: (token: string, classSectionId: string) =>
    request<ClassAnalytics>(`/analytics/ai/class/${classSectionId}`, {}, token),
  getStudentAnalytics: (token: string, studentStubId: string) =>
    request<StudentAnalytics>(`/analytics/ai/student/${studentStubId}`, {}, token),

  listDocuments: (token: string, enquiryId: string) =>
    request<EnquiryDocument[]>(`/enquiries/${enquiryId}/documents`, {}, token),
  uploadDocument: (token: string, enquiryId: string, file: { uri: string; name: string; mimeType: string }) => {
    const formData = new FormData();
    formData.append("file", { uri: file.uri, name: file.name, type: file.mimeType } as unknown as Blob);
    return requestMultipart<EnquiryDocument>(`/enquiries/${enquiryId}/documents`, formData, token);
  },

  runExport: (token: string) => request<CsvExportLog>("/exports/run", { method: "POST" }, token),
  listExportLog: (token: string) => requestEnvelope<CsvExportLog[]>("/exports/log", {}, token),
  downloadExport: (token: string, id: string) => requestText(`/exports/${id}/download`, token),
  getExportSchedule: (token: string) => request<CsvExportSchedule | null>("/exports/schedule", {}, token),
  updateExportSchedule: (token: string, input: { frequency?: "daily" | "weekly"; isActive?: boolean }) =>
    request<CsvExportSchedule>("/exports/schedule", { method: "PUT", body: JSON.stringify(input) }, token),
};
