import { useState } from "react";
import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import { ActivityIndicator, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider, useAuth } from "./src/context/AuthContext";
import { ThemeProvider, useTheme } from "./src/theme/ThemeContext";
import { AuthScreen } from "./src/screens/auth/AuthScreen";
import { AppNavigator } from "./src/navigation/AppNavigator";
import { applyGlobalTypography } from "./src/theme/globalTypography";

applyGlobalTypography();

function Root() {
  const { user, isRestoring } = useAuth();
  const { mode } = useTheme();

  if (isRestoring) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#FFFFFF" }}>
        <ActivityIndicator color="#7C005A" />
      </View>
    );
  }

  return (
    <>
      {user ? <AppNavigator /> : <AuthScreen />}
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
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#FFFFFF" }}>
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
