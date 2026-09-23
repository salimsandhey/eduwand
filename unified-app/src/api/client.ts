const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";
// admin-dashboard (Vite web app) hosts the public /join/:code landing page
// a class join link opens - see class-join.ts on the backend and
// ClassJoinPage.tsx on admin-dashboard. Separate from EXPO_PUBLIC_API_URL
// since it's a different app/host.
const ADMIN_URL = process.env.EXPO_PUBLIC_ADMIN_URL ?? "http://localhost:5173";

// admin-dashboard hosts the classroom Display/Control pages for a live quick
// check (see present.ts) - same reasoning as getClassJoinLink above.
export function getPresentDisplayLink(code: string): string {
  return `${ADMIN_URL}/present/${code}`;
}
export function getPresentControlLink(code: string): string {
  return `${ADMIN_URL}/present/${code}/control`;
}
export function getPresentSocketUrl(code: string): string {
  return `${API_URL.replace(/^http/, "ws")}/realtime?presentCode=${encodeURIComponent(code)}`;
}

// The safe/anonymous shape (see backend's present.ts displayState()) - never
// a student's name or which option they picked, only aggregate counts and a
// per-seat answered flag. This is what the teacher's own phone shows itself
// (a live ticker) - it never needs identified data, so it always gets the
// same redacted view the projector does.
export interface PresentState {
  assessmentId: string;
  title: string;
  status: string;
  questions: { id: string; prompt: string; options: string[]; correctOptionIndex: number }[];
  currentQuestionIndex: number;
  currentQuestionRevealed: boolean;
  totalStudents: number;
  answeredCount: number;
  counts: { correct: number; incorrect: number; doubt: number };
  seats: { seatNumber: number | null; answered: boolean }[];
}

// Public, unauthenticated - lets the teacher's own phone show a live
// "X of N answered" ticker for a session they started, without a token
// (same present.ts endpoints the classroom Display/Control pages use).
export function presentGetState(code: string): Promise<PresentState> {
  return request<PresentState>(`/present/${code}`);
}

export function getRealtimeUrl(token: string): string {
  return `${API_URL.replace(/^http/, "ws")}/realtime?token=${encodeURIComponent(token)}`;
}

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
  // The school's board - the single source of truth for the whole app. null
  // for roles with no school or the student branch of /auth/me.
  board: string | null;
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

export interface AssistantLink {
  label: string;
  screen: string;
  params?: Record<string, unknown>;
}

export type AssistantActionStatus = "pending" | "confirmed" | "cancelled" | "failed";

export interface AssistantAction {
  id: string;
  summary: string;
  status: AssistantActionStatus;
  resultText: string | null;
  resultLink: AssistantLink | null;
}

export interface AssistantMessage {
  id: string;
  from: "user" | "assistant";
  text: string;
  links: AssistantLink[];
  createdAt: string;
  action: AssistantAction | null;
}

// key is one of: privacy_policy, terms_of_service, about, contact.
export interface ContentPage {
  id: string;
  key: string;
  title: string;
  bodyMarkdown: string;
  // Only meaningful for "contact" today ({ email, phone, whatsapp?, address,
  // hours? }) - ContactScreen renders these as tappable cards instead of the
  // markdown body. null/absent for every other key.
  fields: Record<string, string> | null;
  version: number;
  updatedAt: string;
}

export interface StudentAttainmentRow {
  studentStubId: string;
  fullName: string;
  averageScore: number;
  submissionCount: number;
  // Per-assignment (topic report) or per-topic (subject report) score
  // breakdown for this student, scoped to this exact report.
  breakdown: { label: string; averageScore: number }[];
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
  studentAttainment: StudentAttainmentRow[];
  generationSummaries: {
    outputType: string;
    label: string;
    summary: string;
  }[];
  observations: {
    id: string;
    body: string;
    photoUrl: string | null;
    recordedAt: string;
  }[];
  // "Objective based analysis" + "Learning stage" segments - which
  // objectives/stages this topic's lesson plans and activity reports
  // actually address. Coverage, not performance - see attainment-reports.ts.
  objectiveCoverage: { objective: string; stage: string | null; outputType: string }[];
  stageCoverage: { stage: string; count: number }[];
}

