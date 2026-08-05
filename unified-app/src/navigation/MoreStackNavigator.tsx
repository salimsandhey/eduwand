import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { MoreStackParamList } from "./types";
import { MoreMenuScreen } from "../screens/MoreMenuScreen";
import { CsvExportScreen } from "../screens/CsvExportScreen";
import { useTheme } from "../theme/ThemeContext";

const Stack = createNativeStackNavigator<MoreStackParamList>();

// Nested inside the enrolment "More" tab so CSV Export keeps that tab's bar visible
// when pushed (per Docs/superpowers/specs/2026-08-05-unified-app-dark-theme-restyle-design.md).
export function MoreStackNavigator() {
  const { colors } = useTheme();
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.textPrimary,
        headerTitleStyle: { fontWeight: "700" },
      }}
    >
      <Stack.Screen name="MoreMenu" component={MoreMenuScreen} options={{ title: "More" }} />
      <Stack.Screen name="CsvExport" component={CsvExportScreen} options={{ title: "CSV Export" }} />
    </Stack.Navigator>
  );
}
