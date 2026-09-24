import { prisma } from "./prisma";
import { storage } from "./storage";

const RETENTION_HOURS = 24;

// Copyright compliance (spec: "Uploaded files are deleted within 24 hours; no
// permanent storage"). Purges the file and its extracted text, keeps the row
// + citation metadata so past generations still show what they were grounded
// on without holding the source material itself.
export async function deleteExpiredContextSources(): Promise<number> {
  const cutoff = new Date(Date.now() - RETENTION_HOURS * 3600 * 1000);
  const expired = await prisma.contextSource.findMany({
    where: { createdAt: { lt: cutoff }, fileLocation: { not: null } },
  });
  for (const source of expired) {
    if (source.fileLocation) {
      try {
        await storage.remove(source.fileLocation);
      } catch (err) {
        // Log and continue - a storage-layer failure on one file should not
        // block purging the rest.
        console.error(`[contextRetention] failed to delete expired context file ${source.fileLocation}`, err);
      }
    }
  }
  if (expired.length === 0) return 0;
  const result = await prisma.contextSource.updateMany({
    where: { id: { in: expired.map((s) => s.id) } },
    data: { fileLocation: null, extractedText: null },
  });
  return result.count;
}
