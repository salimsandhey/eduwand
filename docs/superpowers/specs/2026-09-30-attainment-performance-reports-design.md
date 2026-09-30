# Attainment Report / Performance Report split — Design

**Date:** 2026-09-30
**Status:** Approved for planning
**Area:** unified-app teacher side (Analytics tab, Topic screens), backend attainment/analytics routes, AI assignment generation

---

## 1. Problem

The client's spec calls for one Analytics tab offering two distinct reports:

- **Attainment Report** — qualitative. What was taught, what was observed, what
  the desired outcomes (objectives) were, and whether the class met the
  benchmark set for each of them. Class view only.
- **Performance Report** — quantitative. Class and student-level score
  history/trends. No qualitative content.

Today neither exists as such. What exists instead:

- `TeacherAnalyticsScreen` (the current "Analytics" tab) is already,
  functionally, the Performance report — class average, score bands, weakest
  assignments, a 7-day trend, and a student drill-down — but it's labeled
  "Analytics," not "Performance Report," and it's scoped to an entire class
  section across every subject/topic ever taught, with no way to narrow it.
- `AttainmentReportScreen` (reached only from a Topic's detail page, or a
  per-subject "view report" action on the Topic list — never from the
  Analytics tab) already covers what-was-done, observations, and objective
  *coverage* — but it also has its own student-level tab (out of scope per the
  "class view only" requirement), and its "Objectives" tab only lists which
  objectives the taught material addressed. It never compares actual
  performance against a benchmark, because no question is linked to the
  objective it assesses and no benchmark value exists anywhere.

This spec covers: introducing the report-type chooser, aligning the two
reports' scoping, dropping Attainment's student tab, fixing an existing
score-band inconsistency, and building real objective-benchmark scoring
end to end (schema, AI-generation tagging, and the report UI).

## 2. Decisions (locked during brainstorming)

| Area | Decision |
|---|---|
| Entry point | No separate full-screen chooser. The existing Analytics tab gains a scope picker (class → subject/topic, "All subjects" included) and a report-type segmented control (Attainment / Performance), matching the tab-picker pattern the app already uses. Attainment is disabled when scope = "All subjects." |
| Attainment scope | Class view only. The existing per-student drill-down tab is removed from Attainment; that capability already exists in Performance's student tab. |
| Report scoping | Aligned. Performance gains the same subject/topic scoping Attainment already has (in addition to "All subjects," which keeps today's whole-class-section behavior). |
| Score-band thresholds | Both reports currently hardcode 80/60% cutoffs in two different places. Both now read the school's actual `ClassBandConfig.level1MinPercent` / `level2MinPercent`. |
| Benchmark level | Per objective, per topic. Each `TopicObjective` gets its own `benchmarkPercent`. |
| Benchmark default | `ClassBandConfig.level1MinPercent` at the time the objective is first materialized. Editable per-objective afterward. |
| Setting the benchmark | Inline, in the Attainment report's Objectives tab. No separate setup screen, no new step before generating assignments. |
| Question → objective linking | AI-tagged at generation time. The single-topic AI assignment-generation prompt is given the topic's objectives with stable ids and must return which objective (or none) each question assesses. |
| Scope of tagging | Single-topic AI generation only (`POST /topics/:id/assignment-draft`). Multi-topic generation and manually-built assignments are untouched — no objective tagging there, for now. |
| Backfill | None. Assignments generated before this ships have no objective tag and simply fall back to today's plain "objective covered" listing, with no benchmark line. |

## 3. Data model changes

### 3.1 New `TopicObjective` model

Objectives currently live only as loose strings inside `Generation.content`
JSON (parsed at read-time by `collectObjectiveCoverage()` in
`attainment-reports.ts`). To attach a benchmark and let a question reference
one by a stable id, they need to become real rows — but promoting them
up-front (e.g. the moment a lesson plan is generated) would require
reconciling repeated/reworded objectives across multiple generations for the
same topic, which is a bigger and riskier piece of surgery than this feature
needs.

Instead, `TopicObjective` rows are materialized **lazily**, the moment a
single-topic AI assignment is generated (the first point stable ids are
actually needed):

```prisma
model TopicObjective {
  id              String   @id @default(uuid()) @db.Uuid
  topicId         String   @map("topic_id") @db.Uuid
  topic           Topic    @relation(fields: [topicId], references: [id])
  text            String
  bloomsStage     String?  @map("blooms_stage")
  benchmarkPercent Float   @map("benchmark_percent")
  createdAt       DateTime @default(now()) @map("created_at")
  updatedAt       DateTime @updatedAt @map("updated_at")

  @@unique([topicId, text])
  @@map("topic_objective")
}
```

- `@@unique([topicId, text])` — regenerating an assignment for the same topic
  reuses existing rows (upsert by exact objective text) instead of duplicating
  them or losing an edited benchmark.
- `bloomsStage` mirrors what `collectObjectiveCoverage()` already extracts
  (`extractStage()`), stored here instead of re-derived, since this row is now
  the durable copy.
- `benchmarkPercent` default: read the school's `ClassBandConfig.level1MinPercent`
  (falling back to the model's own default of 80 if the school has no
  `ClassBandConfig` row yet) at creation time only; never overwritten by a
  later regeneration once a teacher has (possibly) edited it.

### 3.2 `AssignmentQuestion` JSON shape

`toStoredQuestion()` in `assignments.ts` gains one optional field, written
only by the single-topic AI-draft route:

```ts
{
  // ...existing fields unchanged...
  objectiveId?: string; // TopicObjective.id this question assesses, or omitted
}
```

Rows without it (every question generated before this ships, every
manually-created question, every multi-topic-generated question) are simply
excluded from benchmark computation — they still count toward the plain
average-score views exactly as today.

### 3.3 No change to `ClassBandConfig`, `AttainmentReport`, or `Observation`

`ClassBandConfig` is read from (default source for a new objective's
benchmark, and the fixed cutoff both reports currently hardcode), never
written to by this feature. `AttainmentReport`'s existing cache-row shape and
`Observation` are unchanged.

## 4. Backend

### 4.1 Single-topic AI generation — objective materialization + tagging

In `POST /topics/:id/assignment-draft` (`assignments.ts`, ~line 796 onward):

1. After loading the topic and before calling the generator, compute
   `collectObjectiveCoverage()`'s output as done today (reuse, don't
   duplicate — export it from `attainment-reports.ts` or lift it to a shared
   module).
