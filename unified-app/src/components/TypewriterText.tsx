import { useCallback, useEffect, useRef, useState } from "react";
import { Animated, StyleProp, Text, TextStyle } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useTypewriter } from "../hooks/useTypewriter";

interface TypewriterTextProps {
  text: string;
  style?: StyleProp<TextStyle>;
  cursorColor?: string;
  speed?: number;
  startDelay?: number;
  showCursor?: boolean;
  numberOfLines?: number;
}

/**
 * Header heading that types itself out from scratch every time its screen
 * gains focus (tab switch or navigation back), not just on first mount.
 */
export function TypewriterText({
  text,
  style,
  cursorColor,
  speed = 90,
  startDelay = 250,
  showCursor = true,
  numberOfLines,
}: TypewriterTextProps) {
  // Bumps on every focus, including the screen's very first focus on a cold
  // start - unlike useIsFocused(), whose first synchronous render value
  // isn't reliably true for the initial route right after an app reload.
  const [focusKey, setFocusKey] = useState(0);
  useFocusEffect(
    useCallback(() => {
      setFocusKey((key) => key + 1);
    }, [])
  );
  const { visibleChars, done } = useTypewriter(focusKey, text, { speed, startDelay });
  const cursorOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!showCursor) return;
    const blink = Animated.loop(
      Animated.sequence([
        Animated.timing(cursorOpacity, { toValue: 0, duration: 450, useNativeDriver: true }),
        Animated.timing(cursorOpacity, { toValue: 1, duration: 450, useNativeDriver: true }),
      ])
    );
    blink.start();
    return () => blink.stop();
  }, [cursorOpacity, showCursor]);

  return (
    <Text style={style} numberOfLines={numberOfLines}>
      {text.slice(0, visibleChars)}
      {showCursor && !done ? (
        <Animated.Text style={{ opacity: cursorOpacity, color: cursorColor }}>|</Animated.Text>
      ) : null}
    </Text>
  );
}
