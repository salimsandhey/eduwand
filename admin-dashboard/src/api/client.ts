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

// FormData uploads (logo, etc.) - never set Content-Type ourselves, the
// browser sets it (with the multipart boundary) when it sees a FormData body.
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

export type EnquiryStatus = "new" | "contacted" | "visit_scheduled" | "visit_done" | "application" | "admitted" | "enrolled" | "lost";
export type EnquirySource = "phone" | "walk_in" | "website" | "referral" | "event" | "social";

export interface FunnelResponse {
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
  academicYearId?: string;
  [key: string]: string | undefined;
}

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

export interface ClassSectionTeacherAssignment {
  teacherUserId: string;
  teacher: { id: string; fullName: string; email: string };
}

export interface ClassSection {
  id: string;
  academicYearId: string;
  className: string;
  sectionName: string;
  teacherAssignments: ClassSectionTeacherAssignment[];
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

export interface Student {
  id: string;
  schoolId: string;
  sourceEnquiryId: string | null;
  fullName: string;
  dateOfBirth: string;
  classSectionId: string;
  guardianName: string;
  guardianContact: string;
  // The student's own sign-in email; null for students added before email login.
  email: string | null;
  admissionDate: string;
  feeStatus: string;
  // The physical clicker DEVICE_ID this student answers with in a live
  // Present session - null if not assigned one.
  seatNumber: number | null;
}

export interface CreateStudentInput {
  fullName: string;
  dateOfBirth: string;
  classSectionId: string;
  guardianName: string;
  guardianContact: string;
  email: string;
  admissionDate?: string;
  feeStatus?: string;
}

export interface UpdateStudentInput {
  fullName?: string;
  dateOfBirth?: string;
  classSectionId?: string;
  guardianName?: string;
  guardianContact?: string;
  email?: string;
  feeStatus?: string;
  seatNumber?: number | null;
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
  copyFromAcademicYearId?: string;
}

export interface CreateClassSectionInput {
  academicYearId: string;
  className: string;
  sectionName: string;
}

export interface BulkCreateClassSectionsInput {
  academicYearId: string;
  classNames: string[];
  sectionNames: string[];
}

export interface BulkCreateClassSectionsResult {
  created: ClassSection[];
  skipped: number;
}

export type SchoolFormatTemplateAppliesTo = "generation" | "attainment_report";

export interface SchoolFormatTemplate {
  id: string;
  schoolId: string;
  appliesTo: SchoolFormatTemplateAppliesTo;
  templateBody: string;
  createdAt: string;
  updatedAt: string;
}

export interface SchoolFormatTemplates {
  generation: SchoolFormatTemplate | null;
  attainmentReport: SchoolFormatTemplate | null;
}

export interface SchoolBranding {
  logoUrl: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
}

export interface Subject {
  id: string;
  schoolId: string;
  name: string;
  createdAt: string;
}

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

export type MessageChannel = "sms" | "email";

export type GenerationOutputType = "lesson_plan" | "custom_activity_report" | "flashcards" | "presentation";

export interface AiPromptTemplate {
  outputType: GenerationOutputType;
  promptBody: string;
  defaultPromptBody: string;
  isCustom: boolean;
  updatedAt: string | null;
}

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
  planId: string | null;
  plan: Plan | null;
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
  accountType: string;
  classLimit: number | null;
  subjectLimit: number | null;
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
  planId?: string | null;
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
  classLimit?: number | null;
  subjectLimit?: number | null;
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
  teacher: { fullName: string; email: string };
  school: { name: string };
}

export interface Plan {
  id: string;
  name: string;
  creditsPerTeacherSeat: number;
  teacherSeatLimit: number;
  isDefault: boolean;
}

export interface CreatePlanInput {
  name: string;
  creditsPerTeacherSeat: number;
  teacherSeatLimit: number;
  isDefault?: boolean;
}

