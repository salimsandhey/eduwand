import { useEffect, useState } from "react";
import { Modal, ModalFooter } from "../components/Modal";
import type { useClickerReceiver } from "../hooks/useClickerReceiver";
import type { PresentRosterEntry } from "../api/client";

type Receiver = ReturnType<typeof useClickerReceiver>;
type Step = "connect" | "checkin" | "ready";

// The guided, plain-language walkthrough a teacher follows to pair the
// physical clicker remotes before a live Quick Check. Replaces the old
// single status pill, which testing showed was confusing even to us -
// this spells out one instruction per screen instead.
export function ReceiverSetupWizard({
  receiver,
  roster,
  onClose,
}: {
  receiver: Receiver;
  roster: PresentRosterEntry[];
  onClose: () => void;
}) {
  const [step, setStep] = useState<Step>(receiver.status === "live" ? "checkin" : "connect");
  const [showLog, setShowLog] = useState(false);

  // Move on automatically once the receiver actually comes online - the
  // teacher shouldn't have to click "Next" for something that just happened.
  useEffect(() => {
    if (receiver.status === "live" && step === "connect") setStep("checkin");
  }, [receiver.status, step]);

  const assigned = roster.filter((s) => s.seatNumber != null);
  const unassigned = roster.filter((s) => s.seatNumber == null);
  const checkedInCount = assigned.filter((s) => s.seatNumber != null && receiver.checkedInSeats.has(s.seatNumber)).length;

  function skip() {
    onClose();
  }

  return (
    <Modal title="Connect student remotes" onClose={onClose} width={560}>
      <div style={{ display: "flex", gap: 6, marginBottom: 18 }}>
        {(["connect", "checkin", "ready"] as Step[]).map((s) => (
          <div
            key={s}
            style={{
              flex: 1,
              height: 5,
              borderRadius: 99,
              background: step === s || (["checkin", "ready"].includes(step) && s === "connect") || (step === "ready" && s === "checkin")
                ? "var(--accent)"
                : "var(--border)",
            }}
          />
        ))}
      </div>

      {step === "connect" ? (
        <div>
          <h3 style={{ margin: "0 0 6px", fontSize: 16 }}>Step 1 of 3 · Plug in the receiver</h3>
          {!receiver.supported ? (
            <>
              <p style={styles.body}>
                This browser can't talk to the USB receiver directly. That's fine - just use Chrome or Edge on this
                computer next time, or skip this and tap each student's answer on screen instead.
              </p>
            </>
          ) : (
            <>
              <p style={styles.body}>Plug the small USB receiver into this computer.</p>
              <p style={styles.body}>
                Then click the button below and choose the receiver from the list your browser shows.
              </p>
              <button
                type="button"
                className="present-btn brand"
                style={{ width: "100%", padding: "14px 0", fontSize: 16 }}
                disabled={receiver.status === "connecting"}
                onClick={() => receiver.connect()}
              >
                {receiver.status === "connecting" ? "Connecting…" : receiver.status === "error" ? "Try again" : "Connect receiver"}
              </button>
              {receiver.status === "error" ? (
                <p style={{ ...styles.body, color: "var(--status-critical)" }}>
                  Couldn't connect. Make sure the receiver is plugged in and nothing else (another tab, another app) is
                  already using it, then try again.
                </p>
              ) : null}
            </>
          )}
        </div>
      ) : null}

      {step === "checkin" ? (
        <div>
          <h3 style={{ margin: "0 0 6px", fontSize: 16 }}>Step 2 of 3 · Turn on remotes</h3>
          <p style={styles.body}>
            Receiver connected. Now ask students to turn on their remotes and press any button once, so you can see
            they're working.
          </p>
          <div style={{ fontWeight: 700, fontSize: 14, margin: "14px 0 8px" }}>
            {checkedInCount} of {assigned.length} remotes checked in
          </div>
          <div style={{ maxHeight: 220, overflowY: "auto", border: "1px solid var(--border)", borderRadius: 10 }}>
            {assigned.map((s) => {
              const seen = s.seatNumber != null && receiver.checkedInSeats.has(s.seatNumber);
              return (
                <div
                  key={s.studentStubId}
                  style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 12px", borderBottom: "1px solid var(--border)" }}
                >
                  <span style={{ fontSize: 14 }}>{s.fullName} <span style={{ color: "var(--text-muted)" }}>· #{s.seatNumber}</span></span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: seen ? "var(--status-good)" : "var(--text-muted)" }}>
                    {seen ? "✓ Ready" : "Waiting…"}
                  </span>
                </div>
              );
            })}
            {assigned.length === 0 ? (
              <div style={{ padding: 14, fontSize: 13, color: "var(--text-muted)" }}>
                No students in this class have a clicker number assigned yet. Assign one in the school's Students tab
                to use physical remotes, or skip and tap answers on screen.
              </div>
            ) : null}
          </div>
          {unassigned.length > 0 ? (
            <p style={{ ...styles.body, marginTop: 10, fontSize: 12 }}>
              {unassigned.length} student{unassigned.length === 1 ? "" : "s"} without a remote assigned - you'll tap
              their answers on screen as usual.
            </p>
          ) : null}
          <button type="button" onClick={() => setShowLog((v) => !v)} style={styles.linkButton}>
            {showLog ? "Hide" : "Show"} technical log
          </button>
          {showLog ? (
            <pre style={styles.log}>{receiver.log.length ? receiver.log.join("\n") : "Waiting for data…"}</pre>
          ) : null}
        </div>
      ) : null}

      {step === "ready" ? (
        <div>
          <h3 style={{ margin: "0 0 6px", fontSize: 16 }}>Step 3 of 3 · Ready</h3>
          <p style={styles.body}>
            {receiver.status === "live"
              ? `Receiver connected. ${checkedInCount} of ${assigned.length} remotes have checked in - it's fine to start even if that's not everyone yet.`
              : "No receiver connected - you'll tap every student's answer on screen, same as before."}
          </p>
          <p style={styles.body}>
            Once you start, each remote press records automatically. You can still tap any student's row by hand to
            fix a mistake.
          </p>
        </div>
      ) : null}

      <ModalFooter>
        {step !== "connect" ? (
          <button type="button" className="present-btn ghost" onClick={() => setStep(step === "ready" ? "checkin" : "connect")}>
            ← Back
          </button>
        ) : null}
        <div style={{ flex: 1 }} />
        <button type="button" className="present-btn ghost" onClick={skip}>
          {receiver.status === "live" ? "Close" : "Skip - I'll tap manually"}
        </button>
        {step !== "ready" ? (
          <button type="button" className="present-btn brand" onClick={() => setStep(step === "connect" ? "checkin" : "ready")}>
            Continue →
          </button>
        ) : (
          <button type="button" className="present-btn brand" onClick={onClose}>
            Start quiz
          </button>
        )}
      </ModalFooter>
    </Modal>
  );
}

const styles = {
  body: { fontSize: 14, lineHeight: 1.5, color: "var(--text-secondary)", margin: "0 0 10px" },
  linkButton: {
    marginTop: 12,
    background: "none",
    border: "none",
    padding: 0,
    fontSize: 12,
    fontWeight: 600,
    color: "var(--text-muted)",
    cursor: "pointer",
    textDecoration: "underline",
  },
  log: {
    marginTop: 8,
    maxHeight: 140,
    overflowY: "auto" as const,
    background: "#0c1116",
    color: "#8ce08c",
    fontSize: 11,
    lineHeight: 1.5,
    padding: "10px 12px",
    borderRadius: 8,
    whiteSpace: "pre-wrap" as const,
  },
};
