# AI Assignment Generation from a Topic — Design

**Date:** 2026-09-04
**Status:** Approved for planning
**Area:** unified-app teacher side (Lesson Studio → Assignments), backend AI module

---

## 1. Problem

Today a teacher on a topic page can tap the document icon and land on a **blank**
`CreateAssignmentScreen`. Every question and every answer is typed by hand. The
`topicId` is carried silently but nothing about the topic's taught content feeds
the assignment. The only things the topic link buys are personalisation
eligibility, the per-topic attainment report, and a cosmetic "AI generated"
badge.

We want: from a topic, a guided flow where the AI drafts questions **and** model
answers grounded in what was actually taught for that topic, the teacher reviews
and edits them, and then hands off to the normal draft → verify → publish path.

## 2. Decisions (locked during brainstorming)

| Area | Decision |
|---|---|
| Grounding source | The topic's **lesson generations** (`editedOutput ?? aiOutput`, i.e. what was actually taught) **+ a free-text focus box**. Not raw context sources as the primary source, not observations. |
| Fallback grounding | If the topic has **no** succeeded generations, fall back to grounding on the topic's **context sources** (extracted text) + name/subject/board. |
| Availability gate | The AI assignment flow is available when the topic has **at least one succeeded lesson generation _or_ at least one extracted context source**. If it has neither, the flow is blocked with a hint to generate a lesson first. |
| Setup controls | Question count; easy/medium/hard difficulty mix; target learning objectives (multi-select, pulled from the lesson generations — step hidden when none parse out); question type: short-answer / MCQ / mixed. |
| AI pass | **One** call returns each question together with its model answer, grounded in the same taught-content text. |
| Review flow | A **dedicated review screen**: each question with its drafted answer, per-item edit / regenerate / accept, then it creates the draft assignment and hands off to `AssignmentDetail`. |
| Draft lifecycle | **Persist a real draft `Assignment` + `AnswerKey` rows immediately** on successful generation. The review screen edits them in place via existing draft-edit endpoints plus one new "regenerate one question" endpoint. |
| MCQ | **Full support**: new question `type` + `options` + `correctOptionIndex` in the data model; tappable single-select options on the student submit screen; MCQ auto-graded by exact match (no AI call). |
| Entry point | From a topic the AI flow is **primary** (the topic hero document icon opens it). A "write it myself" link on the setup screen still reaches today's blank `CreateAssignmentScreen` (still `topicId`-linked). The Assignment Lab `+` (no topic) is unchanged. |

## 3. Data model changes

### 3.1 `AssignmentQuestion` JSON shape

Stored in `Assignment.questions` (Prisma `Json`) and mirrored in the
`api/client.ts` `AssignmentQuestion` type.

```ts
{
  id: string;
  prompt: string;
  difficulty: "easy" | "medium" | "hard";   // as today
  type: "short_answer" | "mcq";             // NEW
  options?: string[];                        // mcq only, 2–5 entries
  correctOptionIndex?: number;               // mcq only, 0-based into options
}
```

- Rows without `type` (every pre-existing assignment) are treated as
  `short_answer` everywhere it is read. No backfill/migration of existing
  assignments.
- Question `id`s are server-assigned on generation, same id-keyed contract the
  personalisation / answer-key code already relies on.

### 3.2 `AnswerKey`

No structural change. For an MCQ question the `aiAnswer` /
`teacherVerifiedAnswer` string holds the correct option (e.g. `"B) 42"`);
`marks` unchanged. The existing `AnswerKeyReview` verify flow is untouched.

### 3.3 No new tables

The draft `Assignment` (status `draft`) **is** the working state for the review
screen.

## 4. Backend

All new routes use the existing `scoped(app)` guard
(`authenticate` + `requireSchoolScope` + `requireRoles("teacher")`).

### 4.1 New AI provider method

Add to the `AiProvider` interface in `backend/src/lib/ai.ts`, with
`GeminiAiProvider` and `StubAiProvider` implementations and a heuristic fallback
— same structure as `generateContent` / `generateAnswerKey` /
`generatePersonalisationSuggestion`.