export interface UpdatePlanInput {
  name?: string;
  teacherSeatLimit?: number;
  creditsPerTeacherSeat?: number;
  isDefault?: boolean;
}

// Backend AiFeature row - what one AI action costs teachers and how the
// mobile Credits screen names it. icon is an Ionicons glyph name.
export interface AiFeature {
  id: string;
  key: string;
  label: string;
  description: string;
  icon: string;
  cost: number;
  showOnCredits: boolean;
  sortOrder: number;
  updatedAt: string;
}

export interface PlatformSetting {
  id: string;
  key: string;
  value: string;
  updatedAt: string;
}

// key is one of: privacy_policy, terms_of_service, about, contact - see
// ContentPage in schema.prisma. Reads are public; writes need platform_admin.
export interface ContentPage {
  id: string;
  key: string;
  title: string;
  bodyMarkdown: string;
  // Only meaningful for "contact" today ({ email, phone, whatsapp?, address,
  // hours? }) - every client renders those as cards instead of the markdown
  // body when present.
  fields: Record<string, string> | null;
  version: number;
  updatedAt: string;
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
  teacher: { fullName: string; email: string };
  school: { name: string };
}

// status is one of: pending, approved, rejected
export interface BoardChangeTicket {
  id: string;
  schoolId: string;
  currentBoard: string;
  requestedBoard: string;
  status: string;
  raisedByUserId: string;
  decidedAt: string | null;
  note: string | null;
  createdAt: string;
  school: { name: string; accountType: string };
  raisedBy: { fullName: string; email: string };
}

export interface UpdateUserInput {
  role?: string;
  status?: string;
  schoolId?: string;
}

export interface UserRoleGrant {
  id: string;
  role: string;
  createdAt: string;
}

export type FormDefinitionPurpose = "enquiry_intake" | "admission_detail" | "document_checklist";
export type FormFieldType = "text" | "number" | "date" | "select" | "multiselect" | "checkbox" | "textarea" | "file";

