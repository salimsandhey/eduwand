# EduWand Platform — Database Schema
**Enrolment Growth Engine and AI Module**
Prepared by Fovea Infotech | Version 1 | Confidential

---

## 1. Overview

This document defines the database schema for the two modules in this build phase: the Enrolment Growth Engine and the AI Module, along with the shared platform tables that support tenancy, users, and roles. Database engine is Amazon RDS for PostgreSQL. All tables include standard audit columns not repeated in every row below: `id` (UUID, primary key), `created_at`, `updated_at`, `created_by`, `updated_by`.

Tenancy is modelled Trust → School → Academic Year → Class → Section. Every table that holds school-specific data carries a `school_id`, and every school belongs to a `trust_id`, so data isolation between schools is enforced at the query layer.

## 2. Platform and Tenancy Tables

### `trust`
| Field | Type | Notes |
|---|---|---|
| name | text | Trust or society name |
| contact_email | text | |
| status | text | active, suspended |

### `school`
| Field | Type | Notes |
|---|---|---|
| trust_id | uuid | Foreign key to trust |
| name | text | |
| board | text | CBSE, ICSE, State |
| address | text | |
| timezone | text | Default Asia/Kolkata |
| incumbent_erp | text | Not used for mapping, informational only |
| status | text | onboarding, active, suspended |

### `academic_year`
| Field | Type | Notes |
|---|---|---|
| school_id | uuid | Foreign key to school |
| label | text | For example 2026-2027 |
| start_date | date | |
| end_date | date | |
| is_current | boolean | One current year per school |

### `class_section`
| Field | Type | Notes |
|---|---|---|
| academic_year_id | uuid | Foreign key to academic_year |
| class_name | text | For example Grade 5 |
| section_name | text | For example A |

### `app_user`
| Field | Type | Notes |
|---|---|---|
| trust_id | uuid | Nullable, set if user is trust-level |
| school_id | uuid | Nullable if user is trust-level only |
| full_name | text | |
| email | text | Unique, used for login |
| phone | text | |
| role | text | front_desk, counsellor, teacher, admin, leadership |
| auth_provider_id | text | External identity provider reference |
| status | text | invited, active, disabled |

A user may be scoped to a trust, one or more schools, or a single class. Where a user works across multiple schools within a trust, a separate `user_school_access` join table maps `app_user` to multiple `school_id` values.

## 3. Enrolment Growth Engine Tables

### `enquiry`
| Field | Type | Notes |
|---|---|---|
| school_id | uuid | Tenancy scope |
| contact_name | text | |
| contact_phone | text | |
| contact_email | text | Nullable |
| source | text | phone, walk_in, website, referral, event, social |
| grade_interest | text | Grade or board applied for |
| status | text | new, contacted, visit, application, admitted, enrolled, lost |
| lost_reason | text | Nullable, required if status is lost |
| owner_user_id | uuid | Foreign key to app_user, assigned counsellor |
| duplicate_of_enquiry_id | uuid | Nullable, set on merge |
| consent_captured | boolean | Messaging consent, DPDP |

### `enquiry_stage_history`
| Field | Type | Notes |
|---|---|---|
| enquiry_id | uuid | Foreign key to enquiry |
| from_status | text | Nullable for the first entry |
| to_status | text | |
| changed_by_user_id | uuid | Foreign key to app_user |
| changed_at | timestamp | |

### `enquiry_note`
| Field | Type | Notes |
|---|---|---|
| enquiry_id | uuid | Foreign key to enquiry |
| author_user_id | uuid | Nullable (system-attributed, e.g. public website submissions) |
| body | text | |
| created_at | timestamp | |

Replaces the old single `enquiry.notes` free-text column: each add-note call creates a new row here, so history is never overwritten. The enquiry detail API also derives a merged, read-only activity feed from `enquiry_stage_history` + `enquiry_note` + `follow_up_task`, sorted by time — this feed is computed on read, not stored as its own table.

### `follow_up_task`
| Field | Type | Notes |
|---|---|---|
| enquiry_id | uuid | Foreign key to enquiry |
| assigned_to_user_id | uuid | Foreign key to app_user |
| due_at | timestamp | |
| channel | text | sms, email |
| template_id | uuid | Foreign key to message_template |
| status | text | pending, sent, failed, cancelled |
| sent_at | timestamp | Nullable |

### `message_template`
| Field | Type | Notes |
|---|---|---|
| school_id | uuid | Tenancy scope |
| channel | text | sms, email |
| name | text | |
| body | text | Template with placeholder variables |
| language | text | Default English |

