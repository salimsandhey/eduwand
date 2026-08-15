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
| Teacher | Plan lessons, assess and grade, track attainment, communicate with parents and students | AI Module (all seven components) |
| Student | Access materials, submit and review assignments, message the teacher | AI Module, Students Dashboard, Communication Hub |
| Parent | Receive automatic weekly updates on their child | AI Module, Communication Hub (receive only, no login flow specified) |

**Status update, 11 August 2026:** the client's AI Module Build Document (`Docs/Client/EduWand_AI_Module_User Journey.pdf`) makes the Student role functional in this build — materials, assignment submission, photo upload, grade viewing. This supersedes the "structural shell only, no functional access" position stated in Section 8 below and in the original PRD. Flag this back to the client rather than building silently against the older instruction — see Section 6.7.

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

## 6. Module 2, AI Module

### 6.1 Description

Lets teachers use AI without prompting or switching between apps. As of the client's AI Module Build Document (v1.0, 11 August 2026), the AI Module is **seven interdependent components**, not two. All of them read and write against a shared **Topic** — the container for every generation, assignment, observation, and report belonging to one unit of teaching — so data produced by one component is reusable by the others without the teacher re-entering anything.

| # | Component | One-line purpose |
|---|---|---|
| 1 | Lesson Studio | Generate curriculum-aligned teaching materials for a topic |
| 2 | Assignment Lab — generation | Generate, verify, and distribute assignments to a class or a student |
| 3 | Assignment Lab — evaluation | Grade submissions against the teacher's answer key and produce class-level insight |
| 4 | Attainment Report | Standard, printable per-topic record of objectives, observations, and outcomes |
| 5 | Students Dashboard | Student interface for accessing materials, submitting assignments, viewing results |
| 6 | Student Analytics Dashboard | One page for the teacher to see a student's or class's report |
| 7 | Communication Hub | Centralised teacher-to-parent, teacher-to-student, and teacher-to-class communication |

Runs on Amazon Bedrock. Model routing (Claude Sonnet / Claude Haiku / Nova Lite, Section 6.3) was the settled position under the original two-component scope; the client document does not repeat or reconfirm this routing and instead raises generation architecture as an open question (Q-02, Q-03, Section 6.7). Treat model routing as needing re-confirmation against the new component list, not as still-settled.

### 6.1.1 Terms (fixed meaning, use identically in code, database, and UI)

| Term | Meaning |
|---|---|
| Topic | The container for all work on a unit of teaching. Every generation, assignment, and attainment report belongs to exactly one topic. |
| Context | Material supplied to a generation: an uploaded file, a URL, or an item from the iDream K12 content library. |
| Generation | A single AI-produced output — lesson plan, activity, flashcard set, or presentation — belonging to a topic. |
| Observation | A teacher's note recorded during or after class, attached to the topic, feeding the attainment report. |
| Answer Key | Correct answers and marking guidance for an assignment. The teacher-verified version is authoritative, never the AI's original. |
| Plan mode / Generate mode | Plan mode shows the teacher an editable outline before generation; generate mode produces the full output directly. |
| School format | The output template applied to all generations so documents are standardised across the institution. |

### 6.2 Functional Requirements

