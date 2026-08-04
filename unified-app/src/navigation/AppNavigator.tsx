import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { RootStackParamList } from "./types";
import { theme } from "../theme";
import { HomeScreen } from "../screens/HomeScreen";
import { EnquiryListScreen } from "../screens/EnquiryListScreen";
import { NewEnquiryFormScreen } from "../screens/NewEnquiryFormScreen";
import { EnquiryDetailScreen } from "../screens/EnquiryDetailScreen";
import { PipelineBoardScreen } from "../screens/PipelineBoardScreen";
import { FollowUpTaskListScreen } from "../screens/FollowUpTaskListScreen";
import { AdmissionConfirmationScreen } from "../screens/AdmissionConfirmationScreen";
import { CsvExportScreen } from "../screens/CsvExportScreen";

const Stack = createNativeStackNavigator<RootStackParamList>();

export function AppNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: theme.card },
          headerTintColor: theme.text,
          headerTitleStyle: { fontWeight: "700" },
        }}
      >
        <Stack.Screen name="Home" component={HomeScreen} options={{ title: "EduWand" }} />
        <Stack.Screen name="EnquiryList" component={EnquiryListScreen} options={{ title: "Enquiries" }} />
        <Stack.Screen name="NewEnquiryForm" component={NewEnquiryFormScreen} options={{ title: "New Enquiry" }} />
        <Stack.Screen name="EnquiryDetail" component={EnquiryDetailScreen} options={{ title: "Enquiry" }} />
        <Stack.Screen name="PipelineBoard" component={PipelineBoardScreen} options={{ title: "Pipeline Board" }} />
        <Stack.Screen name="FollowUpTaskList" component={FollowUpTaskListScreen} options={{ title: "Follow Up Tasks" }} />
        <Stack.Screen
          name="AdmissionConfirmation"
          component={AdmissionConfirmationScreen}
          options={{ title: "Confirm Admission" }}
        />
        <Stack.Screen name="CsvExport" component={CsvExportScreen} options={{ title: "CSV Export" }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
