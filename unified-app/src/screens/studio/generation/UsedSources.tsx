import { useState } from "react";
import { View, Text, Image, Pressable, ScrollView, StyleSheet, Linking } from "react-native";
import * as WebBrowser from "expo-web-browser";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../../context/AuthContext";
import { useTheme } from "../../../theme/ThemeContext";
import { api, ContextSource } from "../../../api/client";
import { SheetModal } from "../../../components/SheetModal";
import { FullScreenViewer } from "../../../components/FullScreenViewer";

// Most pages the in-app PDF viewer will page through.
const MAX_VIEWER_PAGES = 100;

const TYPE_ICONS: Record<ContextSource["sourceType"], keyof typeof Ionicons.glyphMap> = {
  pdf: "document-text-outline",
  docx: "document-text-outline",
  pptx: "easel-outline",
  image: "image-outline",
  url: "link-outline",
  youtube: "logo-youtube",
  idream_k12: "library-outline",
};
const TYPE_LABELS: Record<ContextSource["sourceType"], string> = {
  pdf: "PDF",
  docx: "DOCX",
  pptx: "PPTX",
  image: "Image",
  url: "Link",
  youtube: "YouTube",
  idream_k12: "K-12",
};
const TYPE_COLORS: Record<ContextSource["sourceType"], string> = {
  pdf: "#E4574F",
  docx: "#4C6FEA",
  pptx: "#E8952E",
  image: "#2FAE66",
  url: "#2AACC9",
  youtube: "#FF0000",
  idream_k12: "#8B5CF6",
};

const EXCERPT_CHARS = 1500;

function sourceTitle(source: ContextSource): string {
  return source.originalFilename?.replace(/^\d{10,}-/, "") ?? source.sourceUrl ?? source.idreamK12ReferenceId ?? TYPE_LABELS[source.sourceType];
}

