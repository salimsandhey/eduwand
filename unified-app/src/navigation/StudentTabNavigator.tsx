import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import { StudentTabParamList } from "./types";
import { StudentHomeScreen } from "../screens/student/StudentHomeScreen";
import { StudentMaterialsScreen } from "../screens/student/StudentMaterialsScreen";
import { StudentResultsScreen } from "../screens/student/StudentResultsScreen";
import { StudentMessagesScreen } from "../screens/student/StudentMessagesScreen";
import { FloatingTabBar } from "./FloatingTabBar";

const Tab = createBottomTabNavigator<StudentTabParamList>();

const ICONS: Record<keyof StudentTabParamList, keyof typeof Ionicons.glyphMap> = {
  Home: "home-outline",
  Materials: "book-outline",
  Results: "checkmark-done-outline",
  Messages: "chatbubble-outline",
};

export function StudentTabNavigator() {
  return (
    <Tab.Navigator
      tabBar={(props) => <FloatingTabBar {...props} icons={ICONS} />}
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarHideOnKeyboard: true,
        tabBarIcon: ({ color, size }) => (
          <Ionicons name={ICONS[route.name as keyof StudentTabParamList]} size={size} color={color} />
        ),
      })}
    >
      <Tab.Screen name="Home" component={StudentHomeScreen} />
      <Tab.Screen name="Materials" component={StudentMaterialsScreen} />
      <Tab.Screen name="Results" component={StudentResultsScreen} />
      <Tab.Screen name="Messages" component={StudentMessagesScreen} />
    </Tab.Navigator>
  );
}