### `student_stub`
| Field | Type | Notes |
|---|---|---|
| school_id | uuid | Tenancy scope |
| source_enquiry_id | uuid | Foreign key to enquiry |
| full_name | text | |
| date_of_birth | date | |
| class_section_id | uuid | Foreign key to class_section |
| guardian_name | text | |
| guardian_contact | text | |
| admission_date | date | |
| fee_status | text | Placeholder only in this build phase |

### `csv_export_log`
Export uses a single fixed, standard column format across all schools. No per-school mapping table is needed, since a specific incumbent ERP is not tracked per school.

| Field | Type | Notes |
|---|---|---|
| school_id | uuid | Tenancy scope |
| requested_by_user_id | uuid | Foreign key to app_user |
| schedule | text | Nullable, cron style if scheduled |
| run_at | timestamp | |
| row_count | integer | |
| status | text | success, failed |
| file_location | text | S3 path to the generated export file |

## 4. AI Module Tables

**Revised 11 August 2026** against the client's AI Module Build Document (`Docs/Client/EduWand_AI_Module_User Journey.pdf`, v1.0). That document introduces `topic` as the container every generation, assignment, and report belongs to, plus several tables not previously modelled. `lesson_plan` and `research_report` below are superseded by the generic `generation` table, since Lesson Studio's output types (lesson plan, custom activity report, flashcards, presentation) all share the same topic/context/school-format/edit-then-persist lifecycle and don't warrant separate tables. This is a schema change from Version 1, not an additive one — migration must account for existing `lesson_plan`/`research_report` rows if any exist.

### `topic`
The spine of the AI Module. Every generation, assignment, observation, and attainment report belongs to exactly one topic.

| Field | Type | Notes |
|---|---|---|
| school_id | uuid | Tenancy scope |
| teacher_user_id | uuid | Foreign key to app_user, topic owner |
| class_section_id | uuid | Foreign key to class_section |
| subject | text | |
| name | text | Teacher-given topic name |
| board | text | CBSE, ICSE, IB |
| status | text | active, archived |

Edge case (per client doc): two topics with the same name for the same class and subject are allowed — `name` is not unique. Archiving a topic that has distributed assignments attached must not orphan those assignments.

### `context_source`
Material supplied to a generation.

| Field | Type | Notes |
|---|---|---|
| topic_id | uuid | Foreign key to topic |
| source_type | text | pdf, docx, pptx, image, url, idream_k12 |
| file_location | text | S3 path, nullable if source_type is url or idream_k12 |
| source_url | text | Nullable |
| idream_k12_reference_id | text | Nullable, reference into the iDream K12 content library |
| extraction_status | text | pending, extracted, failed_no_text (e.g. scanned PDF with no extractable text) |

### `generation`
A single AI-produced output belonging to a topic. Supersedes `lesson_plan` and `research_report`.

| Field | Type | Notes |
|---|---|---|
| topic_id | uuid | Foreign key to topic |
| teacher_user_id | uuid | Foreign key to app_user |
| output_type | text | lesson_plan, custom_activity_report, flashcards, presentation, explanatory_video |
| mode | text | plan, generate — see Plan mode / Generate mode in the PRD terms table |
| class_count | integer | How many classes this generation covers |
| minutes_per_class | integer | |
| language | text | |
| custom_prompt | text | Nullable, optional teacher instruction |
| ai_output | text | Original AI-produced content, retained for audit, never treated as authoritative once edited |
| edited_output | text | Nullable until the teacher edits. When present, this is what saves, shares, and flows to the attainment report — never `ai_output` |
| school_format_template_id | uuid | Foreign key to a school format template (see `school_format_template` below) |
| model_used | text | |
| model_version | text | Open question Q-12: is this actually captured today? Required for audit reproducibility |
| prompt_version | text | Same open question as above |
| generation_status | text | pending, succeeded, failed |
| generated_at | timestamp | |

### `school_format_template`
The output template applied to all generations and attainment reports so documents are standardised across the institution. Ownership (school vs. EduWand at onboarding vs. both) is open — see Q-16.

| Field | Type | Notes |
|---|---|---|
| school_id | uuid | Tenancy scope |
| applies_to | text | generation, attainment_report |
| template_body | text | Or a reference to a stored template document |

### `observation`
A teacher's note recorded during or after class, attached to a topic, feeding the attainment report.

| Field | Type | Notes |
|---|---|---|
| topic_id | uuid | Foreign key to topic |
| author_user_id | uuid | Foreign key to app_user |
| body | text | |
| recorded_at | timestamp | |

