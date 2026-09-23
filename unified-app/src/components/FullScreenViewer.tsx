import { useEffect, useState } from "react";
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

interface Props {
  visible: boolean;
  onClose: () => void;
  title: string;
  /** How many pages/images there are (1 for a single image). */
  count: number;
  /** URL of the page at this 0-based index. Only the current one is loaded. */
  urlFor: (index: number) => string;
}

// Full-screen, in-app viewer for an image or the pages of a PDF: black
// background, close button, prev/next with a page counter, and pinch-to-zoom
// where the platform's scroll view supports it (iOS). Keeps the teacher inside
// the app instead of bouncing out to a browser.
export function FullScreenViewer({ visible, onClose, title, count, urlFor }: Props) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [index, setIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (visible) setIndex(0);
  }, [visible]);

  useEffect(() => {
    setIsLoading(true);
    setFailed(false);
  }, [index, visible]);

  const multiple = count > 1;
  const stageHeight = height - insets.top - insets.bottom - (multiple ? 150 : 100);

  return (
    <Modal visible={visible} transparent statusBarTranslucent navigationBarTranslucent animationType="fade" onRequestClose={onClose}>
      <View style={styles.root}>
        <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
          <Text style={styles.title} numberOfLines={1}>{title}</Text>
          <Pressable onPress={onClose} hitSlop={12} style={styles.closeButton} accessibilityRole="button" accessibilityLabel="Close viewer">
            <Ionicons name="close" size={22} color="#FFFFFF" />
          </Pressable>
        </View>

        <ScrollView
          key={index}
          style={{ flex: 1 }}
          contentContainerStyle={{ width, minHeight: stageHeight, alignItems: "center", justifyContent: "center" }}
          maximumZoomScale={4}
          minimumZoomScale={1}
          bouncesZoom
          centerContent
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
        >
          {visible && !failed ? (
            <Image
              source={{ uri: urlFor(index) }}
              style={{ width, height: stageHeight }}
              resizeMode="contain"
              onLoad={() => setIsLoading(false)}
              onError={() => {
                setIsLoading(false);
                setFailed(true);
              }}
              accessibilityLabel={multiple ? `${title}, page ${index + 1} of ${count}` : title}
            />
          ) : null}
          {failed ? <Text style={styles.errorText}>This couldn't be loaded.</Text> : null}
          {isLoading && !failed ? <ActivityIndicator color="#FFFFFF" style={StyleSheet.absoluteFill} /> : null}
        </ScrollView>

        {multiple ? (
          <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
            <Pressable
              onPress={() => setIndex((i) => Math.max(0, i - 1))}
              disabled={index === 0}
              hitSlop={10}
              style={[styles.navButton, index === 0 && { opacity: 0.35 }]}
              accessibilityRole="button"
              accessibilityLabel="Previous page"
            >
              <Ionicons name="chevron-back" size={22} color="#FFFFFF" />
            </Pressable>
            <Text style={styles.counter}>{index + 1} / {count}</Text>
            <Pressable
              onPress={() => setIndex((i) => Math.min(count - 1, i + 1))}
              disabled={index >= count - 1}
              hitSlop={10}
              style={[styles.navButton, index >= count - 1 && { opacity: 0.35 }]}
              accessibilityRole="button"
              accessibilityLabel="Next page"
            >
              <Ionicons name="chevron-forward" size={22} color="#FFFFFF" />
            </Pressable>
          </View>
        ) : (
          <View style={{ height: insets.bottom + 12 }} />
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000000" },
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingBottom: 8 },
  title: { flex: 1, color: "#FFFFFF", fontSize: 14, fontWeight: "700" },
  closeButton: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.16)" },
  errorText: { color: "#FFFFFF", fontSize: 14 },
  footer: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 28, paddingTop: 8 },
  navButton: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.16)" },
  counter: { color: "#FFFFFF", fontSize: 14, fontWeight: "700", minWidth: 64, textAlign: "center" },
});
