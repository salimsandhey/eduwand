import { Card } from "../components/Card";

// The AI Module (Lesson Studio, Assignment Lab, ai_usage_log) hasn't been built at
// all - there is no backend for this screen yet, not even a partial one. This is a
// real placeholder, not a stub that pretends to work.
export function AiUsagePage() {
  return (
    <div>
      <h1 style={{ marginTop: 0 }}>AI Usage Analytics</h1>
      <Card>
        <p style={{ margin: 0, color: "var(--text-secondary)" }}>
          This screen has no backend yet. The AI Module (Lesson Studio, Assignment Lab, and the{" "}
          <code>ai_usage_log</code> table it would read from) hasn't been built - Module 2 in the Engineering
          PRD is still entirely unbuilt. Generations per teacher, grading turnaround, and feature usage
          breakdown will land here once that module exists.
        </p>
      </Card>
    </div>
  );
}
