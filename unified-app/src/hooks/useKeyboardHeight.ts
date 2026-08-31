import { useEffect, useState } from "react";
import { Keyboard, Platform } from "react-native";

/**
 * Tracks the on-screen keyboard height via real Keyboard events, for use as
 * marginBottom/paddingBottom on a <Modal>'s content so the keyboard doesn't
 * cover it.
 *
 * windowSoftInputMode="adjustResize" in AndroidManifest.xml only resizes the
 * Activity's own window - React Native's <Modal> renders in a separate native
 * Android Dialog window that does not inherit that setting, so the OS never
 * shrinks the modal for the keyboard on Android either. Both platforms need
 * the manual offset; only the event names differ (Android has no
 * keyboardWillShow/Hide, only keyboardDidShow/Hide).
 */
export function useKeyboardHeight() {
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const showSub = Keyboard.addListener(showEvent, (e) => setHeight(e.endCoordinates?.height ?? 0));
    const hideSub = Keyboard.addListener(hideEvent, () => setHeight(0));

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  return height;
}
