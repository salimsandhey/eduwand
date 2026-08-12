import { NavigatorScreenParams } from "@react-navigation/native";

// Root stack: the tab navigator (role-dependent) plus full-focus form/detail screens
// that push on top and hide the tab bar.
export type RootStackParamList = {
  MainTabs: NavigatorScreenParams<EnrolmentTabParamList | TeacherTabParamList>;
  EnquiryDetail: { enquiryId: string };
  NewEnquiryForm: undefined;
  AdmissionConfirmation: { enquiryId: string };
  BulkUpload: undefined;
  CreateAssignment: undefined;
  AssignmentDetail: { assignmentId: string };
  PersonalisationReview: { assignmentId: string };
  GradingReview: { assignmentId: string };
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

// Nested inside the enrolment "More" tab so CSV Export keeps that tab's bar visible when pushed.
export type MoreStackParamList = {
  MoreMenu: undefined;
  CsvExport: undefined;
};