export interface SubjectAttainmentReport {
  subject: string;
  className: string;
  sectionName: string;
  topicCount: number;
  studentCount: number;
  gradedSubmissionCount: number;
  averageScore: number | null;
  scoreBands: {
    above80: number;
    between60And80: number;
    below60: number;
  };
  perTopicAttainment: {
    topicId: string;
    topicName: string;
    averageScore: number | null;
    gradedSubmissionCount: number;
  }[];
  studentAttainment: StudentAttainmentRow[];
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

// Interview/assessment conducted during a school visit - schema/backend
// already model this (InterviewRecord, admissions-workflow.ts) but nothing
// in the app surfaced it until the admission-journey tracker's Visit Done
// step started using it.
export interface InterviewRecord {
  id: string;
  enquiryId: string;
  interviewDate: string;
  score: number | null;
  maxScore: number | null;
  notes: string;
  createdAt: string;
  conductedBy?: { fullName: string };
}

export interface CreateInterviewInput {
  interviewDate: string;
  score?: number;
  maxScore?: number;
  notes: string;
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

// weekday is ISO: 1=Mon ... 7=Sun. startTime/endTime are 24h "HH:mm".
export interface TimetableSlot {
  id: string;
  teacherUserId: string;
  classSectionId: string;
  subject: string;
  weekday: number;
  startTime: string;
  endTime: string;
  room: string | null;
  classSection: { className: string; sectionName: string };
}

export interface TimetableSlotInput {
  teacherUserId: string;
  classSectionId: string;
  subject: string;
  weekday: number;
  startTime: string;
  endTime: string;
  room?: string | null;
}

export interface CalendarPeriod {
  id: string;
  startTime: string;
  endTime: string;
  subject: string;
  room: string | null;
  className: string;
  sectionName: string;
}

export interface CalendarTask {
  id: string;
  title: string;
  notes: string | null;
  dueTime: string | null;
  isDone: boolean;
}

export interface CalendarDay {
  date: string;
  periods: CalendarPeriod[];
  tasks: CalendarTask[];
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
  // Credit line for images / PDFs found by AI research (null for uploads).
  attribution: string | null;
}

export interface GenerationSourceSelection {
  contextSourceId: string;
  pageFrom?: number;
  pageTo?: number;
}

export type ResearchCandidateType = "pdf" | "video" | "presentation" | "article" | "image";

export interface ResearchCandidate {
  id: string;
  title: string;
  url: string;
  type: ResearchCandidateType;
  snippet: string;
  status: "pending" | "approved" | "dismissed";
  contextSourceId?: string;
  // Image candidates only.
  thumbnailUrl?: string;
  attribution?: string;
  sourcePageUrl?: string;
  // Video candidates only - reference videos to watch, never used as AI
  // context. videoId drives the in-app embedded player.
  videoId?: string;
  channelTitle?: string;
  duration?: string;
}

export interface ContextResearchJob {
  id: string;
  topicId: string;
  status: "running" | "completed" | "failed";
  stage: "searching" | "reviewing" | "done";
  candidates: ResearchCandidate[];
  errorMessage: string | null;
}

// A reference video the teacher chose to keep for a topic - browse-only,
// never fed to the AI. Shown on the Topic screen, not just within one AI
// Research session.
export interface SavedVideo {
  id: string;
  topicId: string;
  videoId: string;
  title: string;
  channelTitle: string;
  thumbnailUrl: string;
  duration: string;
  createdAt: string;
}

export interface Observation {
  id: string;
  topicId: string;
  body: string;
  photoUrl: string | null;
  recordedAt: string;
}

export type GenerationOutputType = "lesson_plan" | "custom_activity_report" | "flashcards" | "presentation";
export type PresentationTemplate = "detailed" | "instructional" | "school_format" | "more_visual";
export type ActivityGroupSize = "individual" | "small_group" | "large_group";
export type PresentationColorScheme = "indigo" | "coral" | "forest" | "slate";

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
  // When shareStatus is "published": true means the whole class can see it;
  // false means only sharedStudentStubIds can, from the audience picker on
  // "Share with students".
  sharedWithAll: boolean;
  sharedStudentStubIds: string[];
  generatedAt: string;
  contextSources: ContextSource[];
  topic?: { name: string; subject: string; classSection: { className: string; sectionName: string } };
  // Which class periods (1-indexed) the teacher has ticked off as taught -
  // only meaningful when classCount > 1. See stages[].sessions in the
  // lesson_plan content and POST /generations/:id/session-progress.
  completedSessions: number[];
}

export interface TopicDetail extends Topic {
  classSection: { className: string; sectionName: string };
  contextSources: ContextSource[];
  generations: Generation[];
  observations: Observation[];
  assignments: Assignment[];
}

export type QuestionDifficulty = "easy" | "medium" | "hard";
// true_false is stored like mcq (options: ["True","False"], correctOptionIndex).
// fill_blank/very_short/short_answer are all a plain text-answer box - they
// differ only in phrasing/grading strictness, not in shape.
export type QuestionType = "mcq" | "true_false" | "fill_blank" | "very_short" | "short_answer" | "match_following" | "sequencing";

export interface AssignmentQuestion {
  id: string;
  prompt: string;
  type?: QuestionType;
  difficulty?: QuestionDifficulty;
  // mcq / true_false only: 2-5 options, correctOptionIndex is 0-based into options.
  options?: string[];
  correctOptionIndex?: number;
  // match_following only: correct left/right pairs - the answering screen
  // shuffles the right column for display.
  pairs?: { left: string; right: string }[];
  // sequencing only: steps already in their correct order - the answering
  // screen shuffles them for display.
  items?: string[];
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
  // Empty/omitted = the AI may use any format.
  questionTypes?: QuestionType[];
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
  // The setup the teacher chose when generating this with AI - null for a
  // manually created assignment. questionCount is the total they decided on;
  // the review screen uses it to stop "+ Add question" silently growing past it.
  aiGenParams: { questionCount: number } | null;
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

export interface AssessmentQuestion {
  id: string;
  prompt: string;
  options: string[];
  correctOptionIndex: number;
}

export interface AssessmentResponseRecord {
  id: string;
  questionId: string;
  studentStubId: string;
  // Null on a doubt response ("not sure") - see isDoubt.
  selectedOptionIndex: number | null;
  isCorrect: boolean | null;
  isDoubt: boolean;
}

export interface Assessment {
  id: string;
  topicId: string;
  generationId: string;
  classSectionId: string;
  title: string;
  questions: AssessmentQuestion[];
  status: "capturing" | "completed";
  completedAt: string | null;
  resultsReleasedToStudents: boolean;
  resultsReleasedAt: string | null;
  createdAt: string;
  responses: AssessmentResponseRecord[];
  // Set while a "present on a screen" session (present.ts) is running; null
  // once it hasn't been started yet or has been ended.
  presentCode: string | null;
  presentCodeExpiresAt: string | null;
}

export interface AssessmentInsight {
  respondentCount: number;
  totalQuestions: number;
  bands: Record<"level_1" | "level_2" | "level_3", { studentStubId: string; fullName: string }[]>;
  itemAnalysis: { questionId: string; prompt: string; correctCount: number; totalCount: number; correctRate: number | null; doubtCount: number }[];
  totalDoubts: number;
  recommendation: string;
}

export interface StudentAssessmentRecord {
  id: string;
  title: string;
  topicName: string;
  score: { correctCount: number; totalQuestions: number };
  questions: { prompt: string; wasCorrect: boolean | null }[];
  resultsReleasedAt: string;
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
  weeklyTrend: { label: string; score: number | null }[];
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

// Ranked "needs your attention" items for the teacher home ticker. `action`
// says what tapping it should open; the app maps it to its own screens.
export type TeacherNudgeAction =
  | { kind: "assignment"; assignmentId: string }
  | { kind: "topic"; topicId: string }
  | { kind: "day" }
  | { kind: "getting_started" };

export interface TeacherNudge {
  id: string;
  type: "submissions" | "day" | "assign_test" | "share_lessons" | "onboarding";
  label: string;
  text: string;
  people?: string[];
  action: TeacherNudgeAction;
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
  deleteMyAccount: (token: string, password: string) =>
    request<{ message: string }>("/auth/me", { method: "DELETE", body: JSON.stringify({ password }) }, token),

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
  listInterviews: (token: string, enquiryId: string) =>
    request<InterviewRecord[]>(`/enquiries/${enquiryId}/interviews`, {}, token),
  createInterview: (token: string, enquiryId: string, input: CreateInterviewInput) =>
    request<InterviewRecord>(`/enquiries/${enquiryId}/interviews`, { method: "POST", body: JSON.stringify(input) }, token),
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
  getCalendarAgenda: (token: string, from: string, to: string) =>
    request<{ days: CalendarDay[] }>(`/calendar/agenda${toQueryString({ from, to })}`, {}, token),
  getMyTimetable: (token: string) => request<TimetableSlot[]>("/calendar/timetable", {}, token),
  createCalendarTask: (token: string, input: { title: string; taskDate: string; dueTime?: string | null }) =>
    request<CalendarTask & { taskDate: string }>("/calendar/tasks", { method: "POST", body: JSON.stringify(input) }, token),
  updateCalendarTask: (token: string, id: string, input: { isDone?: boolean; title?: string }) =>
    request<CalendarTask & { taskDate: string }>(`/calendar/tasks/${id}`, { method: "PATCH", body: JSON.stringify(input) }, token),
  deleteCalendarTask: (token: string, id: string) => request<{ id: string }>(`/calendar/tasks/${id}`, { method: "DELETE" }, token),
  // Individual teachers manage their own timetable through the same school
  // endpoints the admin dashboard uses - the backend treats them as admin of
  // their personal school only.
  createTimetableSlot: (token: string, schoolId: string, input: TimetableSlotInput) =>
    request<TimetableSlot>(`/schools/${schoolId}/timetable-slots`, { method: "POST", body: JSON.stringify(input) }, token),
  updateTimetableSlot: (token: string, schoolId: string, slotId: string, input: Partial<TimetableSlotInput>) =>
    request<TimetableSlot>(`/schools/${schoolId}/timetable-slots/${slotId}`, { method: "PATCH", body: JSON.stringify(input) }, token),
  deleteTimetableSlot: (token: string, schoolId: string, slotId: string) =>
    request<{ id: string }>(`/schools/${schoolId}/timetable-slots/${slotId}`, { method: "DELETE" }, token),
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
  getSchoolBranding: (token: string, schoolId: string) =>
    request<{ logoUrl: string | null; primaryColor: string | null; secondaryColor: string | null }>(
      `/schools/${schoolId}/branding`,
      {},
      token
    ),
  saveSchoolBranding: (
    token: string,
    schoolId: string,
    input: { logo?: { uri: string; name: string; mimeType: string }; primaryColor?: string; secondaryColor?: string }
  ) => {
    const formData = new FormData();
    if (input.logo) formData.append("logo", { uri: input.logo.uri, name: input.logo.name, type: input.logo.mimeType } as unknown as Blob);
    if (input.primaryColor) formData.append("primaryColor", input.primaryColor);
    if (input.secondaryColor) formData.append("secondaryColor", input.secondaryColor);
    return requestMultipart<{ logoUrl: string | null; primaryColor: string | null; secondaryColor: string | null }>(
      `/schools/${schoolId}/branding`,
      formData,
      token
    );
  },

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
  createTopic: (token: string, input: { classSectionId: string; subject: string; name: string }) =>
    request<Topic>("/topics", { method: "POST", body: JSON.stringify(input) }, token),
  getTopic: (token: string, id: string) => request<TopicDetail>(`/topics/${id}`, {}, token),
  addTopicContextUrl: (token: string, topicId: string, input: { sourceType: "url" | "idream_k12"; sourceUrl?: string; idreamK12ReferenceId?: string }) =>
    request<ContextSource>(`/topics/${topicId}/context`, { method: "POST", body: JSON.stringify(input) }, token),
  addTopicContextFile: (token: string, topicId: string, file: { uri: string; name: string; mimeType: string }) => {
    const formData = new FormData();
    formData.append("file", { uri: file.uri, name: file.name, type: file.mimeType } as unknown as Blob);
    return requestMultipart<ContextSource>(`/topics/${topicId}/context`, formData, token);
  },
  // An image source, or one rendered page of a PDF source, as an inline image.
  contextMediaUrl: (topicId: string, contextSourceId: string, token: string, opts: { page?: number; width?: number } = {}) =>
    `${API_URL}/topics/${topicId}/context/${contextSourceId}/media?token=${encodeURIComponent(token)}${opts.page ? `&page=${opts.page}` : ""}${opts.width ? `&w=${opts.width}` : ""}`,
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
  deleteTopicContext: (token: string, topicId: string, contextSourceId: string) =>
    request<null>(`/topics/${topicId}/context/${contextSourceId}`, { method: "DELETE" }, token),
  addTopicObservation: (token: string, topicId: string, body: string, photo?: { uri: string; name: string; mimeType: string }) => {
    if (!photo) {
      return request<Observation>(`/topics/${topicId}/observations`, { method: "POST", body: JSON.stringify({ body }) }, token);
    }
    const formData = new FormData();
    formData.append("body", body);
    formData.append("file", { uri: photo.uri, name: photo.name, type: photo.mimeType } as unknown as Blob);
    return requestMultipart<Observation>(`/topics/${topicId}/observations`, formData, token);
  },

