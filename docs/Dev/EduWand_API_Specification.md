# EduWand Platform — API Specification
**Enrolment Growth Engine and AI Module**
Prepared by Fovea Infotech | Version 1 | Confidential

---

## 1. Overview

This document defines the REST API contract between the two front-end applications, the Unified App and the Admin Dashboard, and the single shared backend. All endpoints are versioned under `/api/v1`. All requests require a bearer token from the authentication endpoint, except the login and public enquiry form endpoints, which are marked open below.

All list endpoints are scoped to the caller's `school_id` automatically from their token. Callers cannot pass a different `school_id` to read another school's data.

## 2. Authentication

| Method and Path | Purpose | Notes |
|---|---|---|
| POST /api/v1/auth/login | Authenticate a user, returns a bearer token | Open endpoint |
| POST /api/v1/auth/refresh | Refresh an expiring token | |
| GET /api/v1/auth/me | Return the current user's profile, role, and school or trust scope | |

## 3. Enrolment Growth Engine

### 3.1 Enquiry

| Method and Path | Purpose | Notes |
|---|---|---|
| GET /api/v1/enquiries | List enquiries, filterable by status, source, owner | Supports pagination |
| POST /api/v1/enquiries | Create a new enquiry | Under approximately 30 seconds to complete |
| GET /api/v1/enquiries/{id} | Get a single enquiry, including stage history | |
| PATCH /api/v1/enquiries/{id} | Update enquiry fields or status | Writes to enquiry_stage_history on status change |
| POST /api/v1/enquiries/{id}/merge | Merge a duplicate enquiry into this one | |
| POST /api/v1/public/enquiries | Public website enquiry form submission | Open endpoint, rate limited |

### 3.2 Follow Up

| Method and Path | Purpose | Notes |
|---|---|---|
| GET /api/v1/follow-up-tasks | List follow up tasks, filterable by assignee and status | |
| POST /api/v1/follow-up-tasks | Create a follow up task or drip sequence entry | |
| POST /api/v1/follow-up-tasks/{id}/send | Manually trigger a pending message | |
| GET /api/v1/message-templates | List templates by channel | |
| POST /api/v1/message-templates | Create a template | |

### 3.3 Admissions Workflow

| Method and Path | Purpose | Notes |
|---|---|---|
| POST /api/v1/enquiries/{id}/confirm-admission | Confirm admission, creates a student_stub | Implements FR-EG-6 |
| GET /api/v1/students | List admitted student stubs | |
| GET /api/v1/students/{id} | Get a single student stub | |

### 3.4 CSV Export

Export uses a single fixed, standard column format across all schools. There is no per-school mapping configuration.

| Method and Path | Purpose | Notes |
|---|---|---|
| POST /api/v1/exports/run | Run an export on demand, standard format | Implements FR-EG-11 |
| GET /api/v1/exports/log | List past export runs and their status | |
| GET /api/v1/exports/{id}/download | Download a completed export file | |

### 3.5 Enrolment Analytics

| Method and Path | Purpose | Notes |
|---|---|---|
| GET /api/v1/analytics/enrolment/funnel | Enquiry to admission funnel counts | Feeds Admin Dashboard |
| GET /api/v1/analytics/enrolment/by-source | Enquiry volume by source | |
| GET /api/v1/analytics/enrolment/counsellor-performance | Conversion rate by counsellor | |

## 4. AI Module

**Revised 11 August 2026** against the client's AI Module Build Document. Endpoints below are organised around **Topic**, the container every generation, assignment, and report belongs to (see PRD Section 6.1.1 for terms). `lesson-plans` and `research-reports` endpoints from Version 1 are superseded by generic `topics/{id}/generations`.

### 4.1 Topics

| Method and Path | Purpose | Notes |
|---|---|---|
| GET /api/v1/topics | List the teacher's topics, filterable by class/subject | |
| POST /api/v1/topics | Start a new topic | |
| GET /api/v1/topics/{id} | Get a topic with its context sources, generations, observations, and assignments | |
| POST /api/v1/topics/{id}/context | Attach a context source: upload (PDF/DOCX/PPTX/image), URL, or an iDream K12 reference | |
| GET /api/v1/content-library/idream-k12/search | Search the iDream K12 content library for a topic | External integration, see PRD Q-13 |
| POST /api/v1/topics/{id}/observations | Record a teacher observation against a topic | Feeds the attainment report automatically |

