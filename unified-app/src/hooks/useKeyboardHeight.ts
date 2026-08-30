import { useEffect, useState } from "react";
import { Keyboard, Platform } from "react-native";

/**
 * Tracks the on-screen keyboard height via real Keyboard events, for use as
 * marginBottom/paddingBottom on a <Modal>'s content so the keyboard doesn't
 * cover it (KeyboardAvoidingView doesn't reliably reach into Modal's separate
 * native window).
 *
 * iOS only: the Activity here runs with windowSoftInputMode="adjustResize"
 * (see AndroidManifest.xml / app.json's softwareKeyboardLayoutMode), so on
 * Android the OS already shrinks the window - and the Modal sheet along with
 * it, since it's pinned to the bottom - when the keyboard opens. Adding the
 * keyboard height again on top of that double-compensates and pushes the
 * sheet up far past the keyboard. Only iOS (which does no such resize) needs
 * the manual offset.
 */
export function useKeyboardHeight() {
  const [height, setHeight] = useState(0);

  useEffect(() => {
    if (Platform.OS !== "ios") return;

    const showSub = Keyboard.addListener("keyboardWillShow", (e) => setHeight(e.endCoordinates?.height ?? 0));
    const hideSub = Keyboard.addListener("keyboardWillHide", () => setHeight(0));

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  return height;
}
