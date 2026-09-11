const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";
// admin-dashboard (Vite web app) hosts the public /join/:code landing page
// a class join link opens - see class-join.ts on the backend and
// ClassJoinPage.tsx on admin-dashboard. Separate from EXPO_PUBLIC_API_URL
// since it's a different app/host.
const ADMIN_URL = process.env.EXPO_PUBLIC_ADMIN_URL ?? "http://localhost:5173";

export function getClassJoinLink(joinCode: string): string {
  return `${ADMIN_URL}/join/${joinCode}`;
}

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

// Lets AuthContext plug in how to refresh a stale access token and how to
// react when the refresh itself fails, without every screen having to know
// about token refresh at all - screens still just pass the token they have.
interface SessionHandlers {
  getRefreshToken: () => string | null;
  onTokensRefreshed: (tokens: AuthTokens) => void;
  onSessionExpired: () => void;
}

let sessionHandlers: SessionHandlers | null = null;
let refreshInFlight: Promise<string | null> | null = null;

export function setSessionHandlers(handlers: SessionHandlers | null) {
  sessionHandlers = handlers;
}

// Single-flights concurrent 401s into one refresh call so a screen firing
// several requests at once doesn't burn through multiple refresh tokens.
async function refreshAccessToken(): Promise<string | null> {
  if (!sessionHandlers) return null;
  const refreshToken = sessionHandlers.getRefreshToken();
  if (!refreshToken) return null;

  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const tokens = await request<AuthTokens>("/auth/refresh", { method: "POST" }, refreshToken);
        sessionHandlers?.onTokensRefreshed(tokens);
        return tokens.accessToken;
      } catch {
        sessionHandlers?.onSessionExpired();
        return null;
      } finally {
        refreshInFlight = null;
      }
    })();
  }
  return refreshInFlight;
}

function isExpiredAccessToken(token: string | undefined, body: ApiEnvelope<unknown>): boolean {
  return !!token && body.error?.code === "unauthorized";
}

async function requestEnvelope<T>(path: string, options: RequestInit = {}, token?: string, isRetry = false): Promise<ApiEnvelope<T>> {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  const body: ApiEnvelope<T> = await response.json();

  if (!response.ok || body.error) {
    if (!isRetry && path !== "/auth/refresh" && isExpiredAccessToken(token, body)) {
      const newAccessToken = await refreshAccessToken();
      if (newAccessToken) {
        return requestEnvelope<T>(path, options, newAccessToken, true);
      }
    }
    throw new ApiError(body.error?.code ?? "unknown_error", body.error?.message ?? "Request failed");
  }

  return body;
}

async function request<T>(path: string, options: RequestInit = {}, token?: string): Promise<T> {
  const body = await requestEnvelope<T>(path, options, token);
  return body.data as T;
}

async function requestText(path: string, token: string, isRetry = false): Promise<string> {
  const response = await fetch(`${API_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    if (!isRetry && response.status === 401) {
      const newAccessToken = await refreshAccessToken();
      if (newAccessToken) {
        return requestText(path, newAccessToken, true);
      }
    }
    throw new ApiError("download_failed", "Download failed");
  }
  return response.text();
}

// Deliberately XMLHttpRequest, not fetch: Expo's SDK 54+ runtime replaces the
// global fetch with its own spec-compliant implementation, which requires a
// real Blob/File for every FormData part and rejects the classic React Native
// { uri, name, type } file shape used below with "Unsupported FormDataPart
// implementation". XMLHttpRequest is untouched by that override and still
// goes through React Native's native networking module, which handles that
// shape correctly.
function xhrRequest(path: string, formData: FormData, token: string): Promise<{ status: number; text: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_URL}${path}`);
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.onload = () => resolve({ status: xhr.status, text: xhr.responseText });
    xhr.onerror = () => reject(new ApiError("network_error", "Upload failed"));
    xhr.send(formData);
  });
}

async function requestMultipart<T>(path: string, formData: FormData, token: string, isRetry = false): Promise<T> {
  const { status, text } = await xhrRequest(path, formData, token);
  let body: ApiEnvelope<T>;
  try {
    body = JSON.parse(text);
  } catch {
    throw new ApiError("unknown_error", "Request failed");
  }
  if (status < 200 || status >= 300 || body.error) {
    if (!isRetry && isExpiredAccessToken(token, body)) {
      const newAccessToken = await refreshAccessToken();
      if (newAccessToken) {
        return requestMultipart<T>(path, formData, newAccessToken, true);
      }
    }
    throw new ApiError(body.error?.code ?? "unknown_error", body.error?.message ?? "Request failed");
  }
  return body.data as T;
}

