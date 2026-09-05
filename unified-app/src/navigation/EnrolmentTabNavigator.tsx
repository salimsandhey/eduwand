import { useState } from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import { EnrolmentTabParamList } from "./types";
import { HomeScreen } from "../screens/shared/HomeScreen";
import { EnquiryListScreen } from "../screens/enrolment/EnquiryListScreen";
import { EnrolmentAnalyticsScreen } from "../screens/enrolment/EnrolmentAnalyticsScreen";
import { FollowUpTaskListScreen } from "../screens/enrolment/FollowUpTaskListScreen";
import { MoreStackNavigator } from "./MoreStackNavigator";
import { FloatingTabBar } from "./FloatingTabBar";
import { AiAssistChatModal } from "../components/AiAssistChatModal";
import { decorativeAssets } from "../theme/decorativeAssets";

const Tab = createBottomTabNavigator<EnrolmentTabParamList>();

const ICONS: Record<keyof EnrolmentTabParamList, keyof typeof Ionicons.glyphMap> = {
  Home: "home-outline",
  Enquiries: "mail-outline",
  Analytics: "bar-chart-outline",
  Tasks: "checkbox-outline",
  More: "ellipsis-horizontal-outline",
};

export function EnrolmentTabNavigator() {
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
            <Ionicons name={ICONS[route.name as keyof EnrolmentTabParamList]} size={size} color={color} />
          ),
        })}
      >
        <Tab.Screen name="Home" component={HomeScreen} />
        <Tab.Screen name="Enquiries" component={EnquiryListScreen} />
        <Tab.Screen name="Analytics" component={EnrolmentAnalyticsScreen} />
        <Tab.Screen name="Tasks" component={FollowUpTaskListScreen} />
        <Tab.Screen name="More" component={MoreStackNavigator} options={{ title: "More" }} />
      </Tab.Navigator>
      <AiAssistChatModal visible={showAiAssist} onClose={() => setShowAiAssist(false)} />
    </>
  );
}
