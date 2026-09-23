import { useCallback, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { usePresentSession } from "../hooks/usePresentSession";
import { useClickerReceiver, type ClickerPacket } from "../hooks/useClickerReceiver";
import { ReceiverSetupWizard } from "./ReceiverSetupWizard";
import { publicAdvancePresentQuestion, publicEndPresentSession, publicRecordPresentResponse, publicRevealPresentAnswer, ApiError, type PresentControlState } from "../api/client";
import "./present.css";

const LETTERS = ["A", "B", "C", "D", "E"];

// Public, unauthenticated - this is what the teacher actually operates (on
// their own laptop or phone, NOT the projector). Opened from a different
// device/tab than PresentDisplayPage so students never see who was tapped
// for which answer while it happens.
export function PresentControlPage() {
  const { code } = useParams<{ code: string }>();
  const { state, error, ended } = usePresentSession(code, "control");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  // Shown once automatically when the page loads, so a teacher always sees
  // the guided remote-pairing steps before diving into the quiz. Can be
  // reopened any time from the header button.
  const [wizardOpen, setWizardOpen] = useState(true);

  async function run(action: () => Promise<unknown>) {
    if (!code || busy) return;
    setBusy(true);
    setActionError(null);
    try {
      await action();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "That didn't go through - try again");
    } finally {
      setBusy(false);
    }
  }

  // The receiver read loop starts once and keeps running for the whole
  // session, so it can't close over a single render's `state`/`code` - it
  // reads them fresh from this ref on every packet instead.
  const liveRef = useRef<{ code?: string; state: PresentControlState | null }>({ code, state: null });
  liveRef.current = { code, state };

  const handleClickerPacket = useCallback((packet: ClickerPacket) => {
    const { code: liveCode, state: liveState } = liveRef.current;
    if (!liveCode || !liveState) return;
    const question = liveState.questions[liveState.currentQuestionIndex];
    if (!question) return;
    const student = liveState.roster.find((s) => s.seatNumber === packet.id);
    if (!student) return; // clicker id not assigned to anyone in this class

    // Hardware answers are "first press wins" - once this student already has
    // a recorded response for this question (from the clicker or a manual
    // tap), further clicker presses are ignored. A teacher can still correct
    // a mis-tap manually, since the tap buttons always overwrite.
    const already = liveState.responses.some((r) => r.questionId === question.id && r.studentStubId === student.studentStubId);
    if (already) return;

    if (packet.ans === "?") {
      publicRecordPresentResponse(liveCode, { questionId: question.id, studentStubId: student.studentStubId, isDoubt: true }).catch(() => {});
      return;
    }
    const optionIndex = LETTERS.indexOf(packet.ans);
    if (optionIndex < 0 || optionIndex >= question.options.length) return;
    publicRecordPresentResponse(liveCode, { questionId: question.id, studentStubId: student.studentStubId, selectedOptionIndex: optionIndex }).catch(() => {});
  }, []);

  const receiver = useClickerReceiver({ onPacket: handleClickerPacket });

  if (error) {
    return (
      <div className="present-shell">
        <main className="present-main present-centered">
          <div className="present-empty">{error}</div>
        </main>
      </div>
    );
  }
  if (ended) {
    return (
      <div className="present-shell">
        <main className="present-main present-centered">
          <div className="present-empty">This session has ended. Results are in the app under this quick check.</div>
        </main>
      </div>
    );
  }
  if (!state) {
    return (
      <div className="present-shell">
        <main className="present-main present-centered">
          <div className="present-empty">Connecting…</div>
        </main>
      </div>
    );
  }

  const question = state.questions[state.currentQuestionIndex];
  const isFirst = state.currentQuestionIndex === 0;
  const isLast = state.currentQuestionIndex === state.questions.length - 1;
  const currentResponses = state.responses.filter((r) => r.questionId === question.id);
  const selections = new Map(currentResponses.map((r) => [r.studentStubId, r.selectedOptionIndex]));
  const doubts = new Set(currentResponses.filter((r) => r.isDoubt).map((r) => r.studentStubId));

  return (
    <div className="present-shell">
      <header className="present-header">
        <img src="/eduwand-logo.png" alt="EduWand" className="present-brand" />
        <span className="present-header-caption">Control</span>
        <div className="present-spacer" />
        <button
          className={`present-pill ${receiver.status === "live" ? "live" : ""}`}
          style={{ cursor: "pointer", border: "1.5px solid var(--border)" }}
          onClick={() => setWizardOpen(true)}
        >
          <span className="dot" style={receiver.status !== "live" ? { background: receiver.status === "error" ? "var(--status-critical)" : "var(--text-muted)" } : undefined} />
          <span>
            {receiver.status === "live"
              ? `Remotes connected · ${receiver.checkedInSeats.size} checked in`
              : "Remotes"}
          </span>
        </button>
        <div className="present-pill live">
          <span className="dot" />
          <span>Question {state.currentQuestionIndex + 1} of {state.questions.length}</span>
        </div>
      </header>

      {wizardOpen ? (
        <ReceiverSetupWizard receiver={receiver} roster={state.roster} onClose={() => setWizardOpen(false)} />
      ) : null}

      <main className="present-main" style={{ paddingBottom: 100 }}>
        <div className="present-qcard" style={{ marginBottom: 18 }}>
          <div className="present-qnum">Tap each student's answer as they call it out</div>
          <h1 className="present-qtext" style={{ fontSize: 22, margin: "10px 0 0" }}>{question.prompt}</h1>
        </div>

        {actionError ? <p style={{ color: "var(--status-critical)", fontSize: 13 }}>{actionError}</p> : null}

        <div className="present-roster">
          {state.roster.map((s) => {
            const selected = selections.get(s.studentStubId);
            const isDoubt = doubts.has(s.studentStubId);
            return (
              <div key={s.studentStubId} className="present-roster-row">
                <span className="present-roster-name">{s.fullName}</span>
                <div className="present-roster-opts">
                  {question.options.map((_, i) => (
                    <button
                      key={i}
                      className={`present-roster-opt ${selected === i && !isDoubt ? "active" : ""}`}
                      disabled={busy}
                      onClick={() => run(() => publicRecordPresentResponse(code as string, { questionId: question.id, studentStubId: s.studentStubId, selectedOptionIndex: i }))}
                    >
                      {LETTERS[i]}
                    </button>
                  ))}
                  <button
                    className={`present-roster-opt doubt ${isDoubt ? "active" : ""}`}
                    disabled={busy}
                    title="Not sure"
                    onClick={() => run(() => publicRecordPresentResponse(code as string, { questionId: question.id, studentStubId: s.studentStubId, isDoubt: true }))}
                  >
                    ?
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </main>

      <div className="present-footbar">
        <button className="present-btn ghost" disabled={busy || isFirst} onClick={() => run(() => publicAdvancePresentQuestion(code as string, "prev"))}>
          ← Previous
        </button>
        <button className="present-btn" disabled={busy} onClick={() => run(() => publicRevealPresentAnswer(code as string))}>
          {state.currentQuestionRevealed ? "Hide answer" : "Reveal answer"}
        </button>
        <button className="present-btn brand" disabled={busy || isLast} onClick={() => run(() => publicAdvancePresentQuestion(code as string, "next"))}>
          Next question →
        </button>
        <div className="present-spacer" />
        <button className="present-btn ghost" disabled={busy} onClick={() => run(() => publicEndPresentSession(code as string))}>
          End &amp; see results
        </button>
      </div>
    </div>
  );
}
