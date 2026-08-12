import { useState } from "react";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider, useAuth } from "./src/context/AuthContext";
import { ThemeProvider, useTheme } from "./src/theme/ThemeContext";
import { LoginScreen } from "./src/screens/LoginScreen";
import { StudentLoginScreen } from "./src/screens/StudentLoginScreen";
import { AppNavigator } from "./src/navigation/AppNavigator";

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