2. Upsert each into `TopicObjective` by `(topicId, text)`, defaulting
   `benchmarkPercent` to the school's `ClassBandConfig.level1MinPercent` only
   on create.
3. Pass the resulting `{ id, text }[]` into `AssignmentGenInput` (new field
   `objectives: { id: string; text: string }[]`, replacing the current plain
   `string[]` for this route only — the multi-topic route keeps passing plain
   strings, since it doesn't tag).
4. Prompt change in `ai.ts`'s `generateAssignmentFromTopic`: the JSON schema
   for each question gains `"objectiveId": string | null` — must be one of
   the given ids, or `null` for a general-revision question not tied to one.
5. `toStoredQuestion` writes `objectiveId` onto the question when the AI
   returned a valid one (validated against the known id set; an
   unrecognized id from a malformed response is dropped, not stored).

### 4.2 Benchmark-vs-actual computation

In `computeTopicReport()` (`attainment-reports.ts`): for each of the topic's
`TopicObjective` rows, gather every question across the topic's assignments
whose stored `objectiveId` matches, gather graded scores for exactly those
questions across all submissions (per-question correctness/marks, not the
submission's overall score), compute the average % correct, and compare to
`benchmarkPercent`:

```ts
{
  id, text, bloomsStage, benchmarkPercent,
  classAveragePercent: number | null, // null = no graded data tagged to this objective yet
  met: boolean | null,                // null when classAveragePercent is null
}
```

This is returned as a new `objectiveAttainment` array alongside the existing
`objectiveCoverage`/`stageCoverage` (which stay as-is as the coverage-only
view for older/untagged topics — see 4.4).

Per-question correctness is already persisted on `Grade.questionDetails`
(`{questionId, correct, marksAwarded, note}[]`, written by `gradeSubmission`
— see `submissions.ts`). No new storage: build a `questionId -> objectiveId`
map from the assignment's `questions` JSON (each question's `AnswerKey.marks`,
default 1, is its max marks), then for each objective sum `marksAwarded`
across every matching question detail from every graded submission, divide
by the summed max marks for those same questions × submissions, ×100 — the
same earned/total-marks percentage pattern `gradeSubmission`'s own `finalise`
already uses for the overall score, just scoped to one objective's questions
instead of all of them.

### 4.3 New endpoint: edit an objective's benchmark

```
PATCH /topic-objectives/:id
Body: { benchmarkPercent: number }
```

Teacher/leadership/admin scoped, school-scoped (join through `topic.schoolId`).
Returns the updated row. This is the only write path for `benchmarkPercent`.

### 4.4 Fallback for untagged topics

`objectiveAttainment` is naturally empty for any topic with no
`TopicObjective` rows yet (i.e. no single-topic AI assignment has ever been
generated for it since this ships). The Objectives tab keeps rendering
today's plain `objectiveCoverage` list as a fallback in that case — see 5.2.

### 4.5 Score-band consistency fix

`bandsOf()` in `attainment-reports.ts` and the equivalent inline banding logic
in `ai-analytics.ts`/`TeacherAnalyticsScreen.tsx` currently hardcode 80/60.
Both now take the school's `ClassBandConfig` (fetched once per request) and
use `level1MinPercent`/`level2MinPercent` instead of the literals. A school
with no `ClassBandConfig` row yet uses the Prisma column defaults (80/50),
unchanged from today's effective behavior.

### 4.6 Performance report scoping

`GET /analytics/ai/class/:id` and `GET /analytics/ai/student/:id` gain
optional query params `subject?: string` and `topicId?: string`:

- Neither given: today's behavior (whole class section / whole student
  history), unchanged.
