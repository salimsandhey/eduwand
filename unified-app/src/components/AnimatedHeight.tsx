import { ReactNode, useLayoutEffect, useRef } from "react";
import { Animated, Easing, LayoutChangeEvent, StyleProp, View, ViewStyle } from "react-native";

interface AnimatedHeightProps {
  children: ReactNode;
  /**
   * Changes whenever the content is swapped for a different view (e.g. a step
   * key). The new content fades and slides in; the container's height eases
   * to fit it. Height changes without a key change (a list filtering down)
   * still ease, just without the fade.
   */
  contentKey?: string;
  /** 1 = new content slides in from the right (forward), -1 = from the left (back). */
  direction?: 1 | -1;
  duration?: number;
  style?: StyleProp<ViewStyle>;
}

/**
 * A container that smoothly animates its height to whatever its content
 * measures, instead of snapping. The first layout is applied instantly so
 * nothing animates from zero when it first appears.
 */
export function AnimatedHeight({ children, contentKey, direction = 1, duration = 260, style }: AnimatedHeightProps) {
  const height = useRef(new Animated.Value(0)).current;
  const hasMeasured = useRef(false);
  const lastHeight = useRef(0);

  const contentOpacity = useRef(new Animated.Value(1)).current;
  const contentShift = useRef(new Animated.Value(0)).current;
  const isFirstKey = useRef(true);

  function onContentLayout(e: LayoutChangeEvent) {
    const next = Math.round(e.nativeEvent.layout.height);
    if (next === lastHeight.current) return;
    lastHeight.current = next;
    if (!hasMeasured.current) {
      hasMeasured.current = true;
      height.setValue(next);
      return;
    }
    Animated.timing(height, {
      toValue: next,
      duration,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }

  // Layout effect so the new content is already transparent on its first paint.
  useLayoutEffect(() => {
    if (isFirstKey.current) {
      isFirstKey.current = false;
      return;
    }
    contentOpacity.setValue(0);
    contentShift.setValue(18 * direction);
    Animated.parallel([
      Animated.timing(contentOpacity, { toValue: 1, duration: duration - 40, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(contentShift, { toValue: 0, duration, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
  }, [contentKey]);

  return (
    // Height is driven from JS (layout props can't use the native driver);
    // the fade/slide below is a separate native-driven view.
    <Animated.View style={[{ height: hasMeasured.current ? height : undefined, overflow: "hidden" }, style]}>
      <View onLayout={onContentLayout}>
        <Animated.View style={{ opacity: contentOpacity, transform: [{ translateX: contentShift }] }}>{children}</Animated.View>
      </View>
    </Animated.View>
  );
}
