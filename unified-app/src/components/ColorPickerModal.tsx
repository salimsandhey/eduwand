import { useMemo, useRef, useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, Modal, PanResponder, GestureResponderEvent } from "react-native";
import Svg, { Rect, Defs, LinearGradient, Stop } from "react-native-svg";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../theme/ThemeContext";

// Full-spectrum color picker - saturation/value square for the chosen hue,
// plus a hue strip, plus a hex field for exact entry. Built on
// react-native-svg (already installed and in active use elsewhere - e.g.
// EnrolmentAnalyticsScreen.tsx's charts - so this doesn't add any new native
// dependency or require a rebuild) rather than a fixed swatch palette, since
// a school's brand color is rarely one of a handful of presets.

const SV_SIZE = 240;
const HUE_HEIGHT = 28;

function hsvToHex(h: number, s: number, v: number): string {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r = 0, g = 0, b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const toHex = (n: number) => Math.round((n + m) * 255).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

function hexToHsv(hex: string): { h: number; s: number; v: number } | null {
  const match = hex.trim().match(/^#?([0-9a-f]{6})$/i);
  if (!match) return null;
  const int = parseInt(match[1], 16);
  const r = ((int >> 16) & 255) / 255;
  const g = ((int >> 8) & 255) / 255;
  const b = (int & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const s = max === 0 ? 0 : d / max;
  return { h, s, v: max };
}

const HUE_STOPS = ["#FF0000", "#FFFF00", "#00FF00", "#00FFFF", "#0000FF", "#FF00FF", "#FF0000"];

export function ColorPickerModal({
  visible,
  initialColor,
  onClose,
  onSelect,
}: {
  visible: boolean;
  initialColor: string;
  onClose: () => void;
  onSelect: (hex: string) => void;
}) {
  const { colors, pressedOpacity } = useTheme();
  const initial = useMemo(() => hexToHsv(initialColor) ?? { h: 220, s: 0.7, v: 0.7 }, [initialColor]);
  const [h, setH] = useState(initial.h);
  const [s, setS] = useState(initial.s);
  const [v, setV] = useState(initial.v);
  const [hexInput, setHexInput] = useState(hsvToHex(initial.h, initial.s, initial.v));
  const svRef = useRef<View>(null);
  const hueRef = useRef<View>(null);
  const svLayout = useRef({ x: 0, y: 0 });
  const hueLayout = useRef({ x: 0, y: 0 });

  const hex = hsvToHex(h, s, v);

  function updateFromSv(evt: GestureResponderEvent) {
    const { pageX, pageY } = evt.nativeEvent;
    const localX = Math.min(Math.max(pageX - svLayout.current.x, 0), SV_SIZE);
    const localY = Math.min(Math.max(pageY - svLayout.current.y, 0), SV_SIZE);
    const newS = localX / SV_SIZE;
    const newV = 1 - localY / SV_SIZE;
    setS(newS);
    setV(newV);
    setHexInput(hsvToHex(h, newS, newV));
  }

  function updateFromHue(evt: GestureResponderEvent) {
    const { pageX } = evt.nativeEvent;
    const localX = Math.min(Math.max(pageX - hueLayout.current.x, 0), SV_SIZE);
    const newH = (localX / SV_SIZE) * 360;
    setH(newH);
    setHexInput(hsvToHex(newH, s, v));
  }

  const svPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: updateFromSv,
      onPanResponderMove: updateFromSv,
    })
  ).current;

  const huePanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: updateFromHue,
      onPanResponderMove: updateFromHue,
    })
  ).current;

  function applyHexInput(text: string) {
    setHexInput(text);
    const parsed = hexToHsv(text);
    if (parsed) {
      setH(parsed.h);
      setS(parsed.s);
      setV(parsed.v);
    }
  }

  const hueColor = hsvToHex(h, 1, 1);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.headerRow}>
            <Text style={[styles.title, { color: colors.textPrimary }]}>Choose a color</Text>
            <Pressable onPress={onClose} hitSlop={8} accessibilityRole="button" accessibilityLabel="Close">
              <Ionicons name="close" size={22} color={colors.textMuted} />
            </Pressable>
          </View>

          <View
            ref={svRef}
            style={styles.svBox}
            onLayout={() => svRef.current?.measure((_x, _y, _w, _h, pageX, pageY) => { svLayout.current = { x: pageX, y: pageY }; })}
            {...svPanResponder.panHandlers}
          >
            <Svg width={SV_SIZE} height={SV_SIZE}>
              <Defs>
                <LinearGradient id="satGrad" x1="0" y1="0" x2="1" y2="0">
                  <Stop offset="0" stopColor="#FFFFFF" />
                  <Stop offset="1" stopColor={hueColor} />
                </LinearGradient>
                <LinearGradient id="valGrad" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor="#000000" stopOpacity={0} />
                  <Stop offset="1" stopColor="#000000" stopOpacity={1} />
                </LinearGradient>
              </Defs>
              <Rect x={0} y={0} width={SV_SIZE} height={SV_SIZE} fill="url(#satGrad)" />
              <Rect x={0} y={0} width={SV_SIZE} height={SV_SIZE} fill="url(#valGrad)" />
            </Svg>
            <View
              pointerEvents="none"
              style={[
                styles.svThumb,
                { left: s * SV_SIZE - 9, top: (1 - v) * SV_SIZE - 9, backgroundColor: hex },
              ]}
            />
          </View>

          <View
            ref={hueRef}
            style={styles.hueBox}
            onLayout={() => hueRef.current?.measure((_x, _y, _w, _h, pageX, pageY) => { hueLayout.current = { x: pageX, y: pageY }; })}
            {...huePanResponder.panHandlers}
          >
            <Svg width={SV_SIZE} height={HUE_HEIGHT}>
              <Defs>
                <LinearGradient id="hueGrad" x1="0" y1="0" x2="1" y2="0">
                  {HUE_STOPS.map((c, i) => (
                    <Stop key={i} offset={i / (HUE_STOPS.length - 1)} stopColor={c} />
                  ))}
                </LinearGradient>
              </Defs>
              <Rect x={0} y={0} width={SV_SIZE} height={HUE_HEIGHT} rx={6} fill="url(#hueGrad)" />
            </Svg>
            <View pointerEvents="none" style={[styles.hueThumb, { left: (h / 360) * SV_SIZE - 3 }]} />
          </View>

          <View style={styles.bottomRow}>
            <View style={[styles.previewSwatch, { backgroundColor: hex, borderColor: colors.border }]} />
            <TextInput
              style={[styles.hexInput, { color: colors.textPrimary, borderColor: colors.border }]}
              value={hexInput}
              onChangeText={applyHexInput}
              autoCapitalize="characters"
              autoCorrect={false}
              placeholder="#4C4CE0"
              placeholderTextColor={colors.textMuted}
              maxLength={7}
            />
          </View>

          <Pressable
            style={({ pressed }) => [styles.doneButton, { backgroundColor: colors.accent }, pressed && { opacity: pressedOpacity }]}
            onPress={() => onSelect(hex)}
            accessibilityRole="button"
          >
            <Text style={[styles.doneButtonText, { color: colors.accentOn }]}>Use this color</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center", padding: 20 },
  card: { width: "100%", maxWidth: 320, borderRadius: 20, borderWidth: 1, padding: 20 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 },
  title: { fontSize: 16, fontWeight: "800" },
  svBox: { width: SV_SIZE, height: SV_SIZE, borderRadius: 10, overflow: "hidden", alignSelf: "center" },
  svThumb: { position: "absolute", width: 18, height: 18, borderRadius: 9, borderWidth: 3, borderColor: "#FFFFFF" },
  hueBox: { width: SV_SIZE, height: HUE_HEIGHT, alignSelf: "center", marginTop: 14, justifyContent: "center" },
  hueThumb: { position: "absolute", width: 6, height: HUE_HEIGHT + 6, borderRadius: 3, backgroundColor: "#FFFFFF", borderWidth: 2, borderColor: "#00000033" },
  bottomRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 18 },
  previewSwatch: { width: 40, height: 40, borderRadius: 10, borderWidth: 1 },
  hexInput: { flex: 1, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, fontWeight: "700" },
  doneButton: { marginTop: 18, height: 48, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  doneButtonText: { fontSize: 14, fontWeight: "800" },
});
