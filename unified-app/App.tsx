import { useState } from "react";
import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import { ActivityIndicator, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider, useAuth } from "./src/context/AuthContext";
import { ThemeProvider, useTheme } from "./src/theme/ThemeContext";
import { LoginScreen } from "./src/screens/auth/LoginScreen";
import { StudentLoginScreen } from "./src/screens/auth/StudentLoginScreen";
import { AppNavigator } from "./src/navigation/AppNavigator";
import { applyGlobalTypography } from "./src/theme/globalTypography";

applyGlobalTypography();

function Root() {
  const { user } = useAuth();
  const { mode } = useTheme();
  const [loginMode, setLoginMode] = useState<"staff" | "student">("staff");

  function renderLoggedOut() {
    if (loginMode === "student") {
      return <StudentLoginScreen onBackToStaffLogin={() => setLoginMode("staff")} />;
    }
    return <LoginScreen onStudentLogin={() => setLoginMode("student")} />;
  }

  return (
    <>
      {user ? <AppNavigator /> : renderLoggedOut()}
      <StatusBar style={mode === "dark" ? "light" : "dark"} />
    </>
  );
}

export default function App() {
  const [fontsLoaded] = useFonts({
    "Poppins-Regular": require("./assets/fonts/Poppins-Regular.ttf"),
    "Poppins-Medium": require("./assets/fonts/Poppins-Medium.ttf"),
    "Poppins-SemiBold": require("./assets/fonts/Poppins-SemiBold.ttf"),
    "Poppins-Bold": require("./assets/fonts/Poppins-Bold.ttf"),
  });

  if (!fontsLoaded) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#F4F1E8" }}>
        <ActivityIndicator color="#7C005A" />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AuthProvider>
          <Root />
        </AuthProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
