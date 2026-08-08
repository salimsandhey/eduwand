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

### `lesson_plan`
| Field | Type | Notes |
|---|---|---|
| teacher_user_id | uuid | Foreign key to app_user |
| class_section_id | uuid | Foreign key to class_section |
| topic | text | |
| board | text | CBSE, ICSE, State |
| format | text | For example 5E |
| content | text | Generated lesson plan content |
| model_used | text | claude-sonnet |
| generated_at | timestamp | |

### `research_report`
| Field | Type | Notes |
|---|---|---|
| teacher_user_id | uuid | Foreign key to app_user |
| topic | text | |
| content | text | Generated report content |
| model_used | text | claude-sonnet |
| generated_at | timestamp | |

### `assignment`
| Field | Type | Notes |
|---|---|---|
| teacher_user_id | uuid | Foreign key to app_user |
| class_section_id | uuid | Foreign key to class_section |
| title | text | |
| personalisation_enabled | boolean | Teacher opt-in per assignment |
| status | text | draft, published, closed |

### `assignment_personalisation_suggestion`
Holds the system-suggested difficulty mix per student, pending teacher review. Never applied without an explicit approval recorded here, per the teacher-initiated fallback design.

| Field | Type | Notes |
|---|---|---|
| assignment_id | uuid | Foreign key to assignment |
| student_stub_id | uuid | Foreign key to student_stub |
| suggested_difficulty_mix | jsonb | System suggestion, not yet applied |
| teacher_decision | text | pending, approved, overridden, opted_out |
| decided_by_user_id | uuid | Foreign key to app_user, nullable until decided |
| decided_at | timestamp | Nullable |

### `submission`
| Field | Type | Notes |
|---|---|---|
| assignment_id | uuid | Foreign key to assignment |
| student_stub_id | uuid | Foreign key to student_stub |
| content | text | Submitted work |
| submitted_at | timestamp | |

### `grade`
| Field | Type | Notes |
|---|---|---|
| submission_id | uuid | Foreign key to submission |
| ai_score | numeric | AI-assigned score |
| ai_feedback | text | Feedback and next steps |
| model_used | text | claude-haiku |
| teacher_override_score | numeric | Nullable |
| teacher_override_by_user_id | uuid | Nullable, foreign key to app_user |
| flagged_for_attention | boolean | AI-raised flag for a struggling student |

### `ai_usage_log`
Feeds the AI usage analytics view in the Admin Dashboard, and supports Bedrock cost tracking.

| Field | Type | Notes |
|---|---|---|
| teacher_user_id | uuid | Foreign key to app_user |
| feature | text | lesson_plan, research_report, personalisation, grading |
| model_used | text | claude-sonnet, claude-haiku, nova-lite |
| input_tokens | integer | |
| output_tokens | integer | |
| created_at | timestamp | |

## 5. Relationships Summary

- `trust` has many `school`
- `school` has many `academic_year`, `enquiry`, `student_stub`, `app_user`
- `academic_year` has many `class_section`
- `enquiry` has many `enquiry_stage_history` and `follow_up_task`, and may produce one `student_stub`
- `assignment` has many `assignment_personalisation_suggestion` and `submission`
- `submission` has one `grade`
- `app_user`, in the teacher role, generates `lesson_plan`, `research_report`, `assignment`, and produces `ai_usage_log` entries

## 6. Notes for Implementation

- All tables scoped to a school must filter by `school_id` in every query, enforced at the application layer, not left to client-side filtering
- `assignment_personalisation_suggestion` must never be read as an applied personalisation until `teacher_decision` is approved, this is the enforcement point for the DPDP-safe design
- `ai_usage_log` should be written asynchronously, from the worker instance, so AI calls are not slowed down by logging
- `message_template.body` should be treated as user-editable configuration, not hardcoded. The CSV export format itself is fixed and standard across all schools, not configurable per school

---
*End of document. Fovea Infotech. Confidential.*