  importTopicContext: (token: string, topicId: string, input: { sourceTopicId: string; contextSourceIds?: string[] }) =>
    request<ContextSource[]>(`/topics/${topicId}/context/import`, { method: "POST", body: JSON.stringify(input) }, token),

  startContextResearch: (token: string, topicId: string) =>
    request<ContextResearchJob>(`/topics/${topicId}/context/research`, { method: "POST" }, token),
  getContextResearchJob: (token: string, topicId: string, jobId: string) =>
    request<ContextResearchJob>(`/topics/${topicId}/context/research/${jobId}`, {}, token),
  // null when nothing has ever been searched for this topic - lets the
  // screen show the last run instead of always starting a fresh (quota-
  // spending) search.
  getLatestContextResearchJob: (token: string, topicId: string) =>
    request<ContextResearchJob | null>(`/topics/${topicId}/context/research/latest`, {}, token),
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

  // Reference videos saved against a topic - browse-only, never fed to the AI.
  listSavedVideos: (token: string, topicId: string) => request<SavedVideo[]>(`/topics/${topicId}/videos`, {}, token),
  saveVideo: (token: string, topicId: string, input: { videoId: string; title: string; channelTitle: string; thumbnailUrl: string; duration?: string }) =>
    request<SavedVideo>(`/topics/${topicId}/videos`, { method: "POST", body: JSON.stringify(input) }, token),
  deleteSavedVideo: (token: string, topicId: string, savedVideoId: string) =>
    request<{ id: string }>(`/topics/${topicId}/videos/${savedVideoId}`, { method: "DELETE" }, token),

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
      // Images / PDF pages to show as-is in the output instead of having the AI
      // recreate them.
      embeds?: GenerationSourceSelection[];
      // Presentation only: build the deck purely from `embeds`, no AI call (free).
      assembleOnly?: boolean;
      presentationTemplate?: PresentationTemplate;
      // Per-generation color tweak - overrides the school's saved branding
      // colors for this deck only. Omit to just use the saved branding as-is.
      overridePrimaryColor?: string;
      overrideSecondaryColor?: string;
      // Only meaningful when outputType is "custom_activity_report".
      activityGroupSize?: ActivityGroupSize;
      activityResources?: string[];
      learningStages?: string[];
    }
  ) => request<Generation>(`/topics/${topicId}/generations`, { method: "POST", body: JSON.stringify(input) }, token),
  getGeneration: (token: string, id: string) => request<Generation>(`/generations/${id}`, {}, token),
  presentationExportUrl: (id: string) => `${API_URL}/generations/${id}/export.pptx`,
  attainmentReportPdfUrl: (topicId: string) => `${API_URL}/topics/${topicId}/attainment-report/pdf`,
  subjectAttainmentReportPdfUrl: (classSectionId: string, subject: string) =>
    `${API_URL}/attainment-reports/roll-up/pdf?classSectionId=${encodeURIComponent(classSectionId)}&subject=${encodeURIComponent(subject)}`,
  editGeneration: (token: string, id: string, editedOutput: string) =>
    request<Generation>(`/generations/${id}`, { method: "PATCH", body: JSON.stringify({ editedOutput }) }, token),
  retryGeneration: (token: string, id: string) => request<Generation>(`/generations/${id}/retry`, { method: "POST" }, token),
  setSessionProgress: (token: string, id: string, session: number, completed: boolean) =>
    request<Generation>(`/generations/${id}/session-progress`, { method: "POST", body: JSON.stringify({ session, completed }) }, token),
  publishGeneration: (token: string, id: string, studentStubIds?: string[]) =>
    request<Generation>(`/generations/${id}/publish`, { method: "POST", body: JSON.stringify({ studentStubIds }) }, token),
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
  // Same as createAssignmentDraft, but spans one or more topics in a class -
  // reachable from the Assignment tab directly, not from inside a topic.
  createMultiTopicAssignmentDraft: (token: string, classSectionId: string, input: CreateAssignmentDraftInput & { topicIds: string[] }) =>
    request<AssignmentDetail>(`/class-sections/${classSectionId}/assignment-draft`, { method: "POST", body: JSON.stringify(input) }, token),
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
  getActiveAssessment: (token: string, generationId: string) => request<Assessment | null>(`/generations/${generationId}/active-assessment`, {}, token),
  generateAssessment: (token: string, generationId: string, input: { questionCount?: number } = {}) =>
    request<Assessment>(`/generations/${generationId}/assessments`, { method: "POST", body: JSON.stringify(input) }, token),
  getAssessment: (token: string, id: string) => request<Assessment>(`/assessments/${id}`, {}, token),
  saveAssessmentResponses: (token: string, id: string, questionId: string, responses: { studentStubId: string; selectedOptionIndex?: number; isDoubt?: boolean }[]) =>
    request<Assessment>(`/assessments/${id}/responses`, { method: "POST", body: JSON.stringify({ questionId, responses }) }, token),
  completeAssessment: (token: string, id: string) => request<Assessment>(`/assessments/${id}/complete`, { method: "POST" }, token),
  startPresentSession: (token: string, id: string) => request<{ code: string; expiresAt: string }>(`/assessments/${id}/present-session`, { method: "POST" }, token),
  getAssessmentInsight: (token: string, id: string) => request<AssessmentInsight>(`/assessments/${id}/insight`, {}, token),
  releaseAssessmentResults: (token: string, id: string) => request<Assessment>(`/assessments/${id}/release-results`, { method: "POST" }, token),
  listStudentAssessments: (token: string) => request<StudentAssessmentRecord[]>("/student/assessments", {}, token),
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
  // date ("YYYY-MM-DD") and time ("HH:mm") are the device's local wall clock,
  // which is what timetable periods are expressed in.
  getTeacherNudges: (token: string, date: string, time: string) =>
    request<TeacherNudge[]>(`/dashboard/teacher-nudges${toQueryString({ date, time })}`, {}, token),
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

