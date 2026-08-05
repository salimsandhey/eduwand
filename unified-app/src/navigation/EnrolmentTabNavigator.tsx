import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import { EnrolmentTabParamList } from "./types";
import { useTheme } from "../theme/ThemeContext";
import { HomeScreen } from "../screens/HomeScreen";
import { EnquiryListScreen } from "../screens/EnquiryListScreen";
import { PipelineBoardScreen } from "../screens/PipelineBoardScreen";
import { FollowUpTaskListScreen } from "../screens/FollowUpTaskListScreen";
import { MoreStackNavigator } from "./MoreStackNavigator";

const Tab = createBottomTabNavigator<EnrolmentTabParamList>();

const ICONS: Record<keyof EnrolmentTabParamList, keyof typeof Ionicons.glyphMap> = {
  Home: "home-outline",
  Enquiries: "mail-outline",
  Pipeline: "git-network-outline",
  Tasks: "checkbox-outline",
  More: "ellipsis-horizontal-outline",
};

export function EnrolmentTabNavigator() {
  const { colors } = useTheme();

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
        tabBarIcon: ({ color, size }) => (
          <Ionicons name={ICONS[route.name as keyof EnrolmentTabParamList]} size={size} color={color} />
        ),
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Enquiries" component={EnquiryListScreen} />
      <Tab.Screen name="Pipeline" component={PipelineBoardScreen} />
      <Tab.Screen name="Tasks" component={FollowUpTaskListScreen} />
      <Tab.Screen name="More" component={MoreStackNavigator} />
    </Tab.Navigator>
  );
}
