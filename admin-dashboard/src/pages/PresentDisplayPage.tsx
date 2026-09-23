import { Link, useParams } from "react-router-dom";
import { usePresentSession } from "../hooks/usePresentSession";
import type { PresentDisplayState } from "../api/client";
import "./present.css";

const LETTERS = ["A", "B", "C", "D", "E"];

// Public, unauthenticated - the projector/classroom-screen view of a live
// quick check. Requests role=display, so the backend never even sends a
// student's name or which option they picked - not just a UI choice not to
// render it (see present.ts's displayState()). Paired with PresentControlPage,
// which is what the teacher actually taps (role=control, full identity).
export function PresentDisplayPage() {
  const { code } = useParams<{ code: string }>();
  const { state, error, ended } = usePresentSession(code, "display");

  return (
    <div className="present-shell">
      <header className="present-header">
        <img src="/eduwand-logo.png" alt="EduWand" className="present-brand" />
        <span className="present-header-caption">Quick Check</span>
        <div className="present-spacer" />
        <div className={`present-pill ${state && !ended ? "live" : ""}`}>
          <span className="dot" />
          <span>{ended ? "Session ended" : state ? "Live" : error ? "Not connected" : "Connecting…"}</span>
        </div>
      </header>

      <main className="present-main">
        {error ? (
          <div className="present-centered">
            <div className="present-empty">{error}</div>
          </div>
        ) : ended ? (
          <div className="present-centered">
            <div className="present-empty">This session has ended.</div>
          </div>
        ) : !state ? (
          <div className="present-centered">
            <div className="present-empty">Connecting…</div>
          </div>
        ) : (
          <Stage state={state} />
        )}
      </main>

      {code && !error && !ended ? (
        <div style={{ textAlign: "center", padding: "0 20px 14px" }}>
          <Link to={`/present/${code}/control`} style={{ fontSize: 11, color: "var(--text-muted)", textDecoration: "underline" }}>
            Are you the teacher? Open the control page instead
          </Link>
        </div>
      ) : null}
    </div>
  );
}

function Stage({ state }: { state: PresentDisplayState }) {
  const question = state.questions[state.currentQuestionIndex];
  if (!question) return <div className="present-empty">No questions in this quick check.</div>;

  const { correct: good, incorrect: bad, doubt } = state.counts;
  const total = Math.max(state.totalStudents, 1);

  return (
    <div className="present-stage">
      <div>
        <div className="present-qcard">
          <div className="present-qnum">
            Question {state.currentQuestionIndex + 1} of {state.questions.length}
          </div>
          <h1 className="present-qtext">{question.prompt}</h1>
          <div className="present-opts">
            {question.options.map((opt, i) => (
              <div key={i} className={`present-opt ${state.currentQuestionRevealed && i === question.correctOptionIndex ? "correct" : ""}`}>
                <div className="k">{LETTERS[i]}</div>
                <div>{opt}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <aside className="present-side">
        <div className="present-card">
          <h3>Answered</h3>
          <div className="present-count">
            {state.answeredCount}
            <small> of {state.totalStudents}</small>
          </div>
          <div className="present-seats">
            {state.seats.map((seat, i) => (
              <div key={i} className={`present-seat ${seat.answered ? "in" : ""}`}>
                {seat.seatNumber ?? "•"}
              </div>
            ))}
          </div>
          <p className="present-note">Shows who has answered - never what they chose.</p>
        </div>

        <div className="present-card">
          <h3>Live responses</h3>
          <div className="present-bars">
            <div className="present-bar present-good">
              <div className="top">
                <span className="ico">✓</span>
                <span>Correct</span>
                <span className="val">{good}</span>
              </div>
              <div className="present-track">
                <div className="present-fill" style={{ width: `${(100 * good) / total}%` }} />
              </div>
            </div>
            <div className="present-bar present-bad">
              <div className="top">
                <span className="ico">✕</span>
                <span>Incorrect</span>
                <span className="val">{bad}</span>
              </div>
              <div className="present-track">
                <div className="present-fill" style={{ width: `${(100 * bad) / total}%` }} />
              </div>
            </div>
            <div className="present-bar present-doubt">
              <div className="top">
                <span className="ico">?</span>
                <span>Doubt</span>
                <span className="val">{doubt}</span>
              </div>
              <div className="present-track">
                <div className="present-fill" style={{ width: `${(100 * doubt) / total}%` }} />
              </div>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}
