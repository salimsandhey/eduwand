import { useCallback, useEffect, useState } from "react";
import { api } from "../../api/client";
import type { DeletedClassSection } from "../../api/client";
import { Card } from "../../components/Card";
import { Modal, ModalFooter } from "../../components/Modal";
import { btn } from "../../components/buttons";

const GRACE_DAYS = 30;

type ClassRef = { id: string; className: string; sectionName: string };

const classLabel = (c: ClassRef) => `${c.className} ${c.sectionName}`.trim();
const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();
const namesMatch = (typed: string, c: ClassRef) => norm(typed) === norm(classLabel(c));
const daysLeft = (purgeAt: string) => Math.max(0, Math.ceil((new Date(purgeAt).getTime() - Date.now()) / 86_400_000));

// Downloads the class's full-data zip through the browser. Also stamps the
// class as backed up server-side, which unlocks "Delete permanently".
export async function downloadClassBackup(accessToken: string, schoolId: string, c: ClassRef): Promise<void> {
  const { blob, fileName } = await api.downloadClassExport(accessToken, schoolId, c.id);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

// Delete = reversible archive (restorable for 30 days from "Recently deleted"),
// gated by typing the class name. Offers the backup download first.
export function DeleteClassModal({
  classSection,
  schoolId,
  accessToken,
  onClose,
  onDeleted,
}: {
  classSection: ClassRef;
  schoolId: string;
  accessToken: string;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState<"backup" | "delete" | null>(null);
  const [hasBackup, setHasBackup] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function backup() {
    setBusy("backup");
    setError(null);
    try {
      await downloadClassBackup(accessToken, schoolId, classSection);
      setHasBackup(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the backup");
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    setBusy("delete");
    setError(null);
    try {
      await api.deleteClassSection(accessToken, schoolId, classSection.id, typed);
      onDeleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete the class");
      setBusy(null);
    }
  }

  return (
    <Modal title={`Delete ${classLabel(classSection)}?`} onClose={onClose} width={520}>
      <p style={{ marginTop: 0, fontSize: 14 }}>
        The class and all its students, lessons, assignments, grades and messages move to <strong>Recently deleted</strong>. Students lose access immediately. You can
        restore the class for {GRACE_DAYS} days; after that everything is erased permanently.
      </p>
      <button style={styles.secondaryButton} onClick={backup} disabled={busy !== null}>
        {busy === "backup" ? "Preparing backup…" : hasBackup ? "✓ Backup downloaded - download again" : "Download all data (.zip) first - recommended"}
      </button>
      <div style={{ ...styles.field, marginTop: 16 }}>
        <label style={styles.label}>Type “{classLabel(classSection)}” to confirm</label>
        <input style={styles.input} value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={classLabel(classSection)} autoFocus />
      </div>
      {error ? <p style={styles.error}>{error}</p> : null}
      <ModalFooter>
        <button style={styles.secondaryButton} onClick={onClose}>
          Cancel
        </button>
        <button style={styles.dangerButton} onClick={remove} disabled={busy !== null || !namesMatch(typed, classSection)}>
          {busy === "delete" ? "Deleting…" : "Delete class"}
        </button>
      </ModalFooter>
    </Modal>
  );
}

// "Recently deleted" - restore, back up, or permanently delete classes still in
// their 30-day window.
export function DeletedClassesCard({
  schoolId,
  accessToken,
  reloadKey,
  onRestored,
}: {
  schoolId: string;
  accessToken: string;
  /** Bump to refetch (e.g. right after a class was deleted). */
  reloadKey: number;
  onRestored: () => void;
}) {
  const [items, setItems] = useState<DeletedClassSection[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [purgeTarget, setPurgeTarget] = useState<DeletedClassSection | null>(null);
  const [typed, setTyped] = useState("");
  const [skipBackup, setSkipBackup] = useState(false);

  const load = useCallback(async () => {
    try {
      setItems(await api.listDeletedClassSections(accessToken, schoolId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load deleted classes");
    }
  }, [accessToken, schoolId]);

  useEffect(() => {
    load();
  }, [load, reloadKey]);

  async function run(id: string, action: () => Promise<void>) {
    setBusyId(id);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusyId(null);
    }
  }

  if (items && items.length === 0 && !error) return null;

  const canPurge = !!purgeTarget && namesMatch(typed, purgeTarget) && (!!purgeTarget.exportedAt || skipBackup) && busyId === null;

  return (
    <Card title="Recently deleted classes">
      <p style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 0 }}>
        Deleted classes are hidden from teachers and students and erased for good {GRACE_DAYS} days after deletion.
      </p>
      {error && !purgeTarget ? <p style={styles.error}>{error}</p> : null}
      {!items ? <p style={{ color: "var(--text-muted)" }}>Loading…</p> : null}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {items?.map((c) => (
          <div key={c.id} style={styles.deletedRow}>
            <div>
              <strong>{classLabel(c)}</strong> <span style={{ color: "var(--text-muted)", fontSize: 13 }}>· {c.academicYearLabel}</span>
              <div style={{ color: "var(--text-muted)", fontSize: 12, marginTop: 2 }}>
                {c.studentCount} students · {c.topicCount} topics · {c.assignmentCount} assignments · {daysLeft(c.purgeAt)} day{daysLeft(c.purgeAt) === 1 ? "" : "s"} left
                {c.exportedAt ? " · backup downloaded" : ""}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                style={styles.smallButton}
                disabled={busyId === c.id}
                onClick={() =>
                  run(c.id, async () => {
                    await api.restoreClassSection(accessToken, schoolId, c.id);
                    await load();
                    onRestored();
                  })
                }
              >
                Restore
              </button>
              <button
                style={styles.smallButton}
                disabled={busyId === c.id}
                onClick={() =>
                  run(c.id, async () => {
                    await downloadClassBackup(accessToken, schoolId, c);
                    await load();
                  })
                }
              >
                Download data
              </button>
              <button
                style={{ ...styles.smallButton, color: "var(--status-critical)" }}
                disabled={busyId === c.id}
                onClick={() => {
                  setPurgeTarget(c);
                  setTyped("");
                  setSkipBackup(false);
                  setError(null);
                }}
              >
                Delete permanently
              </button>
            </div>
          </div>
        ))}
      </div>

      {purgeTarget ? (
        <Modal title={`Permanently delete ${classLabel(purgeTarget)}?`} onClose={() => setPurgeTarget(null)} width={520}>
          <p style={{ marginTop: 0, fontSize: 14 }}>This erases the class, its students, lessons, assignments, grades and uploaded files. It cannot be undone.</p>
          {!purgeTarget.exportedAt ? (
            <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13, marginBottom: 12 }}>
              <input type="checkbox" checked={skipBackup} onChange={(e) => setSkipBackup(e.target.checked)} />
              I haven't downloaded a backup and I don't need one.
            </label>
          ) : null}
          <div style={styles.field}>
            <label style={styles.label}>Type “{classLabel(purgeTarget)}” to confirm</label>
            <input style={styles.input} value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={classLabel(purgeTarget)} autoFocus />
          </div>
          {error ? <p style={styles.error}>{error}</p> : null}
          <ModalFooter>
            <button style={styles.secondaryButton} onClick={() => setPurgeTarget(null)}>
              Cancel
            </button>
            <button
              style={styles.dangerButton}
              disabled={!canPurge}
              onClick={() =>
                run(purgeTarget.id, async () => {
                  await api.permanentlyDeleteClassSection(accessToken, schoolId, purgeTarget.id, { confirmName: typed, skipBackup: skipBackup || undefined });
                  setPurgeTarget(null);
                  await load();
                })
              }
            >
              {busyId ? "Deleting…" : "Delete permanently"}
            </button>
          </ModalFooter>
        </Modal>
      ) : null}
    </Card>
  );
}

const styles: Record<string, React.CSSProperties> = {
  field: { display: "flex", flexDirection: "column", gap: 6 },
  label: { fontSize: 12, fontWeight: 700, color: "var(--text-muted)" },
  input: { padding: "10px 12px", borderRadius: 8, border: "1px solid var(--border)", fontSize: 14 },
  error: { color: "var(--status-critical)", fontSize: 13, marginTop: 12, marginBottom: 0 },
  secondaryButton: btn.secondary,
  dangerButton: btn.danger,
  smallButton: btn.small,
  deletedRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
    border: "1px solid var(--border)",
    borderRadius: 8,
    padding: 12,
  },
};