### 4.2 Lesson Studio

| Method and Path | Purpose | Notes |
|---|---|---|
| POST /api/v1/topics/{id}/generations | Generate an output (lesson plan, custom activity report, flashcards, presentation, explanatory video) for a topic | Should be async, job + poll/webhook, not blocking — see PRD Q-02. Routes to Claude Sonnet pending re-confirmation, see PRD Section 6.3 |
| GET /api/v1/generations/{id} | Get a single generation, including context sources used | |
| PATCH /api/v1/generations/{id} | Teacher edits a generation | The edited version, not the AI original, is what persists and is returned by every other read of this generation |
| POST /api/v1/generations/{id}/retry | Retry a failed generation with the original inputs preserved | Per client doc acceptance criteria — a failed generation must not lose the teacher's inputs |
| POST /api/v1/generations/{id}/distribute | Send a generation to students and/or parents | |

### 4.3 Assignment Lab

| Method and Path | Purpose | Notes |
|---|---|---|
| POST /api/v1/topics/{id}/assignments | Create an assignment for a topic, for a class or a named student | Context sourced from an existing generation or a fresh upload |
| GET /api/v1/assignments/{id}/answer-key | Get the generated answer key for teacher review | |
| PATCH /api/v1/answer-key/{id} | Teacher edits a question, answer, or mark allocation | Teacher-verified version is authoritative, never the AI's original |
| GET /api/v1/assignments/{id}/personalisation-eligibility | Check whether the two-prior-graded-assignments prerequisite is met, per student | Server-side enforcement point for the prerequisite, must not be UI-only |
| POST /api/v1/assignments/{id}/personalisation-suggestions | Generate a personalisation suggestion — Method 1 (single student) or Method 2 (class level, one generation per student) | Routes to Claude Haiku. Does not apply the suggestion. Method 2 fan-out: one call per eligible student in the class, see PRD Q-03 on cost |
| PATCH /api/v1/personalisation-suggestions/{id} | Teacher approves, overrides, or opts a student out | This is the only path that applies a suggestion |
| POST /api/v1/assignments/{id}/publish | Publish an assignment to students, immediately or at a scheduled time | |
| POST /api/v1/submissions | Submit student work, online or photo | Photo submissions trigger OCR extraction before grading |
| POST /api/v1/submissions/{id}/grade | Trigger AI grading for a submission | Routes to Claude Haiku. For photo submissions this is presented to the teacher as a suggestion requiring confirmation, never published directly to the student — see the OCR risk note in the client doc |
| PATCH /api/v1/grades/{id} | Teacher override of an AI-assigned grade | Override is authoritative everywhere the grade appears |
| POST /api/v1/grades/{id}/release | Release a grade and feedback to the student | Grades are invisible to the student until this is called |
| GET /api/v1/assignments/{id}/class-insight | Class banding (3 levels, editable thresholds), item analysis, suggested classroom actions | |

### 4.4 Attainment Report

| Method and Path | Purpose | Notes |
|---|---|---|
| GET /api/v1/topics/{id}/attainment-report | Get the auto-populated attainment report for a topic | Populated from generations, observations, and grade results — no re-entry |
| GET /api/v1/topics/{id}/attainment-report/pdf | Export the attainment report to PDF, in the school format | |
| GET /api/v1/attainment-reports/roll-up | Export a term's reports for one class and subject as a single document | |

### 4.5 Students Dashboard

**Speculative — see PRD Section 6.7 on the Student-role scope contradiction.** Do not build against these until the client confirms the Students Dashboard is in scope.

| Method and Path | Purpose | Notes |
|---|---|---|
| GET /api/v1/student/materials | List learning materials shared with the logged-in student | |
| GET /api/v1/student/assignments | List assignments assigned to the logged-in student, with due dates and status | |
| POST /api/v1/student/submissions | Submit an assignment response, online or photo | Resumable — a part-completed attempt must survive a dropped connection per the client doc's acceptance criteria |
| GET /api/v1/student/submissions | Full history of the student's past submissions | |