  getAssistantMessages: (token: string) => request<AssistantMessage[]>("/ai-assistant/messages", {}, token),
  sendAssistantMessage: (token: string, text: string) =>
    request<{ userMessage: AssistantMessage; replies: AssistantMessage[] }>(
      "/ai-assistant/messages",
      { method: "POST", body: JSON.stringify({ text }) },
      token
    ),
  confirmAssistantAction: (token: string, actionId: string) =>
    request<Pick<AssistantAction, "id" | "status" | "resultText" | "resultLink">>(
      `/ai-assistant/actions/${actionId}/confirm`,
      { method: "POST" },
      token
    ),
  cancelAssistantAction: (token: string, actionId: string) =>
    request<{ id: string; status: AssistantActionStatus }>(`/ai-assistant/actions/${actionId}/cancel`, { method: "POST" }, token),
  clearAssistantMessages: (token: string) => request<{ cleared: boolean }>("/ai-assistant/messages", { method: "DELETE" }, token),

  // Public - no token needed, works before login too (e.g. Getting Started, Legal screens).
  getContentPage: (key: string) => request<ContentPage>(`/content-pages/${key}`),
  // Used only to detect "is the server reachable" for the offline banner -
  // no auth needed, and deliberately not routed through requestEnvelope's
  // retry/refresh logic since a health check has nothing to refresh.
  checkHealth: async (): Promise<boolean> => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    try {
      const response = await fetch(`${API_URL}/health`, { signal: controller.signal });
      return response.ok;
    } catch {
      return false;
    } finally {
      clearTimeout(timeout);
    }
  },

  getAttainmentReport: (token: string, topicId: string) =>
    request<AttainmentReportRecord>(`/topics/${topicId}/attainment-report`, {}, token),
  getSubjectAttainmentReport: (token: string, classSectionId: string, subject: string) =>
    request<SubjectAttainmentReport>(
      `/attainment-reports/roll-up?classSectionId=${encodeURIComponent(classSectionId)}&subject=${encodeURIComponent(subject)}`,
      {},
      token
    ),

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
