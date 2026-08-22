import { NavigatorScreenParams } from "@react-navigation/native";
import { AssignmentQuestion } from "../api/client";

// Root stack: the tab navigator (role-dependent) plus full-focus form/detail screens
// that push on top and hide the tab bar.
export type RootStackParamList = {
  MainTabs: NavigatorScreenParams<EnrolmentTabParamList | TeacherTabParamList | StudentTabParamList>;
  EnquiryDetail: { enquiryId: string };
  NewEnquiryForm: undefined;
  EditEnquiry: { enquiryId: string };
  AdmissionConfirmation: { enquiryId: string };
  BulkUpload: undefined;
  CreateAssignment: { topicId?: string } | undefined;
  AssignmentDetail: { assignmentId: string };
  PersonalisationReview: { assignmentId: string };
  GradingReview: { assignmentId: string };
  TopicList: { classSectionId: string; className: string; sectionName: string };
  TopicDetail: { topicId: string };
  GenerationSetup: { topicId: string };
  GenerationReview: { generationId: string };
  LessonWithAiTest: undefined;
  AnswerKeyReview: { assignmentId: string };
  AttainmentReport: { topicId: string };
  CommunicationHub: undefined;
  Notifications: undefined;
  StudentAssignmentSubmit: { assignmentId: string; questions: AssignmentQuestion[]; title: string };
};

// front_desk / counsellor / admin / leadership
export type EnrolmentTabParamList = {
  Home: undefined;
  Enquiries: undefined;
  Pipeline: undefined;
  Tasks: undefined;
  More: NavigatorScreenParams<MoreStackParamList>;
};

// teacher - "More" has nothing else to push to yet, so it's a direct screen, not a
// nested stack (unlike the enrolment tab set's More, which pushes to CSV Export).
export type TeacherTabParamList = {
  Home: undefined;
  Studio: undefined;
  Assignment: undefined;
  Analytics: undefined;
  More: undefined;
};

// student - functional per the client's AI Module Build Document (materials,
// assignment submission, results, messages), contested against the PRD's
// original "structural shell only" position - see PRD section 6.7.
export type StudentTabParamList = {
  Home: undefined;
  Materials: undefined;
  Results: undefined;
  Messages: undefined;
};

// Nested inside the enrolment "More" tab so CSV Export keeps that tab's bar visible when pushed.
export type MoreStackParamList = {
  MoreMenu: undefined;
  CsvExport: undefined;
};
