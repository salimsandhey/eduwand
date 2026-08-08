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

### 4.1 Lesson Studio

| Method and Path | Purpose | Notes |
|---|---|---|
| POST /api/v1/lesson-plans/generate | Generate a lesson plan from a topic and board | Routes to Claude Sonnet, target under 60 seconds |
| GET /api/v1/lesson-plans | List saved lesson plans, filterable by class | |
| POST /api/v1/research-reports/generate | Generate a research or content report | Routes to Claude Sonnet |
| GET /api/v1/research-reports | List saved research reports | |

### 4.2 Assignment Lab

| Method and Path | Purpose | Notes |
|---|---|---|
| POST /api/v1/assignments | Create an assignment | |
| POST /api/v1/assignments/{id}/personalisation-suggestions | Generate a personalisation suggestion, per student | Routes to Claude Haiku. Does not apply the suggestion |
| PATCH /api/v1/personalisation-suggestions/{id} | Teacher approves, overrides, or opts a student out | This is the only path that applies a suggestion |
| POST /api/v1/assignments/{id}/publish | Publish an assignment to students | |
| POST /api/v1/submissions | Submit student work | |
| POST /api/v1/submissions/{id}/grade | Trigger AI grading for a submission | Routes to Claude Haiku |
| PATCH /api/v1/grades/{id} | Teacher override of an AI-assigned grade | |

### 4.3 AI Analytics

| Method and Path | Purpose | Notes |
|---|---|---|
| GET /api/v1/analytics/ai/student/{id} | Per-student performance view | |
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
- AI generation endpoints (Section 4.1 and 4.2) should be built as asynchronous jobs with a status poll or webhook, not a long blocking HTTP call, to avoid timeouts on slower generations
- `PATCH /api/v1/personalisation-suggestions/{id}` is the single enforcement point for the DPDP-safe design, no other code path may mark a suggestion as applied
- All AI generation calls should write to `ai_usage_log` asynchronously for cost tracking

---
*End of document. Fovea Infotech. Confidential.*
