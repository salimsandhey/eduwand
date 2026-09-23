import { useState } from "react";
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import YoutubePlayer, { PLAYER_ERRORS } from "react-native-youtube-iframe";

interface Props {
  videoId: string | null;
  title: string;
  onClose: () => void;
}

const ERROR_MESSAGES: Record<string, string> = {
  [PLAYER_ERRORS.VIDEO_NOT_FOUND]: "This video isn't available anymore.",
  [PLAYER_ERRORS.EMBED_NOT_ALLOWED]: "The video's owner has disabled playback outside YouTube.",
  [PLAYER_ERRORS.INVALID_PARAMETER]: "This video can't be played.",
  [PLAYER_ERRORS.HTML5_ERROR]: "This video can't be played on this device.",
};

// In-app YouTube playback via react-native-youtube-iframe - hand-rolling this
// with a plain WebView pointed at the embed URL (the first attempt here)
// reliably throws "Video player configuration error" on real devices, because
// the raw embed page doesn't get the origin/base-URL handling YouTube's iframe
// API expects. This library wraps that correctly.
export function VideoPlayerModal({ videoId, title, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [isReady, setIsReady] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const playerWidth = width - 32;
  const playerHeight = (playerWidth * 9) / 16;

  function handleClose() {
    setIsReady(false);
    setErrorMessage(null);
    onClose();
  }

  return (
    <Modal visible={videoId !== null} transparent statusBarTranslucent navigationBarTranslucent animationType="fade" onRequestClose={handleClose}>
      <View style={styles.root}>
        <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
          <Text style={styles.title} numberOfLines={1}>{title}</Text>
          <Pressable onPress={handleClose} hitSlop={12} style={styles.closeButton} accessibilityRole="button" accessibilityLabel="Close video">
            <Ionicons name="close" size={22} color="#FFFFFF" />
          </Pressable>
        </View>

        <View style={styles.playerWrap}>
          {videoId && !errorMessage ? (
            <YoutubePlayer
              key={videoId}
              height={playerHeight}
              width={playerWidth}
              videoId={videoId}
              play
              onReady={() => setIsReady(true)}
              onError={(error: string) => setErrorMessage(ERROR_MESSAGES[error] ?? "This video couldn't be played.")}
              initialPlayerParams={{ rel: false }}
            />
          ) : null}
          {errorMessage ? (
            <View style={styles.errorBlock}>
              <Ionicons name="alert-circle-outline" size={28} color="#FFFFFF" />
              <Text style={styles.errorText}>{errorMessage}</Text>
            </View>
          ) : !isReady ? (
            <ActivityIndicator color="#FFFFFF" style={StyleSheet.absoluteFill} />
          ) : null}
        </View>

        <View style={{ height: insets.bottom + 12 }} />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000000" },
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingBottom: 8 },
  title: { flex: 1, color: "#FFFFFF", fontSize: 14, fontWeight: "700" },
  closeButton: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.16)" },
  playerWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
  errorBlock: { alignItems: "center", gap: 10, paddingHorizontal: 32 },
  errorText: { color: "#FFFFFF", fontSize: 14, textAlign: "center" },
});
