import { Pressable } from "react-native";
import { NavigationContainer, DefaultTheme, DarkTheme } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { RootStackParamList } from "./types";
import { useTheme } from "../theme/ThemeContext";
import { useAuth } from "../context/AuthContext";
import { EnrolmentTabNavigator } from "./EnrolmentTabNavigator";
import { TeacherTabNavigator } from "./TeacherTabNavigator";
import { StudentTabNavigator } from "./StudentTabNavigator";
import { NoAccessScreen } from "../screens/auth/NoAccessScreen";
import { EnquiryDetailScreen } from "../screens/enrolment/EnquiryDetailScreen";
import { NewEnquiryFormScreen } from "../screens/enrolment/NewEnquiryFormScreen";
import { CreateFirstClassScreen } from "../screens/studio/CreateFirstClassScreen";
import { CreditsScreen } from "../screens/studio/CreditsScreen";
import { RequestSubjectChangeScreen } from "../screens/studio/RequestSubjectChangeScreen";
import { RequestClassChangeScreen } from "../screens/studio/RequestClassChangeScreen";
import { StudentsScreen } from "../screens/studio/StudentsScreen";
import { AddStudentScreen } from "../screens/studio/AddStudentScreen";
import { StartNewAcademicYearScreen } from "../screens/studio/StartNewAcademicYearScreen";
import { FormatTemplateScreen } from "../screens/studio/FormatTemplateScreen";
import { GettingStartedScreen } from "../screens/studio/GettingStartedScreen";
import { LeaderboardScreen } from "../screens/studio/LeaderboardScreen";
import { TimetableScreen } from "../screens/studio/TimetableScreen";
import { EditEnquiryScreen } from "../screens/enrolment/EditEnquiryScreen";
import { AdmissionConfirmationScreen } from "../screens/enrolment/AdmissionConfirmationScreen";
import { BulkUploadScreen } from "../screens/enrolment/BulkUploadScreen";
import { CreateAssignmentScreen } from "../screens/assignments/CreateAssignmentScreen";
import { AssignmentAiSetupScreen } from "../screens/assignments/AssignmentAiSetupScreen";
import { AssignmentAiMultiSetupScreen } from "../screens/assignments/AssignmentAiMultiSetupScreen";
import { AssignmentDraftReviewScreen } from "../screens/assignments/AssignmentDraftReviewScreen";
import { AssignmentDetailScreen } from "../screens/assignments/AssignmentDetailScreen";
import { LogSubmissionScreen } from "../screens/assignments/LogSubmissionScreen";
import { PersonalisationReviewScreen } from "../screens/studio/PersonalisationReviewScreen";
import { GradingReviewScreen } from "../screens/assignments/GradingReviewScreen";
import { TopicListScreen } from "../screens/studio/TopicListScreen";
import { TopicDetailScreen } from "../screens/studio/TopicDetailScreen";
import { GenerationSetupScreen } from "../screens/studio/GenerationSetupScreen";
import { GenerationReviewScreen } from "../screens/studio/GenerationReviewScreen";
import { StudentMaterialDetailScreen } from "../screens/student/StudentMaterialDetailScreen";
import { PresentationReasonScreen } from "../screens/studio/PresentationReasonScreen";
import { PresentationClassesScreen } from "../screens/studio/PresentationClassesScreen";
import { PresentationDensityScreen } from "../screens/studio/PresentationDensityScreen";
import { PresentationOutlineReviewScreen } from "../screens/studio/PresentationOutlineReviewScreen";
import { ImportContextScreen } from "../screens/studio/ImportContextScreen";
import { ContextResearchScreen } from "../screens/studio/ContextResearchScreen";
import { AssessmentReadyScreen } from "../screens/studio/AssessmentReadyScreen";
import { AssessmentCaptureScreen } from "../screens/studio/AssessmentCaptureScreen";
import { AssessmentInsightScreen } from "../screens/studio/AssessmentInsightScreen";
import { PresentLaunchScreen } from "../screens/studio/PresentLaunchScreen";
import { LessonWithAiTestScreen } from "../screens/studio/LessonWithAiTestScreen";
import { AnswerKeyReviewScreen } from "../screens/studio/AnswerKeyReviewScreen";
import { AttainmentReportScreen } from "../screens/analytics/AttainmentReportScreen";
import { CommunicationHubScreen } from "../screens/enrolment/CommunicationHubScreen";
import { CommunicationChatScreen } from "../screens/enrolment/CommunicationChatScreen";
import { NotificationScreen } from "../screens/shared/NotificationScreen";
import { ProfileScreen } from "../screens/shared/ProfileScreen";
import { HelpSupportScreen } from "../screens/shared/HelpSupportScreen";
import { LegalDocumentScreen } from "../screens/shared/LegalDocumentScreen";
import { ContactScreen } from "../screens/shared/ContactScreen";
import { StudentSettingsScreen } from "../screens/student/StudentSettingsScreen";
import { PipelineBoardScreen } from "../screens/enrolment/PipelineBoardScreen";
import { StudentAssignmentSubmitScreen } from "../screens/student/StudentAssignmentSubmitScreen";

