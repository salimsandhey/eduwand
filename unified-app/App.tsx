import { useEffect, useState } from "react";
import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { AuthProvider, useAuth } from "./src/context/AuthContext";
import { ThemeProvider, useTheme } from "./src/theme/ThemeContext";
import { AuthScreen } from "./src/screens/auth/AuthScreen";
import { AppNavigator } from "./src/navigation/AppNavigator";
import { applyGlobalTypography } from "./src/theme/globalTypography";
import { AnimatedSplashScreen } from "./src/components/AnimatedSplashScreen";
import { lockPortrait } from "./src/utils/safeOrientation";

applyGlobalTypography();

function Root() {
  const { user, isRestoring } = useAuth();
  const { mode } = useTheme();
  const [splashDone, setSplashDone] = useState(false);

  // The app is portrait throughout except the Presentation full-screen
  // viewer (PresentationView.tsx), which locks to landscape on its own and
  // reverts on close - this app-wide default is what it reverts back to.
  // Runtime locking only works because app.json's "orientation" is "default"
  // (not hard-locked to "portrait" at the native manifest level, which would
  // override any lockAsync call).
  useEffect(() => {
    lockPortrait();
  }, []);

  return (
    <>
      {!isRestoring && (user ? <AppNavigator /> : <AuthScreen />)}
      {!splashDone && (
        <AnimatedSplashScreen ready={!isRestoring} onFinish={() => setSplashDone(true)} />
      )}
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

  // Fonts load in well under a frame; the native splash (app.json) stays up
  // and nothing paints here, so there's no bare/spinner flash before the
  // animated splash takes over.
  if (!fontsLoaded) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <AuthProvider>
            <Root />
          </AuthProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