export interface FormDefinition {
  id: string;
  schoolId: string;
  purpose: FormDefinitionPurpose;
  name: string;
  isActive: boolean;
  createdBy: string;
  updatedBy: string;
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

export interface CreateFormDefinitionInput {
  purpose: FormDefinitionPurpose;
  name: string;
  isActive?: boolean;
}

export interface UpdateFormDefinitionInput {
  name?: string;
  isActive?: boolean;
}

export interface CreateFormFieldInput {
  key: string;
  label: string;
  fieldType: FormFieldType;
  options?: unknown;
  order?: number;
  isRequired?: boolean;
  requiredAtStage?: string | null;
}

export interface UpdateFormFieldInput {
  key?: string;
  label?: string;
  fieldType?: FormFieldType;
  options?: unknown;
  order?: number;
  isRequired?: boolean;
  requiredAtStage?: string | null;
}

// Public, unauthenticated - used by the /join/:code landing page. Not part
// of the `api` object since every method there takes a token.
export interface ClassJoinInfo {
  className: string;
  sectionName: string;
  schoolName: string;
  teacherName: string | null;
}

export function publicGetClassJoinInfo(joinCode: string) {
  return request<ClassJoinInfo>(`/public/class-sections/${joinCode}`);
}

export function publicSubmitClassJoinRequest(
  joinCode: string,
  input: { studentName: string; dateOfBirth: string; guardianName: string; guardianContact: string; studentEmail?: string }
) {
  return request<{ id: string; status: string }>(`/public/class-sections/${joinCode}/join-requests`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

// Public, unauthenticated - used by the /present/:code Display and Control
// pages. A classroom device never logs in; the short-lived code (from the
// teacher's "Present on a screen" action in the app) stands in for auth,
// same trust model as the join code above.
export interface PresentQuestion {
  id: string;
  prompt: string;
  options: string[];
  correctOptionIndex: number;
}

export interface PresentResponse {
  questionId: string;
  studentStubId: string;
  // Null on a doubt response ("not sure") - see isDoubt.
  selectedOptionIndex: number | null;
  isCorrect: boolean | null;
  isDoubt: boolean;
}

export interface PresentRosterEntry {
  studentStubId: string;
  fullName: string;
  seatNumber: number | null;
}

// What the Control page gets: full roster identity plus exactly what each
// student chose - this is what the teacher taps from, so it has to know who
// is who. Requested with ?role=control; never sent to the Display page.
export interface PresentControlState {
  assessmentId: string;
  title: string;
  status: string;
  questions: PresentQuestion[];
  currentQuestionIndex: number;
  currentQuestionRevealed: boolean;
  responses: PresentResponse[];
  roster: PresentRosterEntry[];
}

// What the Display (projector/classroom-screen) page gets: aggregate counts
// for the current question and a per-seat answered flag - never a name,
// never which option a student picked. A real payload-level guarantee, not
// just a UI choice - the backend never sends the identified shape here.
export interface PresentDisplayState {
  assessmentId: string;
  title: string;
  status: string;
  questions: PresentQuestion[];
  currentQuestionIndex: number;
  currentQuestionRevealed: boolean;
  totalStudents: number;
  answeredCount: number;
  counts: { correct: number; incorrect: number; doubt: number };
  seats: { seatNumber: number | null; answered: boolean }[];
}

// The Control page is opened from the teacher's app with the session's control
// key in the URL fragment (#k=...). Only that key lets a device change the
// session - the code shown on the projector is watch-only.
let presentControlKey: string | undefined;
export function setPresentControlKey(key: string | undefined) {
  presentControlKey = key;
}
function presentKeyHeaders(): Record<string, string> {
  return presentControlKey ? { "X-Present-Key": presentControlKey } : {};
}

export function publicGetPresentState(code: string, role: "control" | "display"): Promise<PresentControlState | PresentDisplayState> {
  return request(`/present/${code}?role=${role}`, { headers: role === "control" ? presentKeyHeaders() : {} });
}

export function publicRecordPresentResponse(
  code: string,
  input: { questionId: string; studentStubId: string; selectedOptionIndex?: number; isDoubt?: boolean }
) {
  return request<PresentControlState>(`/present/${code}/responses`, { method: "POST", body: JSON.stringify(input), headers: presentKeyHeaders() });
}

export function publicAdvancePresentQuestion(code: string, direction: "next" | "prev") {
  return request<PresentControlState>(`/present/${code}/advance`, { method: "POST", body: JSON.stringify({ direction }), headers: presentKeyHeaders() });
}

export function publicRevealPresentAnswer(code: string) {
  return request<PresentControlState>(`/present/${code}/reveal`, { method: "POST", headers: presentKeyHeaders() });
}

export function publicEndPresentSession(code: string) {
  return request<{ ended: boolean }>(`/present/${code}/end`, { method: "POST", headers: presentKeyHeaders() });
}

export function getPresentSocketUrl(code: string, role: "control" | "display"): string {
  const key = role === "control" && presentControlKey ? `&key=${encodeURIComponent(presentControlKey)}` : "";
  return `${API_URL.replace(/^http/, "ws")}/realtime?presentCode=${encodeURIComponent(code)}&role=${role}${key}`;
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
  getTrend: (token: string, params: { months?: number; schoolId?: string; academicYearId?: string } = {}) =>
    request<TrendResponse>(
      `/analytics/enrolment/trend${toQueryString({
        months: params.months !== undefined ? String(params.months) : undefined,
        schoolId: params.schoolId,
        academicYearId: params.academicYearId,
      })}`,
      {},
      token
    ),

  getAiUsage: (token: string, params: { schoolId?: string } = {}) =>
    request<AiUsageResponse>(`/analytics/ai/usage${toQueryString(params)}`, {}, token),

  listPlans: (token: string) => request<Plan[]>("/plans", {}, token),
  createPlan: (token: string, input: CreatePlanInput) =>
    request<Plan>("/plans", { method: "POST", body: JSON.stringify(input) }, token),
  updatePlan: (token: string, id: string, input: UpdatePlanInput) =>
    request<Plan>(`/plans/${id}`, { method: "PATCH", body: JSON.stringify(input) }, token),

  listPlatformSettings: (token: string) => request<PlatformSetting[]>("/platform-settings", {}, token),
  updatePlatformSetting: (token: string, key: string, value: string) =>
    request<PlatformSetting>(`/platform-settings/${key}`, { method: "PUT", body: JSON.stringify({ value }) }, token),
  listAiFeatures: (token: string) => request<AiFeature[]>("/ai-features", {}, token),
  updateAiFeature: (
    token: string,
    key: string,
    input: Partial<Pick<AiFeature, "label" | "description" | "cost" | "showOnCredits" | "sortOrder">>
  ) => request<AiFeature>(`/ai-features/${key}`, { method: "PATCH", body: JSON.stringify(input) }, token),

  // Public - no token needed, works for a logged-out reviewer or App Store crawler.
  listContentPages: () => request<ContentPage[]>("/content-pages"),
  getContentPage: (key: string) => request<ContentPage>(`/content-pages/${key}`),
  updateContentPage: (token: string, key: string, input: { title?: string; bodyMarkdown: string; fields?: Record<string, string> | null }) =>
    request<ContentPage>(`/content-pages/${key}`, { method: "PUT", body: JSON.stringify(input) }, token),

  getTeacherCredits: (token: string, teacherUserId: string) =>
    request<CreditAccountSummary>(`/teachers/${teacherUserId}/credits`, {}, token),
  topUpTeacherCredits: (token: string, teacherUserId: string, input: { amount: number; note?: string }) =>
    request<{ balance: number }>(`/teachers/${teacherUserId}/credit-topup`, { method: "POST", body: JSON.stringify(input) }, token),

  listSubjectChangeRequests: (token: string, params: { status?: string } = {}) =>
    request<SubjectChangeRequest[]>(`/admin/subject-change-requests${toQueryString(params)}`, {}, token),
  decideSubjectChangeRequest: (token: string, id: string, input: { decision: "approved" | "rejected"; note?: string }) =>
    request<SubjectChangeRequest>(`/admin/subject-change-requests/${id}`, { method: "PATCH", body: JSON.stringify(input) }, token),

  listClassChangeRequests: (token: string, params: { status?: string } = {}) =>
    request<ClassChangeRequest[]>(`/admin/class-change-requests${toQueryString(params)}`, {}, token),
  decideClassChangeRequest: (token: string, id: string, input: { decision: "approved" | "rejected"; note?: string }) =>
    request<ClassChangeRequest>(`/admin/class-change-requests/${id}`, { method: "PATCH", body: JSON.stringify(input) }, token),

  listBoardChangeTickets: (token: string, params: { status?: string } = {}) =>
    request<BoardChangeTicket[]>(`/admin/board-change-tickets${toQueryString(params)}`, {}, token),
  decideBoardChangeTicket: (token: string, id: string, input: { decision: "approved" | "rejected"; note?: string }) =>
    request<BoardChangeTicket>(`/admin/board-change-tickets/${id}`, { method: "PATCH", body: JSON.stringify(input) }, token),
  createBoardChangeTicket: (token: string, schoolId: string, input: { requestedBoard: string; note?: string }) =>
    request<BoardChangeTicket>(`/schools/${schoolId}/board-change-tickets`, { method: "POST", body: JSON.stringify(input) }, token),

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
  listUserRoleGrants: (token: string, id: string) =>
    request<UserRoleGrant[]>(`/users/${id}/role-grants`, {}, token),
  addUserRoleGrant: (token: string, id: string, input: { role: string }) =>
    requestEnvelope<UserRoleGrant>(`/users/${id}/role-grants`, { method: "POST", body: JSON.stringify(input) }, token),
  removeUserRoleGrant: (token: string, id: string, grantId: string) =>
    request<{ id: string }>(`/users/${id}/role-grants/${grantId}`, { method: "DELETE" }, token),

  // schoolId is required here (unlike the /schools/:schoolId/* nested routes)
  // because /students is a flat route scoped by the generic requireSchoolScope
  // plugin - a school-scoped user's JWT already carries it, but platform_admin
  // and leadership have none and must pass it explicitly as a query param.
  listStudents: (token: string, schoolId: string, params: { classSectionId?: string; page?: number; pageSize?: number } = {}) =>
    request<Student[]>(
      `/students${toQueryString({
        schoolId,
        classSectionId: params.classSectionId,
        page: params.page ? String(params.page) : undefined,
        pageSize: params.pageSize ? String(params.pageSize) : undefined,
      })}`,
      {},
      token
    ),
  createStudent: (token: string, schoolId: string, input: CreateStudentInput) =>
    requestEnvelope<Student>(`/students${toQueryString({ schoolId })}`, { method: "POST", body: JSON.stringify(input) }, token),
  updateStudent: (token: string, schoolId: string, id: string, input: UpdateStudentInput) =>
    request<Student>(`/students/${id}${toQueryString({ schoolId })}`, { method: "PATCH", body: JSON.stringify(input) }, token),

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
  bulkCreateClassSections: (token: string, schoolId: string, input: BulkCreateClassSectionsInput) =>
    request<BulkCreateClassSectionsResult>(
      `/schools/${schoolId}/class-sections/bulk`,
      { method: "POST", body: JSON.stringify(input) },
      token
    ),
  assignClassSectionTeacher: (token: string, schoolId: string, classSectionId: string, teacherUserId: string) =>
    request<ClassSectionTeacherAssignment>(
      `/schools/${schoolId}/class-sections/${classSectionId}/teachers`,
      { method: "POST", body: JSON.stringify({ teacherUserId }) },
      token
    ),
  unassignClassSectionTeacher: (token: string, schoolId: string, classSectionId: string, teacherUserId: string) =>
    request<{ deleted: boolean }>(
      `/schools/${schoolId}/class-sections/${classSectionId}/teachers/${teacherUserId}`,
      { method: "DELETE" },
      token
    ),

  getSchoolFormatTemplates: (token: string, schoolId: string) =>
    request<SchoolFormatTemplates>(`/schools/${schoolId}/format-templates`, {}, token),
  saveSchoolFormatTemplate: (token: string, schoolId: string, appliesTo: SchoolFormatTemplateAppliesTo, templateBody: string) =>
    request<SchoolFormatTemplate>(
      `/schools/${schoolId}/format-templates/${appliesTo}`,
      { method: "PUT", body: JSON.stringify({ templateBody }) },
      token
    ),
  deleteSchoolFormatTemplate: (token: string, schoolId: string, appliesTo: SchoolFormatTemplateAppliesTo) =>
    request<{ deleted: boolean }>(`/schools/${schoolId}/format-templates/${appliesTo}`, { method: "DELETE" }, token),

  getSchoolBranding: (token: string, schoolId: string) => request<SchoolBranding>(`/schools/${schoolId}/branding`, {}, token),
  saveSchoolBranding: (
    token: string,
    schoolId: string,
    input: { logoFile?: File; primaryColor?: string; secondaryColor?: string }
  ) => {
    const formData = new FormData();
    if (input.logoFile) formData.append("logo", input.logoFile);
    if (input.primaryColor) formData.append("primaryColor", input.primaryColor);
    if (input.secondaryColor) formData.append("secondaryColor", input.secondaryColor);
    return requestMultipart<SchoolBranding>(`/schools/${schoolId}/branding`, formData, token);
  },

  listTimetableSlots: (token: string, schoolId: string, teacherUserId: string) =>
    request<TimetableSlot[]>(`/schools/${schoolId}/timetable-slots${toQueryString({ teacherUserId })}`, {}, token),
  createTimetableSlot: (token: string, schoolId: string, input: TimetableSlotInput) =>
    request<TimetableSlot>(`/schools/${schoolId}/timetable-slots`, { method: "POST", body: JSON.stringify(input) }, token),
  updateTimetableSlot: (token: string, schoolId: string, slotId: string, input: Partial<TimetableSlotInput>) =>
    request<TimetableSlot>(`/schools/${schoolId}/timetable-slots/${slotId}`, { method: "PATCH", body: JSON.stringify(input) }, token),
  deleteTimetableSlot: (token: string, schoolId: string, slotId: string) =>
    request<{ id: string }>(`/schools/${schoolId}/timetable-slots/${slotId}`, { method: "DELETE" }, token),

  listSubjectsForSchool: (token: string, schoolId: string) =>
    request<Subject[]>(`/schools/${schoolId}/subjects`, {}, token),
  createSubject: (token: string, schoolId: string, name: string) =>
    request<Subject>(`/schools/${schoolId}/subjects`, { method: "POST", body: JSON.stringify({ name }) }, token),
  deleteSubject: (token: string, schoolId: string, subjectId: string) =>
    request<{ deleted: boolean }>(`/schools/${schoolId}/subjects/${subjectId}`, { method: "DELETE" }, token),

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

  listAiPrompts: (token: string) => request<AiPromptTemplate[]>("/ai-prompts", {}, token),
  updateAiPrompt: (token: string, outputType: GenerationOutputType, promptBody: string) =>
    request<AiPromptTemplate>(`/ai-prompts/${outputType}`, { method: "PUT", body: JSON.stringify({ promptBody }) }, token),
  resetAiPrompt: (token: string, outputType: GenerationOutputType) =>
    request<AiPromptTemplate>(`/ai-prompts/${outputType}`, { method: "DELETE" }, token),

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

  getFormDefinition: (token: string, purpose: FormDefinitionPurpose, params: { schoolId?: string } = {}) =>
    request<FormDefinitionWithFields>(`/form-definitions${toQueryString({ purpose, ...params })}`, {}, token),
  createFormDefinition: (token: string, input: CreateFormDefinitionInput, params: { schoolId?: string } = {}) =>
    request<FormDefinition>(`/form-definitions${toQueryString(params)}`, { method: "POST", body: JSON.stringify(input) }, token),
  updateFormDefinition: (token: string, id: string, input: UpdateFormDefinitionInput, params: { schoolId?: string } = {}) =>
    request<FormDefinition>(`/form-definitions/${id}${toQueryString(params)}`, { method: "PATCH", body: JSON.stringify(input) }, token),
  addFormField: (token: string, definitionId: string, input: CreateFormFieldInput, params: { schoolId?: string } = {}) =>
    request<FormField>(`/form-definitions/${definitionId}/fields${toQueryString(params)}`, { method: "POST", body: JSON.stringify(input) }, token),
  updateFormField: (
    token: string,
    definitionId: string,
    fieldId: string,
    input: UpdateFormFieldInput,
    params: { schoolId?: string } = {}
  ) =>
    request<FormField>(
      `/form-definitions/${definitionId}/fields/${fieldId}${toQueryString(params)}`,
      { method: "PATCH", body: JSON.stringify(input) },
      token
    ),
  deleteFormField: (token: string, definitionId: string, fieldId: string, params: { schoolId?: string } = {}) =>
    request<{ id: string }>(`/form-definitions/${definitionId}/fields/${fieldId}${toQueryString(params)}`, { method: "DELETE" }, token),
  reorderFormFields: (token: string, definitionId: string, fieldIds: string[], params: { schoolId?: string } = {}) =>
    request<FormField[]>(
      `/form-definitions/${definitionId}/fields/reorder${toQueryString(params)}`,
      { method: "PATCH", body: JSON.stringify({ fieldIds }) },
      token
    ),
};