const Stack = createNativeStackNavigator<RootStackParamList>();

const ENROLMENT_MOBILE_ROLES = ["front_desk", "counsellor"];

function HomeHeaderButton({ navigation, colors, pressedOpacity }: { navigation: any; colors: ReturnType<typeof useTheme>["colors"]; pressedOpacity: number }) {
  return (
    <Pressable
      onPress={() => navigation.navigate("MainTabs", { screen: "Home" })}
      hitSlop={10}
      style={({ pressed }) => [{ opacity: pressed ? pressedOpacity : 1 }]}
      accessibilityRole="button"
      accessibilityLabel="Go to home"
    >
      <Ionicons name="home-outline" size={22} color={colors.accent} />
    </Pressable>
  );
}

function MainTabs() {
  const { user } = useAuth();
  if (user?.role === "teacher") return <TeacherTabNavigator />;
  if (user?.role === "student") return <StudentTabNavigator />;
  if (user && ENROLMENT_MOBILE_ROLES.includes(user.role)) return <EnrolmentTabNavigator />;
  return <NoAccessScreen />;
}

export function AppNavigator() {
  const { colors, mode, pressedOpacity } = useTheme();

  const navTheme = {
    ...(mode === "dark" ? DarkTheme : DefaultTheme),
    colors: {
      ...(mode === "dark" ? DarkTheme.colors : DefaultTheme.colors),
      background: colors.background,
      card: colors.surface,
      text: colors.textPrimary,
      border: colors.border,
      primary: colors.accent,
    },
  };

  return (
    <NavigationContainer theme={navTheme}>
      <Stack.Navigator
        screenOptions={({ navigation }) => ({
          headerStyle: { backgroundColor: colors.surface },
          headerTintColor: colors.textPrimary,
          headerTitleStyle: { fontWeight: "700" },
          headerBackButtonDisplayMode: "minimal",
          headerRight: () => <HomeHeaderButton navigation={navigation} colors={colors} pressedOpacity={pressedOpacity} />,
        })}
      >
        <Stack.Screen name="MainTabs" component={MainTabs} options={{ headerShown: false }} />
        <Stack.Screen name="EnquiryDetail" component={EnquiryDetailScreen} options={{ title: "Enquiry" }} />
        <Stack.Screen name="NewEnquiryForm" component={NewEnquiryFormScreen} options={{ title: "New Enquiry" }} />
        <Stack.Screen name="EditEnquiry" component={EditEnquiryScreen} options={{ title: "Edit Lead" }} />
        <Stack.Screen
          name="AdmissionConfirmation"
          component={AdmissionConfirmationScreen}
          options={{ title: "Confirm Admission" }}
        />
        <Stack.Screen name="BulkUpload" component={BulkUploadScreen} options={{ title: "Bulk Upload" }} />
        <Stack.Screen name="CreateAssignment" component={CreateAssignmentScreen} options={{ title: "New Assignment" }} />
        <Stack.Screen name="AssignmentAiSetup" component={AssignmentAiSetupScreen} options={{ headerShown: false }} />
        <Stack.Screen name="AssignmentAiMultiSetup" component={AssignmentAiMultiSetupScreen} options={{ headerShown: false }} />
        <Stack.Screen name="AssignmentDraftReview" component={AssignmentDraftReviewScreen} options={{ title: "Review Draft" }} />
        <Stack.Screen name="AssignmentDetail" component={AssignmentDetailScreen} options={{ headerShown: false, gestureEnabled: false }} />
        <Stack.Screen name="LogSubmission" component={LogSubmissionScreen} options={{ title: "Log Submission" }} />
        <Stack.Screen
          name="PersonalisationReview"
          component={PersonalisationReviewScreen}
          options={{ title: "Personalisation Review" }}
        />
        <Stack.Screen name="GradingReview" component={GradingReviewScreen} options={{ title: "Grading Review" }} />
        <Stack.Screen
          name="TopicList"
          component={TopicListScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen name="TopicDetail" component={TopicDetailScreen} options={{ headerShown: false }} />
        <Stack.Screen name="GenerationSetup" component={GenerationSetupScreen} options={{ headerShown: false }} />
        <Stack.Screen name="GenerationReview" component={GenerationReviewScreen} options={{ headerShown: false }} />
        <Stack.Screen name="StudentMaterialDetail" component={StudentMaterialDetailScreen} options={{ headerShown: false }} />
        <Stack.Screen name="PresentationReason" component={PresentationReasonScreen} options={{ headerShown: false }} />
        <Stack.Screen name="PresentationClasses" component={PresentationClassesScreen} options={{ headerShown: false }} />
        <Stack.Screen name="PresentationDensity" component={PresentationDensityScreen} options={{ headerShown: false }} />
        <Stack.Screen name="PresentationOutlineReview" component={PresentationOutlineReviewScreen} options={{ headerShown: false }} />
        <Stack.Screen name="ImportContext" component={ImportContextScreen} options={{ headerShown: false }} />
        <Stack.Screen name="ContextResearch" component={ContextResearchScreen} options={{ headerShown: false }} />
        <Stack.Screen name="AssessmentReady" component={AssessmentReadyScreen} options={{ headerShown: false }} />
        <Stack.Screen name="AssessmentCapture" component={AssessmentCaptureScreen} options={{ headerShown: false, gestureEnabled: false }} />
        <Stack.Screen name="PresentLaunch" component={PresentLaunchScreen} options={{ headerShown: false, gestureEnabled: false }} />
        <Stack.Screen name="AssessmentInsight" component={AssessmentInsightScreen} options={{ headerShown: false }} />
        <Stack.Screen name="LessonWithAiTest" component={LessonWithAiTestScreen} options={{ headerShown: false }} />
        <Stack.Screen name="AnswerKeyReview" component={AnswerKeyReviewScreen} options={{ title: "Answer Key" }} />
        <Stack.Screen name="AttainmentReport" component={AttainmentReportScreen} options={{ headerShown: false }} />
        <Stack.Screen name="CommunicationHub" component={CommunicationHubScreen} options={{ headerShown: false }} />
        <Stack.Screen name="CommunicationChat" component={CommunicationChatScreen} options={{ headerShown: false }} />
        <Stack.Screen name="Notifications" component={NotificationScreen} options={{ title: "Notifications" }} />
        <Stack.Screen name="Profile" component={ProfileScreen} options={{ title: "Edit Profile" }} />
        <Stack.Screen name="HelpSupport" component={HelpSupportScreen} options={{ title: "Help & Support" }} />
        <Stack.Screen
          name="LegalDocument"
          component={LegalDocumentScreen}
          options={({ route }) => ({ title: route.params.title })}
        />
        <Stack.Screen name="StudentSettings" component={StudentSettingsScreen} options={{ title: "Settings" }} />
        <Stack.Screen name="Contact" component={ContactScreen} options={{ title: "Contact Us" }} />
        <Stack.Screen name="Pipeline" component={PipelineBoardScreen} options={{ headerShown: false }} />
        <Stack.Screen
          name="StudentAssignmentSubmit"
          component={StudentAssignmentSubmitScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen name="CreateFirstClass" component={CreateFirstClassScreen} options={{ headerShown: false }} />
        <Stack.Screen name="Credits" component={CreditsScreen} options={{ headerShown: false }} />
        <Stack.Screen name="RequestSubjectChange" component={RequestSubjectChangeScreen} options={{ headerShown: false }} />
        <Stack.Screen name="RequestClassChange" component={RequestClassChangeScreen} options={{ headerShown: false }} />
        <Stack.Screen name="Students" component={StudentsScreen} options={{ headerShown: false }} />
        <Stack.Screen name="AddStudent" component={AddStudentScreen} options={{ headerShown: false }} />
        <Stack.Screen name="StartNewAcademicYear" component={StartNewAcademicYearScreen} options={{ headerShown: false }} />
        <Stack.Screen name="FormatTemplate" component={FormatTemplateScreen} options={{ headerShown: false }} />
        <Stack.Screen name="GettingStarted" component={GettingStartedScreen} options={{ headerShown: false }} />
        <Stack.Screen name="Leaderboard" component={LeaderboardScreen} options={{ headerShown: false }} />
        <Stack.Screen name="Timetable" component={TimetableScreen} options={{ headerShown: false }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