- `subject` given: filter assignments (class endpoint) or submissions'
  assignments (student endpoint) to that subject's topics.
- `topicId` given: filter to that one topic's assignments.

`weeklyTrendFor` is unchanged — it operates on whatever submission set it's
handed, scoped or not.

## 5. Client (unified-app)

### 5.1 Analytics tab restructure

`TeacherAnalyticsScreen.tsx` gains, above the existing class-section chip row:

- **Scope picker**: "All subjects" chip (default, matches today's behavior)
  plus one chip per subject found in `listTopics(classSectionId)` results
  (deduped client-side — no new backend endpoint needed for this). Selecting
  a subject reveals a second row of topic chips (including an implicit "All
  topics in this subject" option) for that subject.
- **Report type segmented control**: "Attainment" / "Performance". Disabled
  (with a short inline hint) when scope = "All subjects". Defaults to
  "Performance" so existing behavior is what a teacher sees with zero taps.

Below that, the screen renders either:
- The existing Class report / Student report tab content (Performance),
  now passing `subject`/`topicId` through to `getClassAnalytics`/
  `getStudentAnalytics`.
- The Attainment panel (5.2) for the selected topic or subject roll-up,
  reusing `computeTopicReport`/`computeSubjectReport` via the existing
  `getAttainmentReport`/`getSubjectAttainmentReport` client calls.

Screen title changes from "Analytics" to reflect the selected report
("Performance Report" / "Attainment Report"); the tab bar entry itself stays
labeled "Analytics".

### 5.2 Attainment panel changes

Extract the class-view portion of `AttainmentReportScreen.tsx` into a
reusable component (used both here and by the screen's existing standalone
entry points, which keep working unchanged):

- **Drop the "Student report" tab** entirely, along with `StudentList`,
  `selectedStudent` state, and the student breakdown sheet modal — that
  capability now lives only in Performance.
- **Objectives tab**: for each `TopicObjective` returned in
  `objectiveAttainment`, render *Benchmark: 75% · Class average: 68% · Not
  met* (or *Met*, or *No graded data yet* when `classAveragePercent` is
  null). Tapping the row opens a small inline editor (a `TextInput` or
  stepper) for `benchmarkPercent`, saved via the new `PATCH
  /topic-objectives/:id` on blur/confirm.
- Topics with an empty `objectiveAttainment` array (nothing tagged yet) keep
  rendering today's plain `objectiveCoverage` list, unchanged, with no
  benchmark line — this is the natural fallback described in 4.4, not a
  special case to build.

### 5.3 `api/client.ts`

- `ClassAnalytics`/`getClassAnalytics`, `StudentAnalytics`/
  `getStudentAnalytics`: add optional `subject`/`topicId` params, threaded
  into the query string.
- `AttainmentReportRecord`: add `objectiveAttainment: { id, text, bloomsStage,
  benchmarkPercent, classAveragePercent, met }[]`.
- New: `updateTopicObjectiveBenchmark(token, objectiveId, benchmarkPercent)`.

### 5.4 Existing entry points unchanged

`TopicDetailScreen`'s report icon and `TopicListScreen`'s "view report"
action keep navigating straight to `AttainmentReport` with the same params —
they just land on the now-student-tab-free version of the screen.

## 6. Error handling

| Failure | Behaviour |
|---|---|
| AI returns an `objectiveId` not in the given set (hallucinated/malformed) | Dropped silently at `toStoredQuestion` time — question is stored with no `objectiveId`, exactly like today's untagged questions. Generation is not blocked or retried for this alone. |
| `TopicObjective` upsert races (two generations for the same topic in quick succession) | The `@@unique([topicId, text])` constraint makes this a normal upsert conflict; Prisma's `upsert` handles it as an update, no special handling needed. |
| A topic's objectives changed (new lesson plan regenerated with reworded objectives) after benchmarks were already set on the old ones | Old `TopicObjective` rows are untouched (matched by exact text) and simply stop appearing in fresh `collectObjectiveCoverage()` output; new text creates new rows with a fresh default benchmark. No merge/reconciliation — acceptable per the "materialize lazily, no backfill" decision. |
| School has no `ClassBandConfig` row | Falls back to the Prisma column defaults (80/50) everywhere thresholds are read — same effective behavior as today's hardcoded literals. |
| `PATCH /topic-objectives/:id` with an out-of-range value | 400 validation error, `benchmarkPercent` must be 0–100. |

## 7. Testing

**Backend**
- `attainment-reports.test.ts`: `computeTopicReport` returns
  `objectiveAttainment` with correct `classAveragePercent`/`met` when
  questions are tagged and graded; returns an empty array (with the existing
  `objectiveCoverage` fallback intact) for a topic with no `TopicObjective`
  rows; score bands use `ClassBandConfig` when present, defaults otherwise.
- `assignments.test.ts`: single-topic AI-draft route upserts `TopicObjective`
  rows idempotently across two generations for the same topic; a
  hallucinated `objectiveId` is dropped, not stored; multi-topic route never
  writes `TopicObjective` or `objectiveId`.
- `ai.test.ts`: `generateAssignmentFromTopic`'s prompt/response handling
  accepts `objectiveId: null` and a valid id; stub/heuristic fallback omits
  `objectiveId` (no behavior change there).
- `ai-analytics.test.ts`: `subject`/`topicId` query params correctly narrow
  both class and student endpoints; omitting them reproduces today's
  unscoped result exactly.
- New `topic-objectives.test.ts`: `PATCH` updates the benchmark, 400 on an
  out-of-range value, 404 across schools.

**Client**
- `TeacherAnalyticsScreen`: Attainment option disabled when scope is "All
  subjects"; switching scope re-fetches with the right params; report-type
  default is Performance.
- Attainment panel: no student tab present; an objective with graded tagged
  questions shows benchmark/average/met; editing a benchmark persists via
  the new endpoint; an untagged topic falls back to the plain coverage list.

## 8. Out of scope

- Backfilling `objectiveId` onto assignments/questions created before this
  ships.
- Objective tagging for manually-built assignments or the multi-topic AI
  generation flow.
- Any reconciliation between reworded objectives across regenerated lesson
  plans (each distinct wording is its own `TopicObjective` row).
- A dedicated full-screen "choose your report" step — the chooser lives
  inline in the existing Analytics tab.
- Longer-than-7-day historical trend for the class-level Performance view
  (the enrolment-analytics module's `buildMonthBuckets` pattern is a
  candidate for later, not part of this piece of work).

## 9. Rollout notes

- Two Prisma migrations: new `TopicObjective` table; new optional
  `objectiveId` is JSON-shape only (no column) on `Assignment.questions`.
- Additive throughout — every existing attainment/performance screen and
  endpoint keeps working for data that predates this change; the new
  benchmark scoring only ever adds a line that wasn't there before.
- No feature flag needed — the whole feature only "activates" per topic the
  first time a single-topic AI assignment is generated against it after
  this ships.
