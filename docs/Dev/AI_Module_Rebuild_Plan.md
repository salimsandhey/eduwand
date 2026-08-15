# AI Module Rebuild — Implementation Plan
Prepared against `Docs/Dev/EduWand_Database_Schema.md` §4, `EduWand_API_Specification.md` §4, `EduWand_UI_Screen_Spec.md` §4/4a (all revised 11 Aug 2026 against the client's AI Module Build Document).

## Phase 0 — Confirmed current-state facts (source of truth for "copy this pattern")

- **Prisma schema**: `backend/prisma/schema.prisma`. AI Module block starts at the `// ===== AI Module` comment (line 355). Standard model shape: `id String @id @default(uuid()) @db.Uuid`, `@map("snake_case")` on every field, `@@map("snake_case_table")` at the end. Migrations live in `backend/prisma/migrations/`, most recent is `20260812165215_audit_log`.
- **Route pattern** (copy from `backend/src/routes/lesson-studio.ts` and `assignments.ts`):
  - `const scoped = (app: FastifyInstance) => [app.authenticate, app.requireSchoolScope, requireRoles("teacher")];` then `{ onRequest: scoped(app) }` on every handler.
  - Error envelope: `reply.code(400).send({ data: null, error: { code: "validation_error", message: "..." } })`. Codes used elsewhere: `validation_error`, `not_found`.
  - Success envelope: `{ data: ..., meta: {} }`.
  - `request.schoolId` and `request.user.sub` (teacher's AppUser id) are already available on every scoped request — set by `app.requireSchoolScope`/`app.authenticate` (in `backend/src/lib/rbac.ts` / auth plugin, not re-read here, just reused).
  - Route files are registered somewhere central (likely `backend/src/server.ts` — confirm and follow the existing registration list when adding new route files).
- **AI provider pattern** (`backend/src/lib/ai.ts`): a single `AiProvider` interface + `StubAiProvider` class + `export const aiProvider: AiProvider = new StubAiProvider()`. `logAiUsage()` helper writes `AiUsageLog` rows. **Extend this interface, do not replace it** — every new AI-backed feature (flashcards, presentations, answer-key generation, OCR, attainment report drafting) adds a method to `AiProvider` and a stub implementation in `StubAiProvider`, following the existing template-string style (see `generateLessonPlan` for the pattern: real structured output from real inputs, not lorem ipsum).
- **Existing AI Module models to migrate, not delete-and-recreate**: `LessonPlan`, `ResearchReport`, `Assignment`, `PersonalisationSuggestion`, `Submission`, `Grade`, `AiUsageLog`. A real school may have existing rows (dev/seed data does, per the Admin Panel Testing Guide) — migrations must carry data forward, not drop tables.
- **Unified-app screens/navigation**: teacher screens live in `unified-app/src/screens/` (`StudioScreen.tsx`, `CreateAssignmentScreen.tsx`, `AssignmentDetailScreen.tsx`, `AssignmentScreen.tsx`, `PersonalisationReviewScreen.tsx`, `GradingReviewScreen.tsx`, `TeacherAnalyticsScreen.tsx`), routed via `unified-app/src/navigation/TeacherTabNavigator.tsx`. Student screens (`StudentLoginScreen.tsx`, `StudentHomeScreen.tsx`) routed via `StudentTabNavigator.tsx`. Follow existing screen file conventions (theme tokens from `../theme/tokens`, `api/client.ts` for backend calls — confirm exact client pattern before writing new screens).
- **Admin dashboard**: `admin-dashboard/src/pages/AiUsagePage.tsx` is closest to spec, needs only `feature` enum value additions once new features exist to log.

**Open questions this plan builds a pragmatic default against, not a final answer** (see PRD §6.7 for full detail — do not treat these defaults as client-confirmed):
- **Q-02 (sync vs. queued generation)**: build synchronous for now, same as today's stub — the stub resolves instantly so there's no timeout risk yet. Structure the `generation` create endpoint so swapping to async (job row + poll) later doesn't change the API shape (return the generation row immediately with `generation_status: "pending"`, update it when "done" — cheap to do now, expensive to retrofit).
- **Q-03 (cost ceiling)**: no hard cap enforced yet; Method 2 personalisation fan-out is built as specified (one suggestion per eligible student) with no throttle. Flag as a known gap, do not silently cap without client confirmation.
- **Q-07 (Student Analytics Dashboard vs. Attainment Report)**: keep `TeacherAnalyticsScreen`/`/analytics/ai/*` as-is for now (rename references to "Student Analytics Dashboard" in code comments only), build Attainment Report as a genuinely separate, topic-scoped, Bloom's-mapped, PDF-exportable feature. Do not try to merge them.
- **Q-17 (parental consent)**: not addressed in this plan — legal/consent capture is out of engineering scope until the client answers it. Do not add a consent gate to the student submission flow that isn't already backed by a real requirement.

---

## Phase 1 — Topic foundation

**Schema** (new Prisma models, new migration):
- `Topic` — `schoolId`, `teacherUserId`, `classSectionId`, `subject`, `name`, `board`, `status` (`active`|`archived`).
- `ContextSource` — `topicId`, `sourceType` (`pdf`|`docx`|`pptx`|`image`|`url`|`idream_k12`), `fileLocation` (nullable), `sourceUrl` (nullable), `idreamK12ReferenceId` (nullable), `extractionStatus` (`pending`|`extracted`|`failed_no_text`).
- `SchoolFormatTemplate` — `schoolId`, `appliesTo` (`generation`|`attainment_report`), `templateBody`.
- `Observation` — `topicId`, `authorUserId`, `body`, `recordedAt`.

**Routes** — new file `backend/src/routes/topics.ts`, registered alongside the other route files:
- `GET /topics` (filter by class/subject), `POST /topics`, `GET /topics/:id` (include contextSources, generations, observations, assignments).
- `POST /topics/:id/context` (upload or URL or iDream K12 reference — reuse `backend/src/lib/storage.ts`'s Storage interface, same pattern as `Document.fileLocation` in the Enrolment module).
- `GET /content-library/idream-k12/search` — **stub this as a not-yet-integrated external call** (no real iDream K12 credentials exist yet, same situation `ai.ts` and `messaging.ts` are already in) — return an empty/stub result set with a clear comment, do not fabricate a fake content library.
- `POST /topics/:id/observations`.

**Frontend (unified-app)**:
- New screen `TopicSelectionScreen.tsx` — entry point before Lesson Studio, lists existing topics + "new topic" action. Wire into `TeacherTabNavigator.tsx` ahead of `StudioScreen.tsx`.
- New screen `TopicContextScreen.tsx` (only shown for a new topic) — iDream K12 search results (will show empty given the stub) + upload/URL controls.
- Add an "Add observation" control, either inline on the topic detail view or a small `ObservationCaptureScreen.tsx`.

**Verification**: `npx prisma migrate dev` succeeds with a real name; a teacher can create a topic, attach a context source (upload), record an observation, and retrieve the topic with all three nested. No existing route/screen breaks (this phase is purely additive).

---

## Phase 2 — Lesson Studio migration onto Topic

**Schema**:
- New `Generation` model — `topicId`, `teacherUserId`, `outputType` (`lesson_plan`|`custom_activity_report`|`flashcards`|`presentation`|`explanatory_video`), `mode` (`plan`|`generate`), `classCount`, `minutesPerClass`, `language`, `customPrompt` (nullable), `aiOutput`, `editedOutput` (nullable), `schoolFormatTemplateId` (nullable FK), `modelUsed`, `modelVersion` (nullable), `promptVersion` (nullable), `generationStatus` (`pending`|`succeeded`|`failed`).
- Data migration: write a Prisma migration script that copies existing `LessonPlan` rows into `Generation` (`outputType="lesson_plan"`, `aiOutput=content`, no `topicId` available historically — either create one synthetic `Topic` per legacy lesson plan keyed by its `topic` text field + class + teacher, or leave `topicId` nullable for migrated legacy rows and document the exception). Same for `ResearchReport` (no direct `output_type` equivalent in the new enum — map to `custom_activity_report` and note the lossy mapping in a migration comment, per the schema doc's own flagged ambiguity). **Do not drop `LessonPlan`/`ResearchReport` tables in this phase** — keep them read-only for historical lookups until a follow-up cleanup migration, to avoid data loss if the mapping needs revisiting.

**`backend/src/lib/ai.ts`**:
- Add `generateFlashcards`, `generatePresentation`, `generateExplanatoryVideo` methods to `AiProvider` (stub implementations following the existing template-string pattern in `generateLessonPlan`/`generateResearchReport`).
- Add a `retryGeneration` path (not a new provider method — this is a route-level concern: same inputs, new call).

**Routes** — new file `backend/src/routes/generations.ts` (replaces `lesson-studio.ts`; keep `lesson-studio.ts`'s two GET endpoints temporarily as deprecated aliases reading from `Generation` where `outputType` matches, to avoid breaking anything already calling them):
- `POST /topics/:id/generations` (dropdown-driven body: outputType, mode, classCount, minutesPerClass, language, customPrompt, contextSourceIds).
- `GET /generations/:id`.
- `PATCH /generations/:id` (sets `editedOutput` — every other read of this generation must return `editedOutput ?? aiOutput`).
- `POST /generations/:id/retry`.
- `POST /generations/:id/distribute` (stub — no real student/parent delivery channel exists yet, see Phase 4's Communication Hub; this endpoint can create a `CommunicationMessage` row once that model exists, or be a no-op with a clear TODO until Phase 4 lands).

**Frontend (unified-app)**:
- Rework `StudioScreen.tsx` into `GenerationSetupScreen.tsx` (dropdowns per the UI spec: class, subject, topic (from Phase 1), language, output type, class count, minutes/class, plan/generate toggle, optional custom prompt) + `GenerationReviewScreen.tsx` (edit-then-persist, matches `PATCH /generations/:id`).

**Verification**: a teacher can go Topic → context → generation setup → generated output → edit → save, and the edited version, not the original, is what a second `GET /generations/:id` returns. All 5 output types return content in the stub.

---

## Phase 3 — Assignment Lab: answer key + personalisation prerequisite + OCR

**Schema**:
- Add `topicId` to `Assignment` (keep `classSectionId` too, derivable from topic but kept for query convenience — confirm against schema doc's exact field list, which keeps both).
- Add `targetStudentStubId` (nullable), `questionCount`, `questionTypes` (jsonb), `difficultySplit` (jsonb), `customInstructions`, `dueAt`, `distributeAt` (nullable) to `Assignment` — replacing the current opaque `questions Json` field. **This is a breaking shape change** — write a migration that parses existing `Assignment.questions` into the new `AnswerKey` rows (one per question) rather than discarding the data.
- New `AnswerKey` model — `assignmentId`, `questionIndex`, `photoSubmissionRequired`, `aiAnswer`, `teacherVerifiedAnswer` (nullable), `marks`.
- Extend `PersonalisationSuggestion` → rename in schema doc terms to match `assignment_personalisation_suggestion`: add `method` (`single_student`|`class_level`), `suggestedExtraQuestions` (jsonb, nullable), `prerequisiteMet` (boolean). Keep `suggestedMix`/`appliedMix` field names as-is (they already map to `suggested_difficulty_mix`/decision fields) — just add the two new fields, don't rename existing ones (avoids a wider blast radius).
- Extend `Submission` — add `submissionType` (`online`|`photo`), `photoFileLocation` (nullable), `ocrExtractedText` (nullable), `ocrConfidence` (nullable), `isLate` (computed at read time from `assignment.dueAt`, not stored, to avoid staleness).
- Extend `Grade` — add `aiNextStep`, `performanceBand` (`level_1`|`level_2`|`level_3`), `releasedToStudent` (boolean, replaces inferring release from `status === "released"` — keep `status` field too for backward read compatibility, but `releasedToStudent` becomes the actual gate everywhere new code reads it).
- New `ClassBandConfig` — `schoolId`, `level1MinPercent` (default 80), `level2MinPercent` (default 50).

**`backend/src/lib/ai.ts`**:
- Add `generateAnswerKey(questions)` method.
- Add `extractTextFromPhoto(fileLocation)` — **stub OCR, no real OCR provider configured yet** (same "no credentials" situation as Bedrock) — return a clearly-marked placeholder extraction, never fabricate a plausible-looking fake transcription that could be mistaken for real OCR output in testing.
- Extend `gradeSubmission` to accept OCR'd text as input and to compute `performanceBand`/`aiNextStep`.
- Add `generateClassInsight(grades)` — item analysis (which questions the majority got wrong) + suggested classroom actions.

**Routes** (extend `assignments.ts`, add to `submissions.ts`):
- `GET /assignments/:id/answer-key`, `PATCH /answer-key/:id`.
- `GET /assignments/:id/personalisation-eligibility` — **server-side enforcement of the "2 prior graded assignments on this topic" prerequisite**. This is the one piece flagged as missing entirely today (current code fans out unconditionally) — make `POST .../personalisation-suggestions` call this check internally and reject (400, clear message) rather than silently generating for ineligible students, per the client doc's explicit acceptance criterion.
- `GET /assignments/:id/class-insight`.
- `POST /grades/:id/release` (sets `releasedToStudent=true`; keep `PATCH /grades/:id` for the override itself, separate concern).
- `POST /submissions` gains a `submissionType`/`photoFileLocation` path that triggers OCR extraction before grading.

**Frontend (unified-app)**:
- `CreateAssignmentScreen.tsx`: add per-question photo/online flag, due date, schedule-later.
- New `AnswerKeyReviewScreen.tsx`.
- `PersonalisationReviewScreen.tsx`: show `prerequisiteMet` per student, disable/explain where not met, support both methods' review UIs.
- `GradingReviewScreen.tsx`: show OCR'd text alongside the photo for verification, show class banding + item analysis + suggested actions, add explicit "release" action calling the new endpoint.

**Verification**: an assignment with a photo-required question can be submitted with a photo, gets OCR'd (stub text, clearly marked), graded, and the grade is invisible to `GET /student/assignments` until `/grades/:id/release` is called. Personalisation generation is rejected server-side for a student with fewer than 2 prior graded assignments on the topic, with a clear error message — verified by an integration test/manual call, not just a UI check.

---

## Phase 4 — Attainment Report, Student submission flow, Communication Hub

**Schema**:
- New `AttainmentReport` — `topicId` (one per topic), `bloomsTaxonomyMapping` (jsonb), `whatWasDone`, `outcomes`, `improvementNotes`, `pdfFileLocation` (nullable), `generatedAt`.
- New `CommunicationMessage` — `schoolId`, `channel` (`parent_weekly_update`|`teacher_to_student`|`teacher_to_class`), `senderUserId` (nullable), `recipientStudentStubId` (nullable), `recipientClassSectionId` (nullable), `topicId` (nullable), `body`, `deliveryMechanism`, `deliveryStatus`, `sentAt` (nullable).

**Routes**:
- `GET /topics/:id/attainment-report` (auto-assembled — no separate "create" endpoint, it's a derived/cached view generated on first request or on a worker tick, following the `csv_export_log`/worker pattern already in `backend/src/worker.ts`).
- `GET /topics/:id/attainment-report/pdf` — needs a PDF generation library; check what's already a dependency in `backend/package.json` before adding a new one (none currently, per the earlier package.json read — this is a new dependency decision, flag it rather than silently picking one).
- `GET /attainment-reports/roll-up`.
- `POST /student/submissions`, `GET /student/submissions` (new — closes the "students can't submit their own work" gap) — add to `backend/src/routes/student-portal.ts`, scoped to the student's own token (not teacher-on-behalf-of).
- `backend/src/routes/communications.ts` (new file): `GET /communications`, `POST /communications/teacher-to-student`, `POST /communications/teacher-to-class`, `GET /communications/parent-weekly-update/pending`, `POST /communications/parent-weekly-update/{id}/hold`.
- Weekly parent update generation: a worker job in `backend/src/worker.ts` (follow the existing `CsvExportSchedule` cron-tick pattern), one `CommunicationMessage` row per child per week, assembled from that week's `Generation`+`Grade` data. **Delivery mechanism is genuinely unresolved (client doc's own Q-08 gap, Section 7.3 references a Q-08 that Section 8 never defines)** — build the message row and a `deliveryStatus="pending"` state, but do not wire a real send (SMS/email/in-app) until the client answers this; log it as blocked, don't guess.

**Frontend (unified-app)**:
- `AttainmentReportScreen.tsx` (view + PDF export action).
- Extend `StudentTabNavigator.tsx` with real screens: `StudentMaterialsScreen.tsx`, `StudentAssignmentSubmitScreen.tsx` (online answer + photo upload, must survive a dropped connection per the client doc — persist draft answers locally before submit), `StudentResultsScreen.tsx`, `StudentMessagesScreen.tsx`.
- `CommunicationHubScreen.tsx` for teachers (compose to student/class, review pending weekly updates).

**Note on scope**: the Students Dashboard build-out here is flagged in the PRD as contested pending client sign-off (Section 6.7). Build it — the client doc specifies it as in-scope and this plan follows the client doc — but don't be surprised if it needs to be pulled or gated behind a feature flag if the client walks it back.

---

## Phase 5 — Cleanup and reconciliation

- `AiUsageLog.feature` values: add `generation`, `attainment_report`, `communication_hub`; keep old values readable for historical rows (`lesson_plan`, `research_report`, `personalisation_suggestion`, `grading` stay valid, just not written by new code).
- `admin-dashboard/src/pages/AiUsagePage.tsx`: extend feature-breakdown chart to include the new feature values.
- Rename in-code references from "Teacher Analytics" to "Student Analytics Dashboard" per PRD terminology (comment/label changes only — do not restructure its content pending Q-07).
- Deprecation pass: once `Generation` fully covers `LessonPlan`/`ResearchReport` reads in production, drop the deprecated alias endpoints from Phase 2 and the old tables in a follow-up migration (not part of this plan — flag as a future cleanup ticket).

---

## Execution order and independence

Phases 1→2→3→4 are sequential (each depends on `Topic` from Phase 1, and Phase 3/4 both extend `Assignment`/`Grade` from Phase 2's neighborhood). Phase 5 is cleanup, do last. Within a phase, schema changes must land (migration applied) before routes are written against the new client, and routes before the frontend screens that call them.