function toQueryString(params: Record<string, string | undefined>): string {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== "");
  if (entries.length === 0) return "";
  return "?" + entries.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v as string)}`).join("&");
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface CurrentUser {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  role: string;
  schoolId: string | null;
  trustId: string | null;
  status: string;
  photoMimeType: string | null;
  avatarKey: string | null;
  // "individual" gates the self-serve class/subject setup UI and Credits
  // screen behaviors specific to solo-teacher accounts. null for roles with
  // no school (e.g. platform_admin) or the student branch of /auth/me.
  accountType: string | null;
  hasSeenOnboardingTour: boolean;
}

export interface TeacherOnboardingTask {
  key: string;
  label: string;
  badge: string;
  completed: boolean;
  completedAt: string | null;
}

export interface TeacherOnboardingTasksResult {
  tasks: TeacherOnboardingTask[];
  completedCount: number;
  totalCount: number;
}

export interface SchoolLeaderboardEntry {
  teacherUserId: string;
  fullName: string;
  aiCount: number;
  assignmentCount: number;
  topicCount: number;
  score: number;
  isCurrentUser: boolean;
}

export interface SchoolLeaderboardResult {
  entries: SchoolLeaderboardEntry[];
  periodStart: string | null;
}

export interface UpdateProfileInput {
  fullName?: string;
  phone?: string | null;
}

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

export interface StudentSubmissionRecord {
  id: string;
  assignment: { id: string; title: string };
  submissionType: "online" | "photo";
  submittedAt: string;
  grade: { finalScore: number | null; finalFeedback: string | null; performanceBand: string | null } | null;
}

export interface StudentMaterial {
  id: string;
  topic: { id: string; name: string; subject: string };
  outputType: GenerationOutputType;
  content: string;
  generatedAt: string;
}

export type CommunicationChannel = "parent_weekly_update" | "teacher_to_student" | "teacher_to_class" | "student_to_teacher";

export interface CommunicationMessage {
  id: string;
  schoolId: string;
  channel: CommunicationChannel;
  senderUserId: string | null;
  senderStudentStubId: string | null;
  recipientStudentStubId: string | null;
  recipientClassSectionId: string | null;
  body: string;
  deliveryStatus: "pending" | "sent" | "held";
  sentAt: string | null;
  createdAt: string;
}

export interface AttainmentReportRecord {
  id: string;
  topicId: string;
  bloomsTaxonomyMapping: Record<string, unknown> | null;
  whatWasDone: string | null;
  outcomes: string | null;
  improvementNotes: string | null;
  pdfFileLocation: string | null;
  generatedAt: string;
  topicName: string;
  subject: string;
  board: string;
  className: string;
  sectionName: string;
  studentCount: number;
  gradedSubmissionCount: number;
  averageScore: number | null;
  scoreBands: {
    above80: number;
    between60And80: number;
    below60: number;
  };
  assignmentAttainment: {
    assignmentId: string;
    title: string;
    averageScore: number | null;
  }[];
}

export interface PipelineStage {
  id: string;
  key: string;
  label: string;
  order: number;
  isTerminal: boolean;
  isConverted: boolean;
}

export type EnquiryStatus = string;
export type EnquirySource = "phone" | "walk_in" | "website" | "referral" | "event" | "social";
export type GuardianRelation = "mother" | "father" | "guardian" | "other";

export interface Enquiry {
  id: string;
  schoolId: string;
  academicYearId: string;
  familyId: string | null;
  contactName: string;
  contactPhone: string;
  contactEmail: string | null;
  source: EnquirySource;
  gradeInterest: string | null;
  studentName: string | null;
  studentDateOfBirth: string | null;
  guardianRelation: GuardianRelation | null;
  photoMimeType: string | null;
  avatarKey: string | null;
  status: EnquiryStatus;
  lostReason: string | null;
  ownerUserId: string | null;
  duplicateOfEnquiryId: string | null;
  consentCaptured: boolean;
  formResponses: Record<string, unknown> | null;
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

export type EnquiryNoteType = "lead_note" | "admission_note" | "system_note";

export interface EnquiryNote {
  id: string;
  enquiryId: string;
  authorUserId: string | null;
  author: { fullName: string } | null;
  body: string;
  type: EnquiryNoteType;
  createdAt: string;
}

export type ActivityType = "stage_change" | "note_added" | "task_created" | "task_sent";
export type ActivityCategory = "lead" | "communication" | "admission";

export interface ActivityItem {
  id: string;
  type: ActivityType;
  category: ActivityCategory;
  occurredAt: string;
  actorName: string | null;
  payload: Record<string, unknown>;
}

export interface EnquiryPipelineInfo {
  status: EnquiryStatus;
  stage: { key: string; label: string; order: number; isTerminal: boolean; isConverted: boolean } | null;
}

export interface FollowUpSummary {
  total: number;
  pending: number;
  sent: number;
  overdue: number;
}

export interface AdmissionSummary {
  unlocked: boolean;
  confirmed: boolean;
  studentStubId: string | null;
  startedAt: string | null;
  completedAt: string | null;
  completionPercent: number;
}

export interface EnquiryDetail extends Enquiry {
  stageHistory: EnquiryStageHistoryEntry[];
  notes: EnquiryNote[];
  activity: ActivityItem[];
  pipeline: EnquiryPipelineInfo;
  followUpSummary: FollowUpSummary;
  admissionSummary: AdmissionSummary;
}

export interface AdmissionDraft {
  fullName?: string;
  dateOfBirth?: string;
  classSectionId?: string;
  guardianName?: string;
  guardianContact?: string;
  admissionDate?: string;
  [key: string]: unknown;
}

export interface AdmissionInfo {
  unlocked: boolean;
  confirmed: boolean;
  draft: AdmissionDraft | null;
  studentStub: StudentStub | null;
  startedAt: string | null;
  completedAt: string | null;
  completionPercent: number;
  fields: FormField[];
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
  studentName?: string;
  studentDateOfBirth?: string;
  guardianRelation?: GuardianRelation;
  formResponses?: Record<string, unknown>;
  academicYearId?: string;
  familyId?: string;
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
  studentName?: string;
  studentDateOfBirth?: string;
  guardianRelation?: GuardianRelation;
  formResponses?: Record<string, unknown>;
}

export interface AcademicYear {
  id: string;
  schoolId: string;
  label: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
}

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

export interface ClassSection {
  id: string;
  academicYearId: string;
  className: string;
  sectionName: string;
  isActive: boolean;
  joinCode: string;
}

// appliesTo is one of: generation, attainment_report
export interface SchoolFormatTemplate {
  id: string;
  schoolId: string;
  appliesTo: string;
  templateBody: string;
}

export interface SchoolLimits {
  classCount: number;
  classLimit: number;
  subjectCount: number;
  subjectLimit: number;
}

// status is one of: pending, approved, rejected. changeType is one of: add, replace.
export interface ClassChangeRequest {
  id: string;
  teacherUserId: string;
  schoolId: string;
  changeType: "add" | "replace";
  targetClassSectionId: string | null;
  requestedClassName: string;
  requestedSectionName: string;
  status: string;
  requestedAt: string;
  decidedAt: string | null;
  note: string | null;
}

// status is one of: pending, approved, rejected
export interface ClassJoinRequest {
  id: string;
  classSectionId: string;
  studentName: string;
  dateOfBirth: string;
  guardianName: string;
  guardianContact: string;
  status: string;
  submittedAt: string;
  decidedAt: string | null;
  note: string | null;
  classSection?: { className: string; sectionName: string };
}

export interface Subject {
  id: string;
  schoolId: string;
  name: string;
}

// reason is one of: plan_grant, admin_topup, ai_usage
export interface CreditLedgerEntry {
  id: string;
  teacherUserId: string;
  delta: number;
  reason: string;
  balanceAfter: number;
  note: string | null;
  createdAt: string;
}

export interface CreditAccountSummary {
  balance: number;
  ledgerEntries: CreditLedgerEntry[];
}

// status is one of: pending, approved, rejected
export interface SubjectChangeRequest {
  id: string;
  teacherUserId: string;
  schoolId: string;
  currentSubjects: string[];
  requestedSubjects: string[];
  status: string;
  requestedAt: string;
  decidedAt: string | null;
  note: string | null;
}

// status is one of: active, removed (soft delete only)
export interface StudentStub {
  id: string;
  fullName: string;
  dateOfBirth: string;
  classSectionId: string;
  guardianName: string;
  guardianContact: string;
  admissionDate: string;
  feeStatus: string;
  status: string;
  sourceEnquiryId: string | null;
  classSection?: ClassSection;
}

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

export interface Topic {
  id: string;
  classSectionId: string;
  subject: string;
  name: string;
  board: string;
  status: "active" | "archived";
  updatedAt: string;
  classSection?: { className: string; sectionName: string };
}

export interface ContextSource {
  id: string;
  topicId: string;
  sourceType: "pdf" | "docx" | "pptx" | "image" | "url" | "youtube" | "idream_k12";
  fileLocation: string | null;
  originalFilename: string | null;
  sourceUrl: string | null;
  idreamK12ReferenceId: string | null;
  pageCount: number | null;
  extractionStatus: "pending" | "extracted" | "failed_no_text";
  extractedText: string | null;
  extractionError: string | null;
}

export interface GenerationSourceSelection {
  contextSourceId: string;
  pageFrom?: number;
  pageTo?: number;
}

export type ResearchCandidateType = "pdf" | "video" | "presentation" | "article";

export interface ResearchCandidate {
  id: string;
  title: string;
  url: string;
  type: ResearchCandidateType;
  snippet: string;
  status: "pending" | "approved" | "dismissed";
  contextSourceId?: string;
}

export interface ContextResearchJob {
  id: string;
  topicId: string;
  status: "running" | "completed" | "failed";
  stage: "searching" | "reviewing" | "done";
  candidates: ResearchCandidate[];
  errorMessage: string | null;
}

export interface Observation {
  id: string;
  topicId: string;
  body: string;
  recordedAt: string;
}

export type GenerationOutputType = "lesson_plan" | "custom_activity_report" | "flashcards" | "presentation";

export interface Generation {
  id: string;
  topicId: string;
  outputType: GenerationOutputType;
  mode: "plan" | "generate";
  classCount: number | null;
  minutesPerClass: number | null;
  language: string;
  customPrompt: string | null;
  aiOutput: string;
  editedOutput: string | null;
  modelUsed: string;
  generationStatus: "pending" | "succeeded" | "failed";
  shareStatus: "draft" | "published";
  publishedAt: string | null;
  generatedAt: string;
  contextSources: ContextSource[];
  topic?: { name: string; subject: string; board: string; classSection: { className: string; sectionName: string } };
}

export interface TopicDetail extends Topic {
  classSection: { className: string; sectionName: string };
  contextSources: ContextSource[];
  generations: Generation[];
  observations: Observation[];
  assignments: Assignment[];
}

export type QuestionDifficulty = "easy" | "medium" | "hard";
export type QuestionType = "short_answer" | "mcq";

export interface AssignmentQuestion {
  id: string;
  prompt: string;
  type?: QuestionType;
  difficulty?: QuestionDifficulty;
  // mcq only: 2-5 options, correctOptionIndex is 0-based into options.
  options?: string[];
  correctOptionIndex?: number;
}

export interface AssignmentDraftOptions {
  objectives: string[];
  hasGenerations: boolean;
  hasContextSources: boolean;
  classSection: { className: string; sectionName: string };
}

export interface CreateAssignmentDraftInput {
  questionCount: number;
  difficultyMix: { easy: number; medium: number; hard: number };
  objectives?: string[];
  questionTypes?: "short_answer" | "mcq" | "mixed";
  focusPrompt?: string;
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

export interface QuestionGradeDetail {
  questionId: string;
  // null when the grader could only judge completeness, not correctness -
  // the offline heuristic that's used when no AI key is configured.
  correct: boolean | null;
  marksAwarded: number | null;
  note: string;
}

export interface GradeRecord {
  id: string;
  submissionId: string;
  aiScore: number | null;
  aiFeedback: string | null;
  aiNextStep: string | null;
  questionDetails: QuestionGradeDetail[] | null;
  finalScore: number | null;
  finalFeedback: string | null;
  performanceBand: "level_1" | "level_2" | "level_3" | null;
  flaggedForAttention: boolean;
  status: "pending" | "ai_graded" | "released";
  releasedToStudent: boolean;
  releasedAt: string | null;
}

export interface AnswerKeyEntry {
  id: string;
  assignmentId: string;
  questionId: string;
  questionIndex: number;
  photoSubmissionRequired: boolean;
  aiAnswer: string;
  teacherVerifiedAnswer: string | null;
  marks: number;
}

export interface PersonalisationEligibility {
  studentStubId: string;
  fullName: string;
  eligible: boolean;
}

export interface ItemAnalysisEntry {
  questionId: string;
  prompt: string;
  correctCount: number;
  totalCount: number;
  // null when no submission for this question has been evaluated for
  // correctness yet (only completeness-graded, offline heuristic).
  correctRate: number | null;
}

export interface ClassInsight {
  gradedCount: number;
  totalSubmissions: number;
  bands: Record<"level_1" | "level_2" | "level_3", { studentStubId: string; fullName: string }[]>;
  itemAnalysis: ItemAnalysisEntry[] | null;
  suggestedActions: string[];
}

export interface AssignmentDetail extends Assignment {
  topicId: string | null;
  personalisationSuggestions: PersonalisationSuggestion[];
  submissions: SubmissionRecord[];
}

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

export interface TeacherDashboardActivityItem {
  type: "generation" | "observation" | "assignment_published";
  id: string;
  topicId: string | null;
  label: string;
  timestamp: string;
}

export interface TeacherDashboardSummary {
  topicCount: number;
  topicsUpdatedThisWeek: number;
  continueTopic: { id: string; name: string; subject: string; classSectionId: string; updatedAt: string } | null;
  assignmentCount: number;
  draftAssignmentCount: number;
  publishedAssignmentCount: number;
  ungradedSubmissionCount: number;
  recentActivity: TeacherDashboardActivityItem[];
}

export interface EnrolmentFunnel {
  byStatus: Record<string, number>;
  totalCount: number;
  convertedCount: number;
  conversionRate: number;
}

export interface EnrolmentBySource {
  bySource: Record<string, number>;
  totalCount: number;
}

export interface EnrolmentCounsellorPerformance {
  ownerUserId: string;
  fullName: string;
  totalCount: number;
  convertedCount: number;
  conversionRate: number;
  avgResponseHours: number | null;
}

export interface EnrolmentTrend {
  periods: { period: string; newEnquiries: number; converted: number }[];
}

export interface EnrolmentStageVelocity {
  stageKey: string;
  stageLabel: string;
  avgDays: number | null;
  sampleCount: number;
}

export interface EnrolmentLostReasons {
  byReason: Record<string, number>;
  totalCount: number;
}

export interface EnrolmentTaskOutcomes {
  byStatus: Record<string, number>;
  channelEffectiveness: { channel: string; total: number; sent: number; sentRate: number }[];
  totalCount: number;
}

export interface EnrolmentGradeDemand {
  byGrade: Record<string, number>;
  totalCount: number;
}

export interface EnrolmentYearlyTrend {
  years: { year: string; newEnquiries: number; converted: number }[];
}

// documentType keys are driven by the school's active document_checklist
// FormDefinition (Docs/Dev/GrowthEngine_Rebuild_Plan.md Phase 2) plus the
// always-accepted "other" catch-all - no longer a fixed union, since the
// checklist is per-school configurable via the admin Form Builder.
export type DocumentType = string;

export interface EnquiryDocument {
  id: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  documentType: DocumentType | null;
  uploadedAt: string;
}

export interface CsvExportLog {
  id: string;
  schedule: string | null;
  runAt: string;
  rowCount: number;
  status: "success" | "failed";
  fileLocation: string | null;
}

export type FormDefinitionPurpose = "enquiry_intake" | "admission_detail" | "document_checklist";
export type FormFieldType = "text" | "number" | "date" | "select" | "multiselect" | "checkbox" | "textarea" | "file";

export interface FormDefinition {
  id: string;
  schoolId: string;
  purpose: FormDefinitionPurpose;
  name: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface FormField {
  id: string;
  formDefinitionId: string;
  key: string;
  label: string;
  fieldType: FormFieldType;
  options: unknown;
  order: number;
  isRequired: boolean;
  requiredAtStage: string | null;
}

export interface FormDefinitionWithFields {
  definition: FormDefinition;
  fields: FormField[];
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
  refresh: (refreshToken: string) => request<AuthTokens>("/auth/refresh", { method: "POST" }, refreshToken),
  me: (token: string) => request<CurrentUser>("/auth/me", {}, token),

  updateProfile: (token: string, input: UpdateProfileInput) =>
    request<CurrentUser>("/auth/me", { method: "PATCH", body: JSON.stringify(input) }, token),
  changeMyPassword: (token: string, input: { currentPassword: string; newPassword: string }) =>
    request<{ message: string }>("/auth/me/change-password", { method: "POST", body: JSON.stringify(input) }, token),
  markOnboardingTourSeen: (token: string) =>
    request<{ hasSeenOnboardingTour: boolean }>("/auth/me/onboarding-tour-seen", { method: "POST" }, token),
  getOnboardingTasks: (token: string) => request<TeacherOnboardingTasksResult>("/me/onboarding-tasks", {}, token),
  getSchoolLeaderboard: (token: string) => request<SchoolLeaderboardResult>("/me/school-leaderboard", {}, token),
  myPhotoUrl: (token: string) => `${API_URL}/auth/me/photo?token=${encodeURIComponent(token)}`,
  uploadMyPhoto: (token: string, file: { uri: string; name: string; mimeType: string }) => {
    const formData = new FormData();
    formData.append("file", { uri: file.uri, name: file.name, type: file.mimeType } as unknown as Blob);
    return requestMultipart<CurrentUser>("/auth/me/photo", formData, token);
  },
  setMyAvatar: (token: string, avatarKey: string) =>
    request<CurrentUser>("/auth/me/avatar", { method: "PATCH", body: JSON.stringify({ avatarKey }) }, token),
  removeMyPhoto: (token: string) =>
    request<CurrentUser>("/auth/me/photo", { method: "DELETE" }, token),

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
  submitStudentAssignmentOnline: (token: string, input: { assignmentId: string; answers: Record<string, string> }) =>
    request<StudentSubmissionRecord>("/student/submissions", { method: "POST", body: JSON.stringify(input) }, token),
  submitStudentAssignmentPhoto: (token: string, assignmentId: string, file: { uri: string; name: string; mimeType: string }) => {
    const formData = new FormData();
    formData.append("assignmentId", assignmentId);
    formData.append("answers", "{}");
    formData.append("file", { uri: file.uri, name: file.name, type: file.mimeType } as unknown as Blob);
    return requestMultipart<StudentSubmissionRecord>("/student/submissions", formData, token);
  },
  listStudentSubmissions: (token: string) => request<StudentSubmissionRecord[]>("/student/submissions", {}, token),
  listStudentMaterials: (token: string) => request<StudentMaterial[]>("/student/materials", {}, token),
  listStudentCommunications: (token: string) => request<CommunicationMessage[]>("/student/communications", {}, token),
  sendStudentCommunication: (token: string, body: string) =>
    request<CommunicationMessage>("/student/communications", { method: "POST", body: JSON.stringify({ body }) }, token),

  listEnquiries: (token: string, params: { status?: string; source?: string; ownerUserId?: string; academicYearId?: string } = {}) =>
    requestEnvelope<Enquiry[]>(`/enquiries${toQueryString(params)}`, {}, token),
  createEnquiry: (token: string, input: CreateEnquiryInput) =>
    requestEnvelope<Enquiry>("/enquiries", { method: "POST", body: JSON.stringify(input) }, token),
  getEnquiry: (token: string, id: string) =>
    requestEnvelope<EnquiryDetail & { possibleDuplicates?: PossibleDuplicate[] }>(`/enquiries/${id}`, {}, token),
  updateEnquiry: (token: string, id: string, input: UpdateEnquiryInput) =>
    request<Enquiry>(`/enquiries/${id}`, { method: "PATCH", body: JSON.stringify(input) }, token),
  mergeEnquiry: (token: string, id: string, sourceEnquiryId: string) =>
    request<Enquiry>(`/enquiries/${id}/merge`, { method: "POST", body: JSON.stringify({ sourceEnquiryId }) }, token),
  linkEnquiryFamily: (token: string, id: string, input: { familyId?: string; sourceEnquiryId?: string }) =>
    request<Enquiry>(`/enquiries/${id}/link-family`, { method: "POST", body: JSON.stringify(input) }, token),
  eraseEnquiry: (token: string, id: string) => request<Enquiry>(`/enquiries/${id}/erase`, { method: "POST" }, token),
  deleteEnquiry: (token: string, id: string) => request<{ id: string }>(`/enquiries/${id}`, { method: "DELETE" }, token),
  addEnquiryNote: (token: string, id: string, body: string, type: EnquiryNoteType = "lead_note") =>
    request<EnquiryNote>(`/enquiries/${id}/notes`, { method: "POST", body: JSON.stringify({ body, type }) }, token),
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
  getEnquiryAdmission: (token: string, id: string) => request<AdmissionInfo>(`/enquiries/${id}/admission`, {}, token),
  saveAdmissionDraft: (token: string, id: string, draft: AdmissionDraft) =>
    request<{ draft: AdmissionDraft; startedAt: string | null; completionPercent: number }>(
      `/enquiries/${id}/admission-draft`,
      { method: "PATCH", body: JSON.stringify(draft) },
      token
    ),
  bulkCreateEnquiries: (token: string, rows: CreateEnquiryInput[]) =>
    request<{ createdCount: number; errors: { row: number; message: string }[] }>(
      "/enquiries/bulk",
      { method: "POST", body: JSON.stringify({ rows }) },
      token
    ),

  listMessageTemplates: (token: string, channel?: MessageChannel) =>
    request<MessageTemplate[]>(`/message-templates${toQueryString({ channel })}`, {}, token),

  listFollowUpTasks: (token: string, params: { assignedToUserId?: string; status?: string; enquiryId?: string } = {}) =>
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
  listAcademicYears: (token: string) => request<AcademicYear[]>("/academic-years", {}, token),
  startNewAcademicYear: (
    token: string,
    schoolId: string,
    input: { label: string; startDate: string; endDate: string; copyFromAcademicYearId: string }
  ) =>
    request<AcademicYear>(
      `/schools/${schoolId}/academic-years`,
      { method: "POST", body: JSON.stringify({ ...input, isCurrent: true }) },
      token
    ),
  listSubjects: (token: string) => request<Subject[]>("/subjects", {}, token),

  signupTeacher: (input: { fullName: string; email: string; password: string; board: string; phone?: string; workspaceName?: string }) =>
    request<AuthTokens>("/auth/signup/teacher", { method: "POST", body: JSON.stringify(input) }),

  createClassSection: (token: string, schoolId: string, input: { academicYearId: string; className: string; sectionName: string }) =>
    request<ClassSection>(`/schools/${schoolId}/class-sections`, { method: "POST", body: JSON.stringify(input) }, token),
  createSubject: (token: string, schoolId: string, input: { name: string }) =>
    request<Subject>(`/schools/${schoolId}/subjects`, { method: "POST", body: JSON.stringify(input) }, token),
  assignTeacherToClassSection: (token: string, schoolId: string, classSectionId: string, teacherUserId: string) =>
    request<{ id: string }>(`/schools/${schoolId}/class-sections/${classSectionId}/teachers`, { method: "POST", body: JSON.stringify({ teacherUserId }) }, token),
  getSchoolLimits: (token: string, schoolId: string) =>
    request<SchoolLimits>(`/schools/${schoolId}/limits`, {}, token),

  getFormatTemplates: (token: string, schoolId: string) =>
    request<{ generation: SchoolFormatTemplate | null; attainmentReport: SchoolFormatTemplate | null }>(
      `/schools/${schoolId}/format-templates`,
      {},
      token
    ),
  saveFormatTemplate: (token: string, schoolId: string, appliesTo: "generation" | "attainment_report", templateBody: string) =>
    request<SchoolFormatTemplate>(
      `/schools/${schoolId}/format-templates/${appliesTo}`,
      { method: "PUT", body: JSON.stringify({ templateBody }) },
      token
    ),

  getMyCredits: (token: string) => request<CreditAccountSummary>("/me/credits", {}, token),
  requestSubjectChange: (token: string, schoolId: string, input: { requestedSubjects: string[]; note?: string }) =>
    request<SubjectChangeRequest>(`/schools/${schoolId}/subject-change-requests`, { method: "POST", body: JSON.stringify(input) }, token),
  requestClassChange: (
    token: string,
    schoolId: string,
    input: { changeType: "add" | "replace"; targetClassSectionId?: string; requestedClassName: string; requestedSectionName: string; note?: string }
  ) => request<ClassChangeRequest>(`/schools/${schoolId}/class-change-requests`, { method: "POST", body: JSON.stringify(input) }, token),

  listClassJoinRequests: (token: string, classSectionId: string, params: { status?: string } = {}) =>
    request<ClassJoinRequest[]>(`/class-sections/${classSectionId}/join-requests${toQueryString(params)}`, {}, token),
  listAllJoinRequests: (token: string, params: { status?: string } = {}) =>
    request<ClassJoinRequest[]>(`/join-requests${toQueryString(params)}`, {}, token),
  decideClassJoinRequest: (token: string, id: string, input: { decision: "approved" | "rejected"; note?: string }) =>
    request<ClassJoinRequest>(`/join-requests/${id}`, { method: "PATCH", body: JSON.stringify(input) }, token),

  bulkAddStudents: (token: string, classSectionId: string, students: { fullName: string; dateOfBirth: string; guardianName: string; guardianContact: string }[]) =>
    request<{ created: number; skipped: { row: number; reason: string }[] }>(
      "/students/bulk",
      { method: "POST", body: JSON.stringify({ classSectionId, students }) },
      token
    ),
  bulkReassignStudents: (token: string, classSectionId: string, studentIds: string[]) =>
    request<{ updated: number; skipped: { studentId: string; reason: string }[] }>(
      "/students/bulk-reassign",
      { method: "POST", body: JSON.stringify({ classSectionId, studentIds }) },
      token
    ),
  updateStudent: (
    token: string,
    id: string,
    input: { fullName?: string; dateOfBirth?: string; classSectionId?: string; guardianName?: string; guardianContact?: string; feeStatus?: string }
  ) => request<StudentStub>(`/students/${id}`, { method: "PATCH", body: JSON.stringify(input) }, token),
  createStudent: (
    token: string,
    input: { fullName: string; dateOfBirth: string; classSectionId: string; guardianName: string; guardianContact: string }
  ) => request<StudentStub>("/students", { method: "POST", body: JSON.stringify(input) }, token),
  deleteStudent: (token: string, id: string) => request<{ deleted: true }>(`/students/${id}`, { method: "DELETE" }, token),

  listPipelineStages: (token: string) => request<PipelineStage[]>("/pipeline-stages", {}, token),

  getFormDefinition: (token: string, purpose: FormDefinitionPurpose) =>
    request<FormDefinitionWithFields>(`/form-definitions${toQueryString({ purpose })}`, {}, token),

  generateLessonPlan: (
    token: string,
    input: { topic: string; board: string; format: string; classSectionId?: string }
  ) => request<LessonPlan>("/lesson-plans/generate", { method: "POST", body: JSON.stringify(input) }, token),
  listLessonPlans: (token: string) => request<LessonPlan[]>("/lesson-plans", {}, token),
  generateResearchReport: (token: string, input: { topic: string; board: string }) =>
    request<ResearchReport>("/research-reports/generate", { method: "POST", body: JSON.stringify(input) }, token),
  listResearchReports: (token: string) => request<ResearchReport[]>("/research-reports", {}, token),

  listTopics: (token: string, params: { classSectionId?: string; subject?: string } = {}) =>
    request<Topic[]>(`/topics${toQueryString(params)}`, {}, token),
  createTopic: (token: string, input: { classSectionId: string; subject: string; name: string; board: string }) =>
    request<Topic>("/topics", { method: "POST", body: JSON.stringify(input) }, token),
  getTopic: (token: string, id: string) => request<TopicDetail>(`/topics/${id}`, {}, token),
  addTopicContextUrl: (token: string, topicId: string, input: { sourceType: "url" | "idream_k12"; sourceUrl?: string; idreamK12ReferenceId?: string }) =>
    request<ContextSource>(`/topics/${topicId}/context`, { method: "POST", body: JSON.stringify(input) }, token),
  addTopicContextFile: (token: string, topicId: string, file: { uri: string; name: string; mimeType: string }) => {
    const formData = new FormData();
    formData.append("file", { uri: file.uri, name: file.name, type: file.mimeType } as unknown as Blob);
    return requestMultipart<ContextSource>(`/topics/${topicId}/context`, formData, token);
  },
  contextSourceFileUrl: (topicId: string, contextSourceId: string, token: string) =>
    `${API_URL}/topics/${topicId}/context/${contextSourceId}/file?token=${encodeURIComponent(token)}`,
  updateTopicContextText: (token: string, topicId: string, contextSourceId: string, extractedText: string) =>
    request<ContextSource>(
      `/topics/${topicId}/context/${contextSourceId}`,
      { method: "PATCH", body: JSON.stringify({ extractedText }) },
      token
    ),
  retryTopicContextExtraction: (token: string, topicId: string, contextSourceId: string) =>
    request<ContextSource>(
      `/topics/${topicId}/context/${contextSourceId}/retry-extraction`,
      { method: "POST" },
      token
    ),
  addTopicObservation: (token: string, topicId: string, body: string) =>
    request<Observation>(`/topics/${topicId}/observations`, { method: "POST", body: JSON.stringify({ body }) }, token),

  importTopicContext: (token: string, topicId: string, input: { sourceTopicId: string; contextSourceIds?: string[] }) =>
    request<ContextSource[]>(`/topics/${topicId}/context/import`, { method: "POST", body: JSON.stringify(input) }, token),

  startContextResearch: (token: string, topicId: string) =>
    request<ContextResearchJob>(`/topics/${topicId}/context/research`, { method: "POST" }, token),
  getContextResearchJob: (token: string, topicId: string, jobId: string) =>
    request<ContextResearchJob>(`/topics/${topicId}/context/research/${jobId}`, {}, token),
  approveContextResearchCandidate: (token: string, topicId: string, jobId: string, candidateId: string) =>
    request<ContextResearchJob>(
      `/topics/${topicId}/context/research/${jobId}/candidates/${candidateId}/approve`,
      { method: "POST" },
      token
    ),
  dismissContextResearchCandidate: (token: string, topicId: string, jobId: string, candidateId: string) =>
    request<ContextResearchJob>(
      `/topics/${topicId}/context/research/${jobId}/candidates/${candidateId}/dismiss`,
      { method: "POST" },
      token
    ),

  createGeneration: (
    token: string,
    topicId: string,
    input: {
      outputType: GenerationOutputType;
      classCount?: number;
      minutesPerClass?: number;
      language?: string;
      customPrompt?: string;
      sources?: GenerationSourceSelection[];
    }
  ) => request<Generation>(`/topics/${topicId}/generations`, { method: "POST", body: JSON.stringify(input) }, token),
  getGeneration: (token: string, id: string) => request<Generation>(`/generations/${id}`, {}, token),
  editGeneration: (token: string, id: string, editedOutput: string) =>
    request<Generation>(`/generations/${id}`, { method: "PATCH", body: JSON.stringify({ editedOutput }) }, token),
  retryGeneration: (token: string, id: string) => request<Generation>(`/generations/${id}/retry`, { method: "POST" }, token),
  publishGeneration: (token: string, id: string) => request<Generation>(`/generations/${id}/publish`, { method: "POST" }, token),
  unpublishGeneration: (token: string, id: string) => request<Generation>(`/generations/${id}/unpublish`, { method: "POST" }, token),

  createAssignment: (
    token: string,
    input: { title: string; classSectionId: string; questions: AssignmentQuestion[]; personalisationEnabled?: boolean; topicId?: string }
  ) => request<Assignment>("/assignments", { method: "POST", body: JSON.stringify(input) }, token),
  listAssignments: (token: string) => request<Assignment[]>("/assignments", {}, token),
  getAssignment: (token: string, id: string) => request<AssignmentDetail>(`/assignments/${id}`, {}, token),
  updateAssignment: (
    token: string,
    id: string,
    input: { title?: string; questions?: AssignmentQuestion[]; personalisationEnabled?: boolean }
  ) => request<Assignment>(`/assignments/${id}`, { method: "PATCH", body: JSON.stringify(input) }, token),
  getAssignmentDraftOptions: (token: string, topicId: string) =>
    request<AssignmentDraftOptions>(`/topics/${topicId}/assignment-draft/options`, {}, token),
  createAssignmentDraft: (token: string, topicId: string, input: CreateAssignmentDraftInput) =>
    request<AssignmentDetail>(`/topics/${topicId}/assignment-draft`, { method: "POST", body: JSON.stringify(input) }, token),
  regenerateAssignmentQuestion: (token: string, assignmentId: string, questionId: string, instruction?: string) =>
    request<AssignmentDetail>(
      `/assignments/${assignmentId}/questions/${questionId}/regenerate`,
      { method: "POST", body: JSON.stringify({ instruction }) },
      token
    ),
  publishAssignment: (token: string, id: string, confirmUnverified?: boolean) =>
    request<Assignment>(`/assignments/${id}/publish`, { method: "POST", body: JSON.stringify({ confirmUnverified }) }, token),
  unpublishAssignment: (token: string, id: string) => request<Assignment>(`/assignments/${id}/unpublish`, { method: "POST" }, token),
  deleteAssignment: (token: string, id: string) => request<{ id: string }>(`/assignments/${id}`, { method: "DELETE" }, token),
  generatePersonalisationSuggestions: (token: string, assignmentId: string) =>
    request<{ created: PersonalisationSuggestion[]; skipped: { studentStubId: string; reason: string }[] }>(
      `/assignments/${assignmentId}/personalisation-suggestions`,
      { method: "POST" },
      token
    ),
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
  releaseGrade: (token: string, gradeId: string) => request<GradeRecord>(`/grades/${gradeId}/release`, { method: "POST" }, token),
  releaseGrades: (token: string, assignmentId: string) =>
    request<{ releasedCount: number }>(`/assignments/${assignmentId}/release-grades`, { method: "POST" }, token),
  getClassInsight: (token: string, assignmentId: string) =>
    request<ClassInsight>(`/assignments/${assignmentId}/class-insight`, {}, token),
  getPersonalisationEligibility: (token: string, assignmentId: string) =>
    request<PersonalisationEligibility[]>(`/assignments/${assignmentId}/personalisation-eligibility`, {}, token),
  generateAnswerKey: (token: string, assignmentId: string) =>
    request<AnswerKeyEntry[]>(`/assignments/${assignmentId}/answer-key/generate`, { method: "POST" }, token),
  getAnswerKey: (token: string, assignmentId: string) =>
    request<AnswerKeyEntry[]>(`/assignments/${assignmentId}/answer-key`, {}, token),
  updateAnswerKeyEntry: (token: string, id: string, input: { teacherVerifiedAnswer: string; marks?: number }) =>
    request<AnswerKeyEntry>(`/answer-key/${id}`, { method: "PATCH", body: JSON.stringify(input) }, token),
  getClassAnalytics: (token: string, classSectionId: string) =>
    request<ClassAnalytics>(`/analytics/ai/class/${classSectionId}`, {}, token),
  getStudentAnalytics: (token: string, studentStubId: string) =>
    request<StudentAnalytics>(`/analytics/ai/student/${studentStubId}`, {}, token),
  getTeacherDashboardSummary: (token: string) =>
    request<TeacherDashboardSummary>("/dashboard/teacher-summary", {}, token),
  getEnrolmentFunnel: (token: string) =>
    request<EnrolmentFunnel>("/analytics/enrolment/funnel", {}, token),
  getEnrolmentBySource: (token: string) =>
    request<EnrolmentBySource>("/analytics/enrolment/by-source", {}, token),
  getEnrolmentCounsellorPerformance: (token: string) =>
    request<EnrolmentCounsellorPerformance[]>("/analytics/enrolment/counsellor-performance", {}, token),
  getEnrolmentTrend: (token: string, months = 6) =>
    request<EnrolmentTrend>(`/analytics/enrolment/trend?months=${months}`, {}, token),
  getEnrolmentStageVelocity: (token: string) =>
    request<EnrolmentStageVelocity[]>("/analytics/enrolment/stage-velocity", {}, token),
  getEnrolmentLostReasons: (token: string) =>
    request<EnrolmentLostReasons>("/analytics/enrolment/lost-reasons", {}, token),
  getEnrolmentTaskOutcomes: (token: string) =>
    request<EnrolmentTaskOutcomes>("/analytics/enrolment/task-outcomes", {}, token),
  getEnrolmentGradeDemand: (token: string) =>
    request<EnrolmentGradeDemand>("/analytics/enrolment/grade-demand", {}, token),
  getEnrolmentYearlyTrend: (token: string) =>
    request<EnrolmentYearlyTrend>("/analytics/enrolment/yearly-trend", {}, token),

  listCommunicationsWithStudent: (token: string, studentStubId: string) =>
    request<CommunicationMessage[]>(`/communications${toQueryString({ studentStubId })}`, {}, token),
  listCommunicationsForClass: (token: string, classSectionId: string) =>
    request<CommunicationMessage[]>(`/communications${toQueryString({ classSectionId })}`, {}, token),
  sendCommunicationToStudent: (token: string, input: { studentStubId: string; body: string }) =>
    request<CommunicationMessage>("/communications/teacher-to-student", { method: "POST", body: JSON.stringify(input) }, token),
  sendCommunicationToClass: (token: string, input: { classSectionId: string; body: string }) =>
    request<CommunicationMessage>("/communications/teacher-to-class", { method: "POST", body: JSON.stringify(input) }, token),
  listPendingParentUpdates: (token: string) =>
    request<CommunicationMessage[]>("/communications/parent-weekly-update/pending", {}, token),
  holdParentUpdate: (token: string, id: string) =>
    request<CommunicationMessage>(`/communications/parent-weekly-update/${id}/hold`, { method: "POST" }, token),

  getAttainmentReport: (token: string, topicId: string) =>
    request<AttainmentReportRecord>(`/topics/${topicId}/attainment-report`, {}, token),

  listDocuments: (token: string, enquiryId: string) =>
    request<EnquiryDocument[]>(`/enquiries/${enquiryId}/documents`, {}, token),
  uploadDocument: (
    token: string,
    enquiryId: string,
    file: { uri: string; name: string; mimeType: string },
    documentType?: DocumentType
  ) => {
    const formData = new FormData();
    if (documentType) formData.append("documentType", documentType);
    formData.append("file", { uri: file.uri, name: file.name, type: file.mimeType } as unknown as Blob);
    return requestMultipart<EnquiryDocument>(`/enquiries/${enquiryId}/documents`, formData, token);
  },

  enquiryPhotoUrl: (token: string, enquiryId: string) => `${API_URL}/enquiries/${enquiryId}/photo?token=${encodeURIComponent(token)}`,
  uploadEnquiryPhoto: (token: string, enquiryId: string, file: { uri: string; name: string; mimeType: string }) => {
    const formData = new FormData();
    formData.append("file", { uri: file.uri, name: file.name, type: file.mimeType } as unknown as Blob);
    return requestMultipart<{ id: string; photoMimeType: string | null; avatarKey: string | null }>(
      `/enquiries/${enquiryId}/photo`,
      formData,
      token
    );
  },
  setEnquiryAvatar: (token: string, enquiryId: string, avatarKey: string) =>
    request<{ id: string; photoMimeType: string | null; avatarKey: string | null }>(
      `/enquiries/${enquiryId}/avatar`,
      { method: "PATCH", body: JSON.stringify({ avatarKey }) },
      token
    ),
  removeEnquiryPhoto: (token: string, enquiryId: string) =>
    request<{ id: string; photoMimeType: string | null; avatarKey: string | null }>(
      `/enquiries/${enquiryId}/photo`,
      { method: "DELETE" },
      token
    ),

  runExport: (token: string) => request<CsvExportLog>("/exports/run", { method: "POST" }, token),
  listExportLog: (token: string) => requestEnvelope<CsvExportLog[]>("/exports/log", {}, token),
  downloadExport: (token: string, id: string) => requestText(`/exports/${id}/download`, token),
  getExportSchedule: (token: string) => request<CsvExportSchedule | null>("/exports/schedule", {}, token),
  updateExportSchedule: (token: string, input: { frequency?: "daily" | "weekly"; isActive?: boolean }) =>
    request<CsvExportSchedule>("/exports/schedule", { method: "PUT", body: JSON.stringify(input) }, token),
};
