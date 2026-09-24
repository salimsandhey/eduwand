import { useState } from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import { StudentTabParamList } from "./types";
import { StudentHomeScreen } from "../screens/student/StudentHomeScreen";
import { StudentMaterialsScreen } from "../screens/student/StudentMaterialsScreen";
import { StudentResultsScreen } from "../screens/student/StudentResultsScreen";
import { StudentMessagesScreen } from "../screens/student/StudentMessagesScreen";
import { StudentProfileScreen } from "../screens/student/StudentProfileScreen";
import { FloatingTabBar } from "./FloatingTabBar";
import { AiAssistChatModal } from "../components/AiAssistChatModal";
import { decorativeAssets } from "../theme/decorativeAssets";
import { TabBarScrollProvider } from "./TabBarScrollContext";

const Tab = createBottomTabNavigator<StudentTabParamList>();

const ICONS: Record<keyof StudentTabParamList, keyof typeof Ionicons.glyphMap> = {
  Home: "home-outline",
  Materials: "book-outline",
  Results: "checkmark-done-outline",
  Messages: "chatbubble-outline",
  Profile: "person-circle-outline",
};

export function StudentTabNavigator() {
  const [showAiAssist, setShowAiAssist] = useState(false);

  return (
    <TabBarScrollProvider>
      <Tab.Navigator
        tabBar={(props) => (
          <FloatingTabBar
            {...props}
            icons={ICONS}
            aiAssistIcon={decorativeAssets.aiButtonIcon}
            onAiAssistPress={() => setShowAiAssist(true)}
          />
        )}
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
        <Tab.Screen name="Profile" component={StudentProfileScreen} />
      </Tab.Navigator>
      <AiAssistChatModal visible={showAiAssist} onClose={() => setShowAiAssist(false)} />
    </TabBarScrollProvider>
  );
}
