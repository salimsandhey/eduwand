import { NavigatorScreenParams } from "@react-navigation/native";
import { AssignmentQuestion, PresentationReason, PresentationDensity, StudentMaterial } from "../api/client";

export type RootStackParamList = {
  MainTabs: NavigatorScreenParams<EnrolmentTabParamList | TeacherTabParamList | StudentTabParamList>;
  EnquiryDetail: { enquiryId: string };
  NewEnquiryForm: undefined;
  EditEnquiry: { enquiryId: string };
  AdmissionConfirmation: { enquiryId: string };
  BulkUpload: undefined;
  CreateAssignment: { topicId?: string; assignmentId?: string } | undefined;
  AssignmentAiSetup: { topicId: string };
  AssignmentAiMultiSetup: undefined;
  AssignmentDraftReview: { assignmentId: string };
  AssignmentDetail: { assignmentId: string };
  LogSubmission: { assignmentId: string };
  PersonalisationReview: { assignmentId: string };
  GradingReview: { assignmentId: string };
  TopicList: { classSectionId: string; className: string; sectionName: string };
  TopicDetail: { topicId: string };
  GenerationSetup: { topicId: string };
  GenerationReview: { generationId: string };
  StudentMaterialDetail: { material: StudentMaterial };
  // New presentation flow (PPT guidelines.pdf) - reason -> classes/slides ->
  // density -> outline review -> GenerationReview (steps 5-9).
  PresentationReason: { topicId: string };
  PresentationClasses: { topicId: string; presentationReason: PresentationReason };
  PresentationDensity: { topicId: string; presentationReason: PresentationReason; presentationClasses: number; totalSlides: number };
  PresentationOutlineReview: { generationId: string };
  ImportContext: { topicId: string };
  ContextResearch: { topicId: string };
  AssessmentReady: { assessmentId: string };
  AssessmentCapture: { assessmentId: string };
  PresentLaunch: { assessmentId: string };
  AssessmentInsight: { assessmentId: string };
  LessonWithAiTest: undefined;
  AnswerKeyReview: { assignmentId: string };
  AttainmentReport:
    | { topicId: string }
    | { classSectionId: string; subject: string; className: string; sectionName: string };
  CommunicationHub: undefined;
  CommunicationChat:
    | {
        mode: "student";
        studentId: string;
        studentName: string;
        classLabel: string;
        // The student's picture for the header (optional: older callers omit it).
        studentAvatarKey?: string | null;
        studentPhotoMimeType?: string | null;
      }
    | { mode: "class"; classSectionId: string; classLabel: string };
  Notifications: undefined;
  Profile: undefined;
  HelpSupport: undefined;
  Pipeline: undefined;
  StudentAssignmentSubmit: { assignmentId: string; questions: AssignmentQuestion[]; title: string };
  CreateFirstClass: undefined;
  Credits: undefined;
  RequestSubjectChange: undefined;
  RequestClassChange: undefined;
  Students: undefined;
  AddStudent: undefined;
  StartNewAcademicYear: undefined;
  FormatTemplate: undefined;
  GettingStarted: undefined;
  Leaderboard: undefined;
  Timetable: undefined;
  // contentKey matches a ContentPage.key on the backend (privacy_policy,
  // terms_of_service, about) - one screen renders whichever it's given.
  // "contact" is NOT routed here - see Contact below.
  LegalDocument: { contentKey: string; title: string };
  // Purpose-built contact page (tappable email/phone/WhatsApp cards), reading
  // structured ContentPage.fields for key "contact" - not the plain-markdown
  // LegalDocument screen, since a contact page should look like one.
  Contact: undefined;
  // Students have no More/Profile tab (ProfileScreen calls /auth/me/*, which
  // 403s for students - they sign in via phone+OTP, not an AppUser row) - this
  // is their only way to reach Legal, Help & Support, and Log out.
  StudentSettings: undefined;
};

export type EnrolmentTabParamList = {
  Home: undefined;
  Enquiries: undefined;
  Analytics: undefined;
  Tasks: undefined;
  More: NavigatorScreenParams<MoreStackParamList>;
};

export type TeacherTabParamList = {
  Home: undefined;
  Studio: undefined;
  Assignment: undefined;
  Analytics: undefined;
  More: NavigatorScreenParams<MoreStackParamList>;
};

export type StudentTabParamList = {
  Home: undefined;
  Materials: undefined;
  Results: undefined;
  Messages: undefined;
  Profile: undefined;
};

export type MoreStackParamList = {
  MoreMenu: undefined;
  CsvExport: undefined;
};