### `assignment`
| Field | Type | Notes |
|---|---|---|
| topic_id | uuid | Foreign key to topic. Previously scoped only to class_section; now scoped to topic, which carries its own class_section |
| teacher_user_id | uuid | Foreign key to app_user |
| class_section_id | uuid | Foreign key to class_section |
| target_student_stub_id | uuid | Nullable. Set when the assignment targets one named student rather than the whole class |
| question_count | integer | |
| question_types | jsonb | |
| difficulty_split | jsonb | |
| custom_instructions | text | Nullable |
| due_at | timestamp | |
| distribute_at | timestamp | Nullable if distributed immediately, otherwise the scheduled distribution time |
| personalisation_enabled | boolean | Off by default. Method 2, class-level, see `assignment_personalisation_suggestion` |
| status | text | draft, scheduled, published, closed |

### `answer_key`
The correct answers and marking guidance for an assignment. The teacher-verified version is authoritative, never the AI's original — same edited-supersedes-generated pattern as `generation`.

| Field | Type | Notes |
|---|---|---|
| assignment_id | uuid | Foreign key to assignment |
| question_index | integer | |
| photo_submission_required | boolean | Per-question flag, per client doc Section 3.2 |
| ai_answer | text | Original AI-produced answer/marking guidance |
| teacher_verified_answer | text | Nullable until teacher review. Authoritative once set |
| marks | numeric | |

### `assignment_personalisation_suggestion`
Method 1 (single student) and Method 2 (class level, per-student extra questions) both land here. Never applied without an explicit approval recorded, per the teacher-initiated fallback design. Prerequisite (enforced server-side): at least two prior assignments on the same topic already distributed and graded for the target student(s).

| Field | Type | Notes |
|---|---|---|
| assignment_id | uuid | Foreign key to assignment |
| student_stub_id | uuid | Foreign key to student_stub |
| method | text | single_student, class_level |
| suggested_difficulty_mix | jsonb | Method 1 |
| suggested_extra_questions | jsonb | Method 2, 2 to 5 questions per student, distinct generation per student, not one set per class |
| prerequisite_met | boolean | Computed from the student's graded-assignment history on this topic |
| teacher_decision | text | pending, approved, overridden, opted_out |
| decided_by_user_id | uuid | Foreign key to app_user, nullable until decided |
| decided_at | timestamp | Nullable |

### `submission`
| Field | Type | Notes |
|---|---|---|
| assignment_id | uuid | Foreign key to assignment |
| student_stub_id | uuid | Foreign key to student_stub |
| submission_type | text | online, photo |
| content | text | Submitted work, for online submissions |
| photo_file_location | text | Nullable, S3 path, for photo submissions |
| ocr_extracted_text | text | Nullable, populated after OCR runs on a photo submission |
| ocr_confidence | numeric | Nullable. Q-11-adjacent: no accuracy threshold or fallback behaviour defined yet for low-confidence OCR |
| submitted_at | timestamp | |
| is_late | boolean | Computed against assignment.due_at |

### `grade`
| Field | Type | Notes |
|---|---|---|
| submission_id | uuid | Foreign key to submission |
| ai_score | numeric | AI-assigned score |
| ai_feedback | text | Feedback and next steps |
| ai_next_step | text | Suggested next-step action against this individual response, per client doc Section 3.4 |
| model_used | text | claude-haiku |
| teacher_override_score | numeric | Nullable. Authoritative everywhere the grade appears once set, including attainment report and analytics |
| teacher_override_by_user_id | uuid | Nullable, foreign key to app_user |
| flagged_for_attention | boolean | AI-raised flag for a struggling student |
| performance_band | text | level_1 (>80%), level_2 (50-80%), level_3 (<50%). Editable band thresholds, see `class_band_config` |
| released_to_student | boolean | Grade and feedback are visible to the student only once this is true |
| released_at | timestamp | Nullable |

### `class_band_config`
Editable per-school override of the default performance band thresholds (>80% / 50-80% / <50%).

| Field | Type | Notes |
|---|---|---|
| school_id | uuid | Tenancy scope |
| level_1_min_percent | numeric | Default 80 |
| level_2_min_percent | numeric | Default 50 |

### `attainment_report`
One per topic. Auto-populated from `generation`, `observation`, and `submission`/`grade` results for that topic — no re-entry by the teacher. Printable, audit-oriented; the interactive equivalent is the Student Analytics Dashboard (no dedicated table, it queries `topic`/`generation`/`observation`/`grade` directly).

