import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { BlurTargetView } from "expo-blur";
import { useFonts } from "expo-font";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { AuthProvider, useAuth } from "./src/context/AuthContext";
import { SplashDoneProvider } from "./src/context/SplashContext";
import { ThemeProvider, useTheme } from "./src/theme/ThemeContext";
import { AiAssistantGlowProvider } from "./src/context/AiAssistantGlowContext";
import { AuthScreen } from "./src/screens/auth/AuthScreen";
import { AppNavigator } from "./src/navigation/AppNavigator";
import { applyGlobalTypography } from "./src/theme/globalTypography";
import { AnimatedSplashScreen } from "./src/components/AnimatedSplashScreen";
import { AiAssistantGlowOverlay } from "./src/components/ai/AiAssistantGlowOverlay";
import { AiGeneratingOverlay } from "./src/components/ai/AiGeneratingOverlay";
import { WelcomeMascotProvider, useWelcomeMascot } from "./src/context/WelcomeMascotContext";
import { MascotWelcomeOverlay } from "./src/components/MascotWelcomeOverlay";
import { OfflineBanner } from "./src/components/OfflineBanner";
import { lockPortrait } from "./src/utils/safeOrientation";

applyGlobalTypography();

function Root() {
  const { user, isRestoring } = useAuth();
  const { mode } = useTheme();
  const [splashDone, setSplashDone] = useState(false);
  const { startWelcome, welcomeCount } = useWelcomeMascot();
  const blurTargetRef = useRef<View>(null);

  useEffect(() => {
    lockPortrait();
  }, []);

  // Once per signed-in account, every role alike. Cleared on logout, so
  // logging in as someone else (e.g. a student after a teacher) in the same
  // app session still gets the intro - a one-shot boolean skipped it.
  const welcomedUserIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!user) {
      welcomedUserIdRef.current = null;
      return;
    }
    // Students have no AI assistant, so no mascot intro either.
    if (user.role === "student") return;
    if (splashDone && welcomedUserIdRef.current !== user.id) {
      welcomedUserIdRef.current = user.id;
      startWelcome();
    }
  }, [splashDone, user, startWelcome]);

  return (
    <SplashDoneProvider done={splashDone}>
      {/* The AI generating overlay blurs this (Android only blurs a BlurTargetView). */}
      <BlurTargetView ref={blurTargetRef} style={{ flex: 1 }}>
        {!isRestoring && (user ? <AppNavigator /> : <AuthScreen />)}
      </BlurTargetView>
      {!splashDone && (
        <AnimatedSplashScreen ready={!isRestoring} onFinish={() => setSplashDone(true)} />
      )}
      {splashDone && !!user && user.role !== "student" && <MascotWelcomeOverlay key={welcomeCount} />}
      <AiGeneratingOverlay blurTarget={blurTargetRef} />
      <AiAssistantGlowOverlay />
      {splashDone && <OfflineBanner />}
      <StatusBar style={mode === "dark" ? "light" : "dark"} />
    </SplashDoneProvider>
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
            <WelcomeMascotProvider>
              <AiAssistantGlowProvider>
                <Root />
              </AiAssistantGlowProvider>
            </WelcomeMascotProvider>
          </AuthProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