```ts
generateAssignmentFromTopic(input: AssignmentGenInput): Promise<{
  questions: {
    prompt: string;
    type: "short_answer" | "mcq";
    difficulty: "easy" | "medium" | "hard";
    options?: string[];
    correctOptionIndex?: number;
    modelAnswer: string;
  }[];
  model: string;
}>
```

`AssignmentGenInput`:

```ts
{
  taughtContent: string;                 // assembled, capped
  objectives: string[];                  // selected by the teacher (may be empty)
  questionCount: number;                 // 1–20
  difficultyMix: { easy: number; medium: number; hard: number };
  questionTypes: "short_answer" | "mcq" | "mixed";
  focusPrompt: string | null;            // free-text steering
  subject: string;
  board: string;
  classLabel: string;
  schoolFormatInstructions: string | null;
}
```

Prompt rules (reuse the conventions already in `generateContent`):
- JSON-only response, no prose, no fences; `stripJsonFence` + `JSON.parse` with a
  fallback to the heuristic on malformed output.
- "Base the questions on the following taught content, prioritising its
  specifics over general knowledge; do not copy it verbatim."
- Bloom's-level labelling on any objective/outcome text, same allowed levels.
- Difficulty counts should match `difficultyMix`; server rescales/pads to
  `questionCount` if the model drifts (reuse the `scaleMixToQuestionCount` idea).
- For `mcq` / `mixed`: 3–5 plausible options per MCQ, exactly one correct,
  `correctOptionIndex` valid; `modelAnswer` = the correct option text.

Heuristic fallback (stub, and Gemini's catch path): one short-answer question per
selected objective (or generic prompts derived from `subject`/taughtContent
keywords when no objectives), `modelAnswer` = "Teacher review required."

### 4.2 Taught-content assembly

New helper (co-located with the generations route or in a small shared module),
`buildTaughtContentText(generations): { text: string; objectives: string[] }`:

- Consider only `generationStatus === "succeeded"` generations.
- For each, take `editedOutput ?? aiOutput`, parse by `outputType`. Port the
  client's `parseGenerationContent` logic to the backend (or extract it to a
  shared module) so both sides parse the same shapes:
  - `lesson_plan`: `overview`, `objectives[]`, activity `description`s,
    `assessment`.
  - `custom_activity_report`: `objective`, activity `description`s,
    `reportFormat`.
  - `flashcards`: each `front`/`back`.
  - `presentation`: slide `title`s + `bullets`.
- Concatenate newest-first, join with `\n\n---\n\n`, cap at
  `MAX_CONTEXT_CHARS_FOR_PROMPT` (12000, reuse constant).
- `objectives` = distinct Bloom's-tagged objective strings across the parsed
  generations (trimmed, deduped case-insensitively).
- If there are no succeeded generations, the caller falls back to
  `buildContextText(topic.contextSources)` for the text and returns
  `objectives: []`.