| Field | Type | Notes |
|---|---|---|
| topic_id | uuid | Foreign key to topic, one attainment_report per topic |
| blooms_taxonomy_mapping | jsonb | Objectives labelled against Bloom's levels |
| what_was_done | text | Derived from generation + observation |
| outcomes | text | Derived from grade results |
| improvement_notes | text | |
| pdf_file_location | text | Nullable, S3 path once exported |
| generated_at | timestamp | |

### `communication_message`
Backs all three Communication Hub channels (teacher-to-parent weekly update, teacher-to-student, teacher-to-class broadcast).

| Field | Type | Notes |
|---|---|---|
| school_id | uuid | Tenancy scope |
| channel | text | parent_weekly_update, teacher_to_student, teacher_to_class |
| sender_user_id | uuid | Foreign key to app_user, nullable for system-generated weekly updates |
| recipient_student_stub_id | uuid | Nullable, set for teacher_to_student and parent_weekly_update |
| recipient_class_section_id | uuid | Nullable, set for teacher_to_class |
| topic_id | uuid | Nullable, set when a parent_weekly_update is assembled from specific topics |
| body | text | |
| delivery_mechanism | text | Open question Q-08 in the client doc, not yet answered — in-app, SMS, email, or a combination |
| delivery_status | text | pending, sent, failed |
| sent_at | timestamp | Nullable |

### `ai_usage_log`
Feeds the AI usage analytics view in the Admin Dashboard, and supports Bedrock cost tracking. `feature` values extended to cover the new components.

| Field | Type | Notes |
|---|---|---|
| teacher_user_id | uuid | Foreign key to app_user |
| feature | text | generation, personalisation, grading, attainment_report, communication_hub |
| model_used | text | claude-sonnet, claude-haiku, nova-lite |
| input_tokens | integer | |
| output_tokens | integer | |
| created_at | timestamp | |

## 5. Relationships Summary

- `trust` has many `school`
- `school` has many `academic_year`, `enquiry`, `student_stub`, `app_user`
- `academic_year` has many `class_section`
- `enquiry` has many `enquiry_stage_history` and `follow_up_task`, and may produce one `student_stub`
- `topic` has many `context_source`, `generation`, `observation`, and `assignment`, and exactly one `attainment_report`
- `generation` belongs to one `topic` and one `school_format_template`
- `assignment` belongs to one `topic`, has many `answer_key` rows, `assignment_personalisation_suggestion` rows, and `submission` rows
- `submission` has one `grade`
- `attainment_report` belongs to one `topic`, derived from that topic's `generation`, `observation`, and `grade` data
- `communication_message` belongs to a `school`, optionally references a `topic` (parent weekly update) or a `student_stub`/`class_section` (targeted message)
- `app_user`, in the teacher role, owns `topic`, produces `generation`, `assignment`, `observation`, and `ai_usage_log` entries

## 6. Notes for Implementation

- All tables scoped to a school must filter by `school_id` in every query, enforced at the application layer, not left to client-side filtering
- `assignment_personalisation_suggestion` must never be read as an applied personalisation until `teacher_decision` is approved, this is the enforcement point for the DPDP-safe design. The Method 2 prerequisite (`prerequisite_met`, at least two prior graded assignments on the topic) must also be checked server-side, not only hidden in the UI
- `generation.edited_output`, not `generation.ai_output`, is what the attainment report, distribution to students/parents, and the weekly Communication Hub update must all read. Same pattern for `answer_key.teacher_verified_answer` over `answer_key.ai_answer`
- `grade.teacher_override_score`, where set, is authoritative everywhere the grade is read — attainment report, Student Analytics Dashboard, and Communication Hub weekly updates all included
- A student only sees a `grade` once `released_to_student` is true — enforce this at the query layer for every student-facing read path, not just the primary grading review screen
- `ai_usage_log` should be written asynchronously, from the worker instance, so AI calls are not slowed down by logging. Method 2 class-level personalisation produces one `assignment_personalisation_suggestion` generation per student — for a class of 40 that is 40 `ai_usage_log` rows per personalised assignment, not 1
- `message_template.body` should be treated as user-editable configuration, not hardcoded. The CSV export format itself is fixed and standard across all schools, not configurable per school
- Open schema questions still unresolved (see PRD Section 6.7): whether `generation.model_used`/`model_version`/`prompt_version` are actually populated on every generation (Q-12, needed for attainment-report audit reproducibility); retention/deletion policy is stated as 1 year for submissions, generations, and analytics (Q-19) but no deletion job exists yet in this schema

---
*End of document. Fovea Infotech. Confidential.*
