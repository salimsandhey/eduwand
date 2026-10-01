import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { api } from "../api/client";

// Downloads the class's full-data zip and hands it to the native share sheet
// ("Save to Files", Drive, WhatsApp...) - same pattern as the analytics PDF
// exports. Throws with the server's message on failure.
export async function downloadClassBackup(
  accessToken: string,
  schoolId: string,
  classSection: { id: string; className: string; sectionName: string }
): Promise<void> {
  const fileName = `${classSection.className}-${classSection.sectionName}-backup.zip`.replace(/\s+/g, "-");
  const fileUri = `${FileSystem.cacheDirectory}${fileName}`;
  const result = await FileSystem.downloadAsync(api.classExportUrl(schoolId, classSection.id), fileUri, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (result.status !== 200) {
    let message = "Could not create the backup. Please try again.";
    try {
      const body = JSON.parse(await FileSystem.readAsStringAsync(fileUri));
      if (body?.error?.message) message = body.error.message;
    } catch {
      // keep the generic message
    }
    await FileSystem.deleteAsync(fileUri, { idempotent: true });
    throw new Error(message);
  }

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(fileUri, { mimeType: "application/zip", dialogTitle: "Save class backup", UTI: "public.zip-archive" });
  } else {
    throw new Error(`Backup saved to ${fileUri}`);
  }
}
