# EduWand Platform — Engineering PRD
**Enrolment Growth Engine and AI Module**
Prepared by Fovea Infotech | Version 1 | Confidential

---

## 1. Purpose and Scope

This is the engineering-facing Product Requirements Document for the EduWand build. It translates LessonForge's product PRD into the detail needed to build, covering the two modules in this build phase: the Enrolment Growth Engine and the AI Module. It is the single reference document engineers, QA, and design work from during the eight week build.

Out of scope for this build: Smart ERP, the Socratic AI Tutor, the Digital Content Library, and the hardware or MDM layer. These remain follow-on phases and are not detailed here.

## 2. Vision

Give schools their time back and personalise education at scale, by integrating AI into teacher workflows and automating the administrative work that consumes roughly half of a teacher's day.

## 3. Users and Roles

| Role | Primary Need | Modules Used |
|---|---|---|
| Front desk / Admissions staff | Log and follow up on enquiries fast | Enrolment Growth Engine |
| School Leadership / Admin | Live visibility into enrolment and AI adoption | Enrolment Growth Engine analytics, AI Module usage analytics |
| Teacher | Plan lessons, personalise and grade assignments fast | AI Module |
| Student | No functional access in this build phase | None, structural shell only |
| Parent | No functional access in this build phase | None, structural shell only |

## 4. System Architecture

One SaaS application, used by every school and every trust. No separate app is generated or deployed per client. Two front ends share one backend and one data model:

- **Unified App** — mobile and web, Teacher, Student, and Parent roles on one codebase. Teacher role is functional in this build.
- **Admin and Leadership Dashboard** — web first.

The backend is one application, deployed on Amazon Web Services, Mumbai region, across two production instances plus one worker instance for background and asynchronous jobs, with a separate UAT copy for testing. Both applications call this same backend.

### 4.1 Tenancy Model

The data model supports multi-school tenancy from day one: **Trust → School → Academic Year → Class → Section**. Many buyers run 2 to 5 schools under one trust and expect a trust-level consolidated view. This is a hard requirement for this build, not a later enhancement, since it cannot reasonably be retrofitted once schema work has started.

- Users are scoped to a trust, one or more schools, or a single class
- Data isolation between schools is logical, enforced in the application layer, not by separate deployments
- A staff member can be assigned to more than one school within the same trust
- Trust-level consolidated dashboards sit alongside per-school views

## 5. Module 1, Enrolment Growth Engine

### 5.1 Description

Captures every prospective-student enquiry from any channel as a structured record, then runs automated multi-channel follow up to convert enquiries into admissions. Must be deployable standalone, sold and used on its own by a school, with no dependency on any other module.

### 5.2 Functional Requirements

| ID | Requirement |
|---|---|
| FR-EG-1 | Capture an enquiry from any channel into a structured record: contact, source, grade or board interest, notes, owner, timestamps |
| FR-EG-2 | Multi-channel intake: manual entry (call or walk-in), public web form, referral, event or expo bulk upload |
| FR-EG-3 | Configurable admissions pipeline with stages and status transitions |
| FR-EG-4 | Automated, templated follow up (SMS and email) with scheduling and drip sequences. Gated by DLT registration with Indian telecom operators for SMS sender IDs and templates |
| FR-EG-5 | Task assignment and reminders for staff and counsellors |
| FR-EG-6 | Admissions workflow: application, document collection, admission confirmation, then handoff. On confirmation the system creates a student stub record: name, date of birth, class or section applied for, board, guardian name and contact, admission date, fee status placeholder, source enquiry ID |
| FR-EG-7 | Duplicate detection and merge |
| FR-EG-8 | Analytics: source-wise volume, conversion funnel, conversion percentage, year-on-year enrolment growth, counsellor performance |
| FR-EG-9 | Role-based access; messaging consent capture, DPDP |
| FR-EG-10 | Integrations: SMS gateway, email, embeddable website form |
| FR-EG-11 | Admitted-student CSV export, in a fixed, standard column format, runnable on demand or on a schedule, with an export log. Not custom-mapped per school, since a specific incumbent ERP is not being tracked per school |
| FR-EG-12 | Standalone operability: must install, authenticate, operate, and report with only Platform Foundations present, no dependency on any other module |

### 5.3 Acceptance Criteria

- An enquiry can be logged in under approximately 30 seconds with all mandatory fields
- Automated follow up messages fire on schedule and are logged against the enquiry record
- Funnel and conversion analytics update in near real time
- Duplicate enquiries are detected at the point of entry
- Messaging consent is captured before any automated message is sent to a parent or guardian

## 6. Module 2, AI Module, Lesson Studio and Assignment Lab

### 6.1 Description

Lets teachers use AI without prompting or switching between apps. Lesson Studio creates lesson plans, learning material, and research reports. Assignment Lab creates and grades personalised assignments, with live analytics for the teacher. Runs on Amazon Bedrock, using Claude Sonnet, Claude Haiku, and Nova Lite.

### 6.2 Functional Requirements