function hostOf(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

interface Props {
  sources: ContextSource[];
  topicId: string;
  // Ids of sources the teacher chose to show as-is inside the output (as
  // opposed to just being read by the AI as background).
  shownAsIsIds?: Set<string>;
}

// Everything a generation was based on, each one tappable: a preview of the
// actual image / first PDF page, the text the AI read, and a way to open the
// original file or link.
export function UsedSources({ sources, topicId, shownAsIsIds }: Props) {
  const { accessToken } = useAuth();
  const { colors, pressedOpacity } = useTheme();
  const [open, setOpen] = useState<ContextSource | null>(null);
  // The full-screen in-app viewer. Opened after the details sheet has closed -
  // two native modals on screen at once is unreliable, especially on Android.
  const [viewer, setViewer] = useState<ContextSource | null>(null);

  if (sources.length === 0) return null;

  const previewUrl = (source: ContextSource, width: number) =>
    accessToken && (source.sourceType === "image" || source.sourceType === "pdf")
      ? api.contextMediaUrl(topicId, source.id, accessToken, { page: source.sourceType === "pdf" ? 1 : undefined, width })
      : null;

  function openViewer(source: ContextSource) {
    setOpen(null);
    setTimeout(() => setViewer(source), 250);
  }

  function openOriginal(source: ContextSource) {
    if (!accessToken) return;
    if (source.fileLocation) Linking.openURL(api.contextSourceFileUrl(topicId, source.id, accessToken));
    else if (source.sourceUrl) WebBrowser.openBrowserAsync(source.sourceUrl);
  }

  function metaLine(source: ContextSource): string {
    const parts: string[] = [TYPE_LABELS[source.sourceType]];
    if (source.sourceType === "pdf" && source.pageCount) parts.push(`${source.pageCount} ${source.pageCount === 1 ? "page" : "pages"}`);
    if (source.sourceType === "url" || source.sourceType === "youtube") {
      const host = hostOf(source.sourceUrl);
      if (host) parts.push(host);
    }
    if (source.attribution) parts.push(source.attribution);
    return parts.join(" · ");
  }

  const openPreview = open ? previewUrl(open, 1000) : null;
  const openExcerpt = open?.extractedText ? open.extractedText.replace(/\s+\n/g, "\n").trim() : "";
  const hasOriginal = !!open && (!!open.fileLocation || !!open.sourceUrl);
  const openColor = open ? TYPE_COLORS[open.sourceType] : colors.accent;

  return (
    <View>
      {sources.map((source) => {
        const color = TYPE_COLORS[source.sourceType];
        const thumb = source.sourceType === "image" ? previewUrl(source, 240) : null;
        const shownAsIs = shownAsIsIds?.has(source.id);
        return (
          <Pressable
            key={source.id}
            onPress={() => setOpen(source)}
            style={({ pressed }) => [styles.row, { backgroundColor: colors.surfaceRaised }, pressed && { opacity: pressedOpacity }]}
            accessibilityRole="button"
            accessibilityLabel={`${sourceTitle(source)}, ${TYPE_LABELS[source.sourceType]}. Open details`}
          >
            {thumb ? (
              <Image source={{ uri: thumb }} style={styles.thumb} resizeMode="cover" />
            ) : (
              <View style={[styles.iconWrap, { backgroundColor: `${color}1F` }]}>
                <Ionicons name={TYPE_ICONS[source.sourceType]} size={18} color={color} />
              </View>
            )}
            <View style={styles.rowBody}>
              <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={1}>{sourceTitle(source)}</Text>
              <Text style={[styles.meta, { color: colors.textMuted }]} numberOfLines={1}>{metaLine(source)}</Text>
              <Text style={[styles.usage, { color: shownAsIs ? colors.accent : colors.textMuted }]} numberOfLines={1}>
                {shownAsIs ? "Shown in the output" : "Read by the AI as background"}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
          </Pressable>
        );
      })}

      <SheetModal visible={open !== null} onClose={() => setOpen(null)} closeLabel="Close source" maxHeightRatio={0.88}>
        {open ? (
          <>
            <View style={styles.sheetHeader}>
              <View style={[styles.iconWrap, { backgroundColor: `${openColor}1F` }]}>
                <Ionicons name={TYPE_ICONS[open.sourceType]} size={18} color={openColor} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.sheetTitle, { color: colors.textPrimary }]} numberOfLines={2}>{sourceTitle(open)}</Text>
                <Text style={[styles.meta, { color: colors.textMuted }]} numberOfLines={2}>{metaLine(open)}</Text>
              </View>
              <Pressable onPress={() => setOpen(null)} hitSlop={10} style={[styles.closeButton, { backgroundColor: colors.surfaceRaised }]} accessibilityRole="button" accessibilityLabel="Close">
                <Ionicons name="close" size={18} color={colors.textPrimary} />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.sheetBody}>
              {openPreview ? (
                <Image source={{ uri: openPreview }} style={[styles.preview, { backgroundColor: colors.surfaceRaised }]} resizeMode="contain" accessibilityLabel={`Preview of ${sourceTitle(open)}`} />
              ) : null}

              {open.sourceType === "image" || open.sourceType === "pdf" ? (
                <Pressable
                  onPress={() => openViewer(open)}
                  style={({ pressed }) => [styles.openButton, { backgroundColor: colors.accent }, pressed && { opacity: pressedOpacity }]}
                  accessibilityRole="button"
                >
                  <Ionicons name="expand-outline" size={16} color={colors.accentOn} />
                  <Text style={[styles.openButtonText, { color: colors.accentOn }]}>
                    {open.sourceType === "image" ? "View full image" : "View pages"}
                  </Text>
                </Pressable>
              ) : null}

              {hasOriginal && open.sourceType !== "image" ? (
                <Pressable
                  onPress={() => openOriginal(open)}
                  style={({ pressed }) => [
                    open.sourceType === "pdf" ? styles.secondaryButton : styles.openButton,
                    open.sourceType === "pdf" ? { borderColor: colors.border } : { backgroundColor: colors.accent },
                    pressed && { opacity: pressedOpacity },
                  ]}
                  accessibilityRole="button"
                >
                  <Ionicons
                    name={open.fileLocation ? "download-outline" : "open-outline"}
                    size={16}
                    color={open.sourceType === "pdf" ? colors.accent : colors.accentOn}
                  />
                  <Text style={[styles.openButtonText, { color: open.sourceType === "pdf" ? colors.accent : colors.accentOn }]}>
                    {open.fileLocation ? "Download original" : "Open link"}
                  </Text>
                </Pressable>
              ) : null}

              {open.sourceUrl && open.fileLocation ? (
                <Pressable onPress={() => WebBrowser.openBrowserAsync(open.sourceUrl!)} style={styles.linkRow} accessibilityRole="button">
                  <Ionicons name="globe-outline" size={14} color={colors.accent} />
                  <Text style={[styles.linkText, { color: colors.accent }]} numberOfLines={1}>Where it came from</Text>
                </Pressable>
              ) : null}

              {openExcerpt ? (
                <View style={styles.excerptBlock}>
                  <Text style={[styles.excerptLabel, { color: colors.textMuted }]}>
                    {open.sourceType === "image" ? "What the AI read from this image" : "Text the AI read"}
                  </Text>
                  <Text style={[styles.excerptText, { color: colors.textSecondary }]}>
                    {openExcerpt.length > EXCERPT_CHARS ? `${openExcerpt.slice(0, EXCERPT_CHARS).trim()}…` : openExcerpt}
                  </Text>
                </View>
              ) : (
                <Text style={[styles.meta, { color: colors.textMuted, marginTop: 14 }]}>No text was read from this source.</Text>
              )}
            </ScrollView>
          </>
        ) : null}
      </SheetModal>

      <FullScreenViewer
        visible={viewer !== null}
        onClose={() => setViewer(null)}
        title={viewer ? sourceTitle(viewer) : ""}
        count={viewer?.sourceType === "pdf" ? Math.min(Math.max(viewer.pageCount ?? 1, 1), MAX_VIEWER_PAGES) : 1}
        urlFor={(index) =>
          viewer && accessToken
            ? api.contextMediaUrl(topicId, viewer.id, accessToken, viewer.sourceType === "pdf" ? { page: index + 1, width: 1400 } : {})
            : ""
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 14, padding: 10, marginTop: 8 },
  thumb: { width: 44, height: 44, borderRadius: 10 },
  iconWrap: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  rowBody: { flex: 1, gap: 2 },
  title: { fontSize: 13, fontWeight: "800" },
  meta: { fontSize: 11, fontWeight: "600" },
  usage: { fontSize: 10, fontWeight: "700" },
  sheetHeader: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 6 },
  sheetTitle: { fontSize: 16, fontWeight: "800" },
  closeButton: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  sheetBody: { paddingTop: 10, paddingBottom: 8 },
  preview: { width: "100%", height: 260, borderRadius: 12 },
  openButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 44, borderRadius: 12, marginTop: 14 },
  secondaryButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 44, borderRadius: 12, borderWidth: 1, marginTop: 10 },
  openButtonText: { fontSize: 14, fontWeight: "800" },
  linkRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 12 },
  linkText: { fontSize: 12, fontWeight: "700", flexShrink: 1 },
  excerptBlock: { marginTop: 16 },
  excerptLabel: { fontSize: 11, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.4 },
  excerptText: { fontSize: 13, lineHeight: 19, marginTop: 6 },
});