| ID | Requirement |
|---|---|
| FR-AI-1 | Generate lesson material (lesson plan, custom activity report, flashcards, presentation) from a topic, board aware: CBSE, ICSE, IB. Zero prompt-writing required; dropdown-driven setup with an optional custom-instructions field. |
| FR-AI-1a | Context ingestion: PDF, DOCX, PPTX, image, URL, or an item selected from the iDream K12 content library. |
| FR-AI-1b | Teacher review and edit of every generation before it saves or shares. The edited version, not the original AI output, is what persists and flows downstream. |
| FR-AI-2 | Personalise assignment items using each student's performance history, via the teacher-initiated fallback design (Section 6.4), gated by a server-enforced prerequisite of at least two prior graded assignments on the same topic (Section 6.4.1) |
| FR-AI-3 | AI-grade submissions (online and OCR'd photo) against the teacher-verified answer key, producing per-student feedback, three-level class banding, item analysis, and suggested classroom actions, with teacher override authoritative everywhere the grade appears |
| FR-AI-4 | Surface live per-student and per-class analytics (Student Analytics Dashboard), and a separate printable, audit-oriented Attainment Report per topic, structured against Bloom's taxonomy |
| FR-AI-5 | Auto-save all outputs to the classroom database under their topic, retrievable for the full academic year across sessions |
| FR-AI-6 | Operate on web and teacher tablet, and on a student mobile browser (Students Dashboard) |
| FR-AI-7 | Weekly automated parent update per child, assembled from that week's Lesson Studio generations and Assignment Lab results, delivered via the Communication Hub |
| FR-AI-8 | Teacher-to-student one-to-one messaging and teacher-to-class broadcast, via the Communication Hub, with retained message history |

### 6.3 Model Routing

| Model | Used For |
|---|---|
| Claude Sonnet | Lesson plan generation, research report generation |
| Claude Haiku | AI grading and feedback, personalisation suggestion step |
| Nova Lite | Lightweight classification and tagging, secondary or overflow load |

This table reflects the original two-component scope and has not been reconfirmed against the expanded component list. In particular, Method 2 class-level personalisation (Section 6.4.2) generates one output per student rather than one per class — for a 40-student class that is a 40x fan-out in generation volume, which changes the cost and latency assumptions this routing table was set against. Do not treat this table as final until Q-02 and Q-03 (Section 6.7) are answered.

### 6.4 FR-AI-2, Teacher-Initiated Fallback Design (Mandatory)

Personalising assignments from a student's performance history is, on its face, behavioural monitoring of a child, and raises a live question under DPDP Act 2023 Section 9. This build implements the fallback design specified for exactly this situation, not automated profiling, as the **permanent approach**, not a temporary stand-in:

- The system suggests a difficulty mix per student, based on recent performance, as a recommendation only
- The teacher reviews, approves, or overrides the suggestion before it is applied to an assignment
- No profile persists or acts on a student without a teacher's active decision at the point of use
- Per-student opt out is available and recorded
- No use of a child's data for advertising, ranking, or any purpose outside instruction, under any circumstance

#### 6.4.1 Personalisation prerequisite

A teacher may only personalise an assignment once at least two assignments have already been distributed and graded on the same topic. Enforced server-side, not only hidden in the UI. Where unmet, the teacher is told plainly why and the standard (non-personalised) assignment still generates.

#### 6.4.2 Two personalisation methods

- **Method 1 — single student:** the teacher generates an assignment for one named student, personalised from that student's own assignment responses and teacher feedback only. No other data source.
- **Method 2 — class level:** an off-by-default toggle adds 2–5 extra questions **per student individually** on top of the shared assignment, reflecting what that student needs to revisit. This produces a distinct question set per student, not one set for the class — 40 students means 40 generations, not 1.

### 6.5 Acceptance Criteria

- A lesson plan is generated in under approximately 60 seconds
- A teacher can go from login to a saved, school-formatted generation without writing a prompt at any step
- An edited generation, not the original AI output, is what saves, shares, and flows into the attainment report
- Personalisation is applied only after teacher approval, and only once the two-graded-assignment prerequisite is met, enforced server-side
- AI grading is validated against a teacher-graded sample within an agreed accuracy tolerance; OCR accuracy on handwritten photo submissions is measured on a real sample and reported before being enabled for a live class
- Grades and feedback become visible to a student only once the teacher releases them
- Analytics update in near real time after a submission is graded
- A completed topic produces a full attainment report with no additional data entry by the teacher
- All generated content is stored and retrievable for the full academic year

### 6.6 Risk

Handwriting OCR across Indian school scripts and mathematical notation is the highest-uncertainty piece of the AI Module. A wrongly graded child reaches a parent quickly. AI grades on photo submissions are presented to the teacher as a suggestion requiring confirmation, never published directly to a student.

### 6.7 Open Questions Raised by the Client's AI Module Build Document

These come directly from Section 8 of `Docs/Client/EduWand_AI_Module_User Journey.pdf` (v1.0, 11 August 2026). They block architecture decisions below and are not to be assumed; raise with the client (Melvyn Brodie, mbrodie@eduwand.com) rather than guessing.

| ID | Question | Why it matters |
|---|---|---|
| Q-02 | Is generation synchronous or queued? A multi-class lesson plan may take 60–120 seconds | A synchronous design will time out under real use and be rebuilt. Consistent with the existing "AI generation endpoints should be async" note in the API spec — now confirmed as an open decision, not an implementation detail |
| Q-03 | Acceptable cost ceiling per generation, and a cap per teacher or per school? | Method 2 class-level personalisation is a 40x fan-out per class of 40 |
| Q-07 | What exactly does the Student Analytics Dashboard show, and how does it differ from the Attainment Report? | One line of spec today; cannot be estimated as it stands |
| Q-10 | What happens when a generation fails or produces poor output — retry, regenerate, fall back? | Undefined today; will happen daily in production |
| Q-11 | Guardrails on generated content for factual accuracy against the supplied source, and age-appropriateness? | A wrong fact in a lesson plan a parent sees is a reputational problem, not a bug |
| Q-12 | Are generations versioned — prompt version and model version stored against the output? | Attainment reports are used for audit; outputs must be explainable and reproducible when the model changes |
| Q-13 | Where does syllabus mapping (chapter/topic structure, learning outcomes per class and subject) come from? | "Curriculum-aligned" and the Bloom's-structured attainment report both depend on it. Candidates: iDream K12 taxonomy, DIKSHA/Sunbird framework API, NCERT learning outcome documents, CBSE Academic curriculum documents |
| Q-16 | Who supplies and maintains school format templates — school, EduWand at onboarding, or both? | Client's answer so far: "school provides data based on the template" |
| Q-17 | How is parental consent captured and recorded for student data? | DPDP Act 2023 Section 9 and DPDP Rules 2025 Rule 10 require verifiable parental consent for a child's data; whether the school carve-out extends to a platform operating behind the school is unsettled — verify with counsel |
| Q-18 | Is customer data excluded from model training by default at the provider level? | Should be off by default, contractually excluded, per-school opt-in only |
| Q-19 | Retention and deletion policy for student submissions, generations, and analytics? | Client's answer so far: 1 year |

Also unresolved from the client document itself: **the Student role's functional status contradicts Section 8 of this PRD** ("Student and Parent functional features... structural shell only in this build"). The Students Dashboard component (materials, submission, photo upload, grade viewing) is fully specified as in-scope by the client. This needs an explicit decision, not a silent scope absorption — see the status note in Section 3.

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
| Student functional features | **Contested, 11 August 2026.** Originally structural shell only. The client's AI Module Build Document specifies a fully functional Students Dashboard (materials, submission, photo upload, grade viewing, teacher messaging) as in-scope for this build. Needs explicit client sign-off before treating as confirmed scope, see Section 6.7. |
| Parent functional features | Structural shell only for parent login/account features; parents do receive the Communication Hub's automatic weekly update (Section 6.2, FR-AI-7) without needing an app account, per the client document |
| AI Socratic Tutor for students | Explicitly Phase 2 per the client document (Students Dashboard, Section 5.1). Not in this build. |
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
- `Docs/Client/EduWand_AI_Module_User Journey.pdf` — client's AI Module Build Document, v1.0, 11 August 2026, owned by Melvyn Brodie (Founder). Authoritative for AI Module scope, workflow, and terminology; Section 6 above is now aligned to it. Its Section 8 open questions are reproduced in Section 6.7 above and remain unanswered.

---
*End of document. Fovea Infotech. Confidential.*
