import { useEffect, useRef, useState } from "react";
import { Animated, Easing, StyleSheet, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as SplashScreen from "expo-splash-screen";
import { brandAssets } from "../theme/brandAssets";

SplashScreen.preventAutoHideAsync().catch(() => {});

interface AnimatedSplashScreenProps {
  /** True once the app has finished its own startup work (fonts, auth restore). */
  ready: boolean;
  onFinish: () => void;
}

// Must match AuthScreen's styles.loginLogo + its container paddingTop
// (unified-app/src/screens/auth/AuthScreen.tsx) so the logo lands exactly on
// top of the real one underneath, with no jump when the splash fades out.
const LOGO_WIDTH = 132;
const LOGO_HEIGHT = 40;
const HEADER_TOP_PADDING = 18;
// The logo starts zoomed in well past its normal size and eases down to 1x,
// a "zoom-out to default" reveal rather than a fade or a bounce.
const ZOOM_START_SCALE = 2.2;

export function AnimatedSplashScreen({ ready, onFinish }: AnimatedSplashScreenProps) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();

  const logoOpacity = useRef(new Animated.Value(0)).current;
  const logoScale = useRef(new Animated.Value(ZOOM_START_SCALE)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const overlayOpacity = useRef(new Animated.Value(1)).current;

  const travelDoneRef = useRef(false);
  const exitStartedRef = useRef(false);
  const introStartedRef = useRef(false);
  const maybeExitRef = useRef<() => void>(() => {});
  const [imageReady, setImageReady] = useState(false);

  // Rest position: where the logo sits in the login screen's header.
  const restCenterY = insets.top + HEADER_TOP_PADDING + LOGO_HEIGHT / 2;
  // Starting position: screen centre. translateY animates from here to 0,
  // which is what actually carries the logo "back" to its resting spot.
  const startTranslateY = windowHeight / 2 - restCenterY;

  useEffect(() => {
    maybeExitRef.current = () => {
      if (!travelDoneRef.current || !ready || exitStartedRef.current) return;
      exitStartedRef.current = true;
      Animated.timing(overlayOpacity, {
        toValue: 0,
        duration: 360,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }).start(() => onFinish());
    };
    maybeExitRef.current();
  }, [ready, onFinish, overlayOpacity]);

  useEffect(() => {
    translateY.setValue(startTranslateY);
    // Fallback in case onLoadEnd never fires (seen on some web/dev setups) -
    // don't hang the splash forever waiting for it.
    const fallback = setTimeout(() => setImageReady(true), 500);
    return () => clearTimeout(fallback);
    // Runs exactly once per mount; startTranslateY is stable for the life of the splash.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Only start the fade once the bitmap has actually decoded - starting it
    // earlier lets the image "pop" in mid-fade instead of fading smoothly.
    if (!imageReady || introStartedRef.current) return;
    introStartedRef.current = true;

    Animated.sequence([
      // Materialise first, still oversized and centred.
      Animated.timing(logoOpacity, {
        toValue: 1,
        duration: 240,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
      // Hold still, fully visible, before the movement starts.
      Animated.delay(2000),
      // Zoom out to default size and travel to the header position together,
      // as one continuous move.
      Animated.parallel([
        Animated.timing(logoScale, {
          toValue: 1,
          duration: 750,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: 0,
          duration: 750,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
    ]).start(() => {
      travelDoneRef.current = true;
      maybeExitRef.current();
    });
  }, [imageReady]);

  return (
    <Animated.View
      pointerEvents="none"
      onLayout={() => {
        SplashScreen.hideAsync().catch(() => {});
      }}
      style={[styles.container, { opacity: overlayOpacity }]}
    >
      <Animated.Image
        source={brandAssets.logo}
        resizeMode="contain"
        onLoadEnd={() => setImageReady(true)}
        style={[
          styles.logo,
          {
            marginTop: restCenterY - LOGO_HEIGHT / 2,
            opacity: logoOpacity,
            transform: [{ translateY }, { scale: logoScale }],
          },
        ]}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    zIndex: 999,
  },
  logo: {
    width: LOGO_WIDTH,
    height: LOGO_HEIGHT,
  },
});
