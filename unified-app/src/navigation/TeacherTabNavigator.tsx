import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import { TeacherTabParamList } from "./types";
import { useTheme } from "../theme/ThemeContext";
import { HomeScreen } from "../screens/HomeScreen";
import { StudioScreen } from "../screens/StudioScreen";
import { AssignmentScreen } from "../screens/AssignmentScreen";
import { TeacherAnalyticsScreen } from "../screens/TeacherAnalyticsScreen";
import { MoreMenuScreen } from "../screens/MoreMenuScreen";

const Tab = createBottomTabNavigator<TeacherTabParamList>();

const ICONS: Record<keyof TeacherTabParamList, keyof typeof Ionicons.glyphMap> = {
  Home: "home-outline",
  Studio: "book-outline",
  Assignment: "document-text-outline",
  Analytics: "bar-chart-outline",
  More: "ellipsis-horizontal-outline",
};

export function TeacherTabNavigator() {
  const { colors } = useTheme();

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
        tabBarIcon: ({ color, size }) => (
          <Ionicons name={ICONS[route.name as keyof TeacherTabParamList]} size={size} color={color} />
        ),
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Studio" component={StudioScreen} />
      <Tab.Screen name="Assignment" component={AssignmentScreen} />
      <Tab.Screen name="Analytics" component={TeacherAnalyticsScreen} />
      <Tab.Screen
        name="More"
        component={MoreMenuScreen}
        options={{
          headerShown: true,
          title: "More",
          headerStyle: { backgroundColor: colors.surface },
          headerTintColor: colors.textPrimary,
          headerTitleStyle: { fontWeight: "700" },
        }}
      />
    </Tab.Navigator>
  );
}
