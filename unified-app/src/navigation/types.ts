import { NavigatorScreenParams } from "@react-navigation/native";
import { AssignmentQuestion } from "../api/client";

export type RootStackParamList = {
  MainTabs: NavigatorScreenParams<EnrolmentTabParamList | TeacherTabParamList | StudentTabParamList>;
  EnquiryDetail: { enquiryId: string };
  NewEnquiryForm: undefined;
  EditEnquiry: { enquiryId: string };
  AdmissionConfirmation: { enquiryId: string };
  BulkUpload: undefined;
  CreateAssignment: { topicId?: string; assignmentId?: string } | undefined;
  AssignmentAiSetup: { topicId: string };
  AssignmentDraftReview: { assignmentId: string };
  AssignmentDetail: { assignmentId: string };
  LogSubmission: { assignmentId: string };
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
  Profile: undefined;
  StudentAssignmentSubmit: { assignmentId: string; questions: AssignmentQuestion[]; title: string };
};

export type EnrolmentTabParamList = {
  Home: undefined;
  Enquiries: undefined;
  Pipeline: undefined;
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
};

export type MoreStackParamList = {
  MoreMenu: undefined;
  CsvExport: undefined;
};
