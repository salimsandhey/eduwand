import { useState } from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import { TeacherTabParamList } from "./types";
import { HomeScreen } from "../screens/shared/HomeScreen";
import { MyClassesScreen } from "../screens/studio/MyClassesScreen";
import { AssignmentScreen } from "../screens/assignments/AssignmentScreen";
import { TeacherAnalyticsScreen } from "../screens/analytics/TeacherAnalyticsScreen";
import { MoreStackNavigator } from "./MoreStackNavigator";
import { FloatingTabBar } from "./FloatingTabBar";
import { AiAssistChatModal } from "../components/AiAssistChatModal";
import { decorativeAssets } from "../theme/decorativeAssets";

const Tab = createBottomTabNavigator<TeacherTabParamList>();

const ICONS: Record<keyof TeacherTabParamList, keyof typeof Ionicons.glyphMap> = {
  Home: "home-outline",
  Studio: "book-outline",
  Assignment: "document-text-outline",
  Analytics: "bar-chart-outline",
  More: "ellipsis-horizontal-outline",
};

export function TeacherTabNavigator() {
  const [showAiAssist, setShowAiAssist] = useState(false);

  return (
    <>
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
            <Ionicons name={ICONS[route.name as keyof TeacherTabParamList]} size={size} color={color} />
          ),
        })}
      >
        <Tab.Screen name="Home" component={HomeScreen} />
        <Tab.Screen name="Studio" component={MyClassesScreen} />
        <Tab.Screen name="Assignment" component={AssignmentScreen} />
        <Tab.Screen name="Analytics" component={TeacherAnalyticsScreen} />
        <Tab.Screen
          name="More"
          component={MoreStackNavigator}
          options={{
            headerShown: false,
            title: "Profile",
          }}
        />
      </Tab.Navigator>
      <AiAssistChatModal visible={showAiAssist} onClose={() => setShowAiAssist(false)} />
    </>
  );
}
