import { NavigationContainer, DefaultTheme, DarkTheme } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { RootStackParamList } from "./types";
import { useTheme } from "../theme/ThemeContext";
import { useAuth } from "../context/AuthContext";
import { EnrolmentTabNavigator } from "./EnrolmentTabNavigator";
import { TeacherTabNavigator } from "./TeacherTabNavigator";
import { EnquiryDetailScreen } from "../screens/EnquiryDetailScreen";
import { NewEnquiryFormScreen } from "../screens/NewEnquiryFormScreen";
import { AdmissionConfirmationScreen } from "../screens/AdmissionConfirmationScreen";

const Stack = createNativeStackNavigator<RootStackParamList>();

function MainTabs() {
  const { user } = useAuth();
  return user?.role === "teacher" ? <TeacherTabNavigator /> : <EnrolmentTabNavigator />;
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
      </Stack.Navigator>
    </NavigationContainer>
  );
}
