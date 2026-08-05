import { StatusBar } from "expo-status-bar";
import { AuthProvider, useAuth } from "./src/context/AuthContext";
import { ThemeProvider, useTheme } from "./src/theme/ThemeContext";
import { LoginScreen } from "./src/screens/LoginScreen";
import { AppNavigator } from "./src/navigation/AppNavigator";

function Root() {
  const { user } = useAuth();
  const { mode } = useTheme();
  return (
    <>
      {user ? <AppNavigator /> : <LoginScreen />}
      <StatusBar style={mode === "dark" ? "light" : "dark"} />
    </>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <Root />
      </AuthProvider>
    </ThemeProvider>
  );
}