### 4.6 Communication Hub

| Method and Path | Purpose | Notes |
|---|---|---|
| GET /api/v1/communications | List message history for the caller (teacher, or student once Section 4.5 is confirmed) | |
| POST /api/v1/communications/teacher-to-student | Send a one-to-one message to a student | |
| POST /api/v1/communications/teacher-to-class | Broadcast a message to a class | |
| GET /api/v1/communications/parent-weekly-update/pending | Preview a pending automatic weekly parent update before it sends | Lets the teacher review or stop it, per client doc acceptance criteria |
| POST /api/v1/communications/parent-weekly-update/{id}/hold | Stop a pending weekly update from sending | |

Delivery mechanism (in-app, SMS, email, or a combination) for Communication Hub messages is unresolved — see PRD Q-08 equivalent, client doc Section 7.3.

### 4.7 AI Analytics

| Method and Path | Purpose | Notes |
|---|---|---|
| GET /api/v1/analytics/ai/student/{id} | Per-student performance view | Client doc names this the Student Analytics Dashboard; exact contents are an open question, see PRD Q-07 |
| GET /api/v1/analytics/ai/class/{id} | Per-class performance view | |
| GET /api/v1/analytics/ai/usage | AI usage analytics, generations per teacher, grading turnaround | Feeds Admin Dashboard |

## 5. Standard Response Shape

All endpoints return a consistent envelope.

| Field | Type | Notes |
|---|---|---|
| data | object or array | The requested resource or list |
| meta | object | Pagination info on list endpoints: page, page_size, total_count |
| error | object | Present only on failure, includes code and message |

## 6. Error Handling

- **400** — validation error, missing or malformed fields
- **401** — missing or expired authentication token
- **403** — authenticated but not permitted, for example a teacher calling an admin-only analytics endpoint
- **404** — resource not found or not in the caller's school scope
- **429** — rate limited, applies to the public enquiry form endpoint
- **500** — unexpected server error, logged to CloudWatch with a request ID for tracing

## 7. Notes for Implementation

- Every endpoint that reads or writes enquiry, student_stub, assignment, or submission data must enforce `school_id` scoping from the caller's token, never from a client-supplied parameter
- AI generation endpoints (Section 4.2 and 4.3) should be built as asynchronous jobs with a status poll or webhook, not a long blocking HTTP call, to avoid timeouts on slower generations — the client doc raises this as open question Q-02 (sync vs. queued), not yet answered, so treat this as a design constraint to confirm before committing to an architecture
- `PATCH /api/v1/personalisation-suggestions/{id}` is the single enforcement point for the DPDP-safe design, no other code path may mark a suggestion as applied
- `GET /api/v1/assignments/{id}/personalisation-eligibility` must be checked server-side before `personalisation-suggestions` generation is allowed to run — the two-graded-assignment prerequisite is not a UI-only gate
- Method 2 class-level personalisation fans out to one generation per eligible student — a class of 40 means 40 calls to the model per personalised assignment. This has real cost and latency implications not yet bounded (PRD Q-03); do not assume the same rate limits or cost ceilings as a single generation
- `PATCH /api/v1/generations/{id}` and `PATCH /api/v1/answer-key/{id}` follow the same rule as grade overrides: once a teacher edits a generation or an answer key, every other endpoint that reads it (distribution, attainment report, grading engine) must return the edited version, never the original AI output
- `POST /api/v1/grades/{id}/release` is the sole gate on student-visible grades — no other code path should expose `grade.ai_score`/`grade.ai_feedback` to a student-facing endpoint before this is called
- All AI generation calls should write to `ai_usage_log` asynchronously for cost tracking, including the per-student fan-out from Method 2 personalisation
- Section 4.5 (Students Dashboard) endpoints are speculative pending client sign-off on the Student-role scope contradiction described in PRD Section 6.7 — do not implement until confirmed
- Generation versioning (`model_used`, `model_version`, `prompt_version` on `generation`) is required for attainment-report audit reproducibility per PRD Q-12, but is not yet confirmed as actually captured end-to-end — verify before relying on it for audit

---
*End of document. Fovea Infotech. Confidential.*
