import { NavigationContainer, DefaultTheme, DarkTheme } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { RootStackParamList } from "./types";
import { useTheme } from "../theme/ThemeContext";
import { useAuth } from "../context/AuthContext";
import { EnrolmentTabNavigator } from "./EnrolmentTabNavigator";
import { TeacherTabNavigator } from "./TeacherTabNavigator";
import { StudentTabNavigator } from "./StudentTabNavigator";
import { NoAccessScreen } from "../screens/NoAccessScreen";
import { EnquiryDetailScreen } from "../screens/EnquiryDetailScreen";
import { NewEnquiryFormScreen } from "../screens/NewEnquiryFormScreen";
import { AdmissionConfirmationScreen } from "../screens/AdmissionConfirmationScreen";
import { BulkUploadScreen } from "../screens/BulkUploadScreen";
import { CreateAssignmentScreen } from "../screens/CreateAssignmentScreen";
import { AssignmentDetailScreen } from "../screens/AssignmentDetailScreen";
import { PersonalisationReviewScreen } from "../screens/PersonalisationReviewScreen";
import { GradingReviewScreen } from "../screens/GradingReviewScreen";

const Stack = createNativeStackNavigator<RootStackParamList>();

const ENROLMENT_MOBILE_ROLES = ["front_desk", "counsellor"];

// admin/leadership/platform_admin belong on the web Admin Dashboard, not this app -
// see the "Use the Admin Dashboard" screen. parent has no screens yet.
function MainTabs() {
  const { user } = useAuth();
  if (user?.role === "teacher") return <TeacherTabNavigator />;
  if (user?.role === "student") return <StudentTabNavigator />;
  if (user && ENROLMENT_MOBILE_ROLES.includes(user.role)) return <EnrolmentTabNavigator />;
  return <NoAccessScreen />;
}

export function AppNavigator() {
  const { colors, mode } = useTheme();

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
        screenOptions={{
          headerStyle: { backgroundColor: colors.surface },
          headerTintColor: colors.textPrimary,
          headerTitleStyle: { fontWeight: "700" },
        }}
      >
        <Stack.Screen name="MainTabs" component={MainTabs} options={{ headerShown: false }} />
        <Stack.Screen name="EnquiryDetail" component={EnquiryDetailScreen} options={{ title: "Enquiry" }} />
        <Stack.Screen name="NewEnquiryForm" component={NewEnquiryFormScreen} options={{ title: "New Enquiry" }} />
        <Stack.Screen
          name="AdmissionConfirmation"
          component={AdmissionConfirmationScreen}
          options={{ title: "Confirm Admission" }}
        />
        <Stack.Screen name="BulkUpload" component={BulkUploadScreen} options={{ title: "Bulk Upload" }} />
        <Stack.Screen name="CreateAssignment" component={CreateAssignmentScreen} options={{ title: "New Assignment" }} />
        <Stack.Screen name="AssignmentDetail" component={AssignmentDetailScreen} options={{ title: "Assignment" }} />
        <Stack.Screen
          name="PersonalisationReview"
          component={PersonalisationReviewScreen}
          options={{ title: "Personalisation Review" }}
        />
        <Stack.Screen name="GradingReview" component={GradingReviewScreen} options={{ title: "Grading Review" }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
