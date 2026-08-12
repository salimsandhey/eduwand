import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import { StudentTabParamList } from "./types";
import { useTheme } from "../theme/ThemeContext";
import { StudentHomeScreen } from "../screens/StudentHomeScreen";

const Tab = createBottomTabNavigator<StudentTabParamList>();

export function StudentTabNavigator() {
  const { colors } = useTheme();

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
        tabBarIcon: ({ color, size }) => <Ionicons name="home-outline" size={size} color={color} />,
      }}
    >
      <Tab.Screen name="Home" component={StudentHomeScreen} />
    </Tab.Navigator>
  );
}