### 4.3 Endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/topics/:id/assignment-draft/options` | Populates the setup wizard. Returns `{ objectives: string[], hasGenerations: boolean, hasContextSources: boolean, classSection: { className, sectionName } }`. |
| `POST` | `/topics/:id/assignment-draft` | Body: `{ questionCount, difficultyMix, objectives, questionTypes, focusPrompt }`. Assembles taught content → `generateAssignmentFromTopic` → creates `Assignment` (status `draft`, `topicId` set, `classSectionId` = the topic's, `title` = `"<Topic name> – Assignment"`, `personalisationEnabled: false`) → creates one `AnswerKey` row per question (`aiAnswer` = `modelAnswer`, `questionIndex` in order) → returns the assignment (same shape as `GET /assignments/:id`). `logAiUsage({ feature: "assignment_generation" })`. **422** if the topic has neither a succeeded generation nor an extracted context source. |
| `POST` | `/assignments/:id/questions/:questionId/regenerate` | Body: `{ instruction?: string }`. Draft-only guard. Re-runs the generator for **one** question (same taught content + the assignment's original setup echoed back — see 4.4), replaces that entry in `questions` JSON and upserts its `AnswerKey` row. Returns the updated assignment. |

Reused as-is for the rest of the review screen:
- `PATCH /assignments/:id` — edit title / questions array / add / remove
  (already draft-guarded).
- `GET /assignments/:id/answer-key`, `PATCH /answer-key/:id` — the review screen
  shows and lets the teacher tweak model answers before hand-off; final
  verification still happens on `AnswerKeyReview`.
- `POST /assignments/:id/publish`, personalisation endpoints — unchanged;
  personalisation keeps working because `topicId` is set.

### 4.4 Persisting the setup for regenerate

`POST /assignments/:id/questions/:questionId/regenerate` needs the original
generation parameters. Store them on creation as a JSON blob on the assignment.
Options, cheapest first:

- **Chosen:** add a nullable `Assignment.aiGenParams Json?` column, written by
  `POST /topics/:id/assignment-draft`, read by regenerate, ignored everywhere
  else. Small, self-contained migration.
- (Rejected: re-deriving from the questions alone loses `focusPrompt` and the
  requested `questionTypes`.)

### 4.5 Grading (`gradeSubmission`)

Before the AI call, partition questions by `type`:
- `mcq`: settle deterministically — compare the student's stored answer (the
  chosen option text) against `options[correctOptionIndex]`. Full marks + `correct: true`
  on match, `0` + `correct: false` otherwise. No AI call for these.
- `short_answer`: unchanged — go to Gemini (or the completeness heuristic) with
  the answer-key context as today.

Aggregate marks across both partitions. A submission that is entirely MCQ never
calls the model.

## 5. Client (unified-app)

### 5.1 New `AssignmentAiSetupScreen`

Modelled on `GenerationSetupScreen` (same header pattern, chips, `SelectChip`
modal picker, focus `TextInput`).

- Route param: `{ topicId }`. On mount: `GET /topics/:id/assignment-draft/options`.
- If `!hasGenerations && !hasContextSources`: render a blocked state —
  "Generate a lesson for this topic first so the AI knows what was taught." with
  a button to `GenerationSetup` and the "write it myself" link.
- Controls:
  - **Question count** — chips `3 / 5 / 8 / 10` (+ custom).
  - **Difficulty mix** — three small steppers (easy/medium/hard) that must sum to
    the count, or a simpler "balanced / more practice / more challenge" preset
    that expands to a mix. (Implementation detail for the plan; steppers preferred.)
  - **Question type** — segmented control: Short answer / MCQ / Mixed.
  - **Learning objectives** — multi-select chips from `options.objectives`.
    Section hidden entirely when the array is empty.
  - **Focus box** — `TextInput`, placeholder like the existing "e.g. include a
    hands-on group activity, focus on real-world examples…".
- Primary button "Generate questions" → `POST /topics/:id/assignment-draft` →
  `navigation.replace("AssignmentDraftReview", { assignmentId })`.
- Footer link "Prefer to write your own? →" →
  `navigation.replace("CreateAssignment", { topicId })` (blank form, unchanged).
- Errors render inline; the screen stays put (matches `GenerationSetup`).

### 5.2 New `AssignmentDraftReviewScreen`

- Route param: `{ assignmentId }`. Loads `getAssignment` + `getAnswerKey`.
- Per question, a card:
  - index, editable `prompt` (`TextInput`, multiline),
  - difficulty chips (as in `CreateAssignmentScreen`),
  - for `mcq`: the options list — each option editable text, tap to mark the
    correct one; add/remove option (2–5),
  - the drafted **model answer** below (editable `TextInput`, collapsible),
  - card actions: **Regenerate** (optional instruction via a small prompt/modal →
    `POST …/questions/:questionId/regenerate`), **Delete**.
- Footer: **+ Add question** (blank manual row, `short_answer` default),
  **Regenerate all** (returns to setup, or re-POSTs with the stored params),
  **Looks good →** — saves pending edits via `PATCH /assignments/:id` (+ any
  `PATCH /answer-key/:id`) then `navigation.replace("AssignmentDetail", { assignmentId })`.
- From `AssignmentDetail` the teacher does the usual `AnswerKeyReview` verify and
  Publish. No change there beyond rendering MCQ answer entries sensibly.

### 5.3 Existing screens touched

- **`TopicDetailScreen`** (~line 482): the hero document icon routes to
  `AssignmentAiSetup` instead of `CreateAssignment`.
- **`StudentAssignmentSubmitScreen`**: for `type: "mcq"` rows, render `options`
  as a single-select list; the selected option text is written into the same
  answers map keyed by question id, so the submission pipeline downstream is
  unchanged. `short_answer` rows unchanged.
- **`AssignmentDetailScreen`**: question list renders MCQ options read-only under
  the prompt; the "AI generated" badge stays (now accurate).
- **`api/client.ts`**: extend `AssignmentQuestion`; add
  `getAssignmentDraftOptions`, `createAssignmentDraft`,
  `regenerateAssignmentQuestion`.
- **`navigation/types.ts` + `AppNavigator.tsx`**: register `AssignmentAiSetup`
  and `AssignmentDraftReview`.

## 6. Error handling

| Failure | Behaviour |
|---|---|
| Generator call fails / returns malformed JSON | Provider falls back to the heuristic (short-answer questions from objectives). If even assembly fails, `POST /topics/:id/assignment-draft` returns 422 and **creates no draft**; setup screen shows the message inline. |
| Topic has no generations and no context sources | Setup screen blocked state (see 5.1); `POST` also guards with 422. |
| Regenerate one question fails | Keep the existing question; toast the error. Draft untouched. |
| Teacher abandons review | Draft assignment remains; deletable via the existing draft-delete path. Acceptable — drafts are cheap and already a first-class state. |
| MCQ with no `correctOptionIndex` at publish | Publish guard: block with "Every multiple-choice question needs a correct option selected." |

## 7. Testing

**Backend**
- `ai.test.ts`: `generateAssignmentFromTopic` stub returns the documented shape;
  Gemini path falls back to heuristic on malformed JSON; difficulty rescale pads
  to `questionCount`.
- `assignment-draft.test.ts` (new): `POST` seeds N questions + N answer-key rows
  with the topic's class section and `topicId`; 422 when the topic has neither
  generations nor context sources; regenerate swaps exactly one question + its
  answer-key row and respects the draft-only guard; taught-content assembly
  parses each `outputType`, dedupes objectives, respects the 12000-char cap.
- Grading: an all-MCQ submission is graded by exact match with **no** AI call;
  a mixed submission grades MCQ deterministically and sends only short-answer
  questions to the grader; marks aggregate correctly across both.

**Client**
- `AssignmentAiSetupScreen`: blocked state when `!hasGenerations && !hasContextSources`;
  objectives section hidden when empty; generate navigates to review.
- `AssignmentDraftReviewScreen`: edits persist via `PATCH`; regenerate replaces
  one card; "Looks good" lands on `AssignmentDetail`.
- `StudentAssignmentSubmitScreen`: MCQ single-select writes the option text;
  submitting a mixed assignment produces a well-formed answers map.

## 8. Out of scope

- Backfilling `type` onto existing assignments.
- Question types beyond short-answer and MCQ (true/false, matching, numeric).
- Regenerating the whole set in place (the review screen just returns to setup).
- Changing how personalisation selects a question subset (MCQ vs short-answer is
  not a personalisation axis).
- "Push to Communication Hub" style delivery.

## 9. Rollout notes

- One Prisma migration: add `Assignment.aiGenParams Json?`. Additive, nullable,
  no data migration.
- `AssignmentQuestion.type` is a JSON-shape change only — no DB migration; guard
  every read with a `?? "short_answer"` default.
- Feature is additive; the blank `CreateAssignmentScreen` and the Assignment Lab
  entry point keep working throughout.