| ID | Requirement |
|---|---|
| FR-AI-1 | Generate lesson material from topic or curriculum inputs, board aware: CBSE, ICSE, or State |
| FR-AI-2 | Personalise assignment items using each student's performance history, via the teacher-initiated fallback design, see 6.4 |
| FR-AI-3 | AI-grade submissions and produce feedback plus next steps, with teacher override |
| FR-AI-4 | Surface live per-student and per-class analytics |
| FR-AI-5 | Auto-save all outputs to the classroom database, retrievable for the full academic year |
| FR-AI-6 | Operate on web and teacher tablet |

### 6.3 Model Routing

| Model | Used For |
|---|---|
| Claude Sonnet | Lesson plan generation, research report generation |
| Claude Haiku | AI grading and feedback, personalisation suggestion step |
| Nova Lite | Lightweight classification and tagging, secondary or overflow load |

### 6.4 FR-AI-2, Teacher-Initiated Fallback Design (Mandatory)

Personalising assignments from a student's performance history is, on its face, behavioural monitoring of a child, and raises a live question under DPDP Act 2023 Section 9. This build implements the fallback design specified for exactly this situation, not automated profiling, as the **permanent approach**, not a temporary stand-in:

- The system suggests a difficulty mix per student, based on recent performance, as a recommendation only
- The teacher reviews, approves, or overrides the suggestion before it is applied to an assignment
- No profile persists or acts on a student without a teacher's active decision at the point of use
- Per-student opt out is available and recorded
- No use of a child's data for advertising, ranking, or any purpose outside instruction, under any circumstance

### 6.5 Acceptance Criteria

- A lesson plan is generated in under approximately 60 seconds
- Personalisation is applied only after teacher approval, to the agreed share of assignment items
- AI grading is validated against a teacher-graded sample within an agreed accuracy tolerance
- Analytics update in near real time after a submission is graded
- All generated content is stored and retrievable for the full academic year

## 7. Non-Functional Requirements

| Category | Requirement |
|---|---|
| Data privacy and compliance | DPDP Act 2023 compliance for all student and minor data. Explicit and verifiable parental consent for minors under Section 9. Data residency in India. Right to erasure, reconciled with a per-object retention schedule. No processing of children's data for advertising, ranking, or any non-instructional purpose. A data-processing agreement is required with every sub-processor, including the AI model provider. |
| Security | Encryption in transit and at rest. Role-based access control. Audit logging. Secure authentication, SSO or OAuth. |
| Performance | Dashboards and analytics update in near real time. Lesson generation completes in under approximately 60 seconds. Responsive on low-end devices. |
| Scalability | Support institutions from 500 to 3,500 students, scaling toward roughly 50 institutions. Concrete sizing: approximately 100,000 student records, 200,000 parent accounts, 4,000 teacher accounts at full scale. Peak concurrency: attendance-style write spikes and up to 200,000 notifications inside a single 15 minute morning window must be assumed for infrastructure sizing, not the daily average. Not directly triggered by the two modules in this build, but the data model and notification pipeline must be built to this ceiling from day one. |
| Availability and reliability | High availability for the system of record. Regular backups. Disaster recovery. Monitored uptime. |
| Platforms and compatibility | Mobile, iOS and Android, and web. Usable on low bandwidth. Graceful offline behaviour where possible. |
| Localisation and accessibility | Multi-board: CBSE, ICSE, State. English first for this build phase, with regional-language readiness in the data model. |
| Hosting | Amazon Web Services, Mumbai region, per the confirmed infrastructure Statement of Work. |

## 8. Out of Scope for This Build

| Item | Status |
|---|---|
| Smart ERP core | Follow-on phase, required for the EXPAND commercial motion |
| Socratic AI Tutor | Follow-on phase, pending safeguarding and legal review |
| Digital Content Library | Follow-on phase, pending content partner agreement |
| Hardware / MDM layer | Follow-on phase, optional |
| Student and Parent functional features | Structural shell only in this build, functionality follows in a later phase |
| WhatsApp messaging | Excluded from current scope. Messaging is SMS and email only |

## 9. Decisions Confirmed

| Item | Decision |
|---|---|
| Incumbent ERP per school | Not tracked. EduWand is built and sold as a standalone product, not positioned around integrating with a specific incumbent ERP. FR-EG-11 export is generic, not per-school mapped. |
| Trust to School tenancy model | Confirmed final, as specified in Section 4.1. |
| DPDP Section 9, FR-AI-2 personalisation | Proceeding with the teacher-initiated fallback design in Section 6.4 as the permanent approach for this build, not a temporary stand-in pending legal review. |
| Application model | One single application, used by every school and every trust. No separate app is generated or deployed per client. |

## 10. Open Questions Still Outstanding

- IP ownership terms in the Master Services Agreement, not yet decided
- Who owns QA, UAT, and pilot support, and whether third-party security testing is in scope, deferred for now

## 11. Reference Documents

This PRD is one of a set of documents governing this build:

- Database Schema
- API Specification
- UI Screen Specification
- Environment Setup

---
*End of document. Fovea Infotech. Confidential.*
