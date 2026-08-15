# EduWand Platform — UI Screen Specification
**Enrolment Growth Engine and AI Module**
Prepared by Fovea Infotech | Version 1 | Confidential

---

## 1. Overview

This document lists every screen to be built in this phase, across the Unified App and the Admin Dashboard, with purpose, key elements, and primary actions for each. It is the reference for frontend build and for AI-assisted UI generation, so screens are built consistently rather than designed fresh each session.

### 1.1 Visual Design Direction

The Admin Dashboard follows a card-based, light-background layout in the style of the Donezo reference: a fixed left sidebar for navigation, a top bar with search and profile, and a main area built from rounded, self-contained cards (KPI cards, chart cards, list cards). A single green accent colour is used for primary actions, highlights, and status indicators, with a light neutral background elsewhere. This direction should be carried through consistently across all Admin Dashboard screens listed below. The Unified App follows the same design language, adapted to a mobile-first layout.

## 2. Unified App, Shared Screens

### Login
- **Purpose:** authenticate and route the user to their role-based home screen
- **Key elements:** email or phone input, password or OTP, forgot password link
- **Actions:** log in, request password reset

### Role-Based Home
- **Purpose:** landing screen after login, differs by role
- **Front desk or counsellor:** enquiry list and pipeline board
- **Teacher:** Lesson Studio and Assignment Lab entry points
- **Key elements:** role-specific navigation, notification bell

## 3. Unified App, Front Desk and Counsellor Screens

### Enquiry List
- **Purpose:** view and filter all enquiries
- **Key elements:** searchable list, filters for status, source, owner, quick-add button
- **Actions:** open an enquiry, create a new enquiry, bulk upload

### New Enquiry Form
- **Purpose:** log a new enquiry in under approximately 30 seconds
- **Key elements:** contact name, phone, email, source dropdown, grade or board interest, notes
- **Actions:** save and assign to self, save and assign to another counsellor

### Enquiry Detail
- **Purpose:** view and manage a single enquiry through its lifecycle
- **Key elements:** contact details, stage tracker, stage history, notes, follow up task list, duplicate warning banner if applicable
- **Actions:** change stage, merge duplicate, add follow up task, confirm admission

### Admissions Pipeline Board
- **Purpose:** visual view of all enquiries by stage
- **Key elements:** columns for New, Contacted, Visit, Application, Admitted, Enrolled, Lost
- **Actions:** drag an enquiry between stages, open an enquiry from its card

### Follow Up Task List
- **Purpose:** daily task list for a counsellor
- **Key elements:** due today, overdue, upcoming groupings, linked enquiry per task
- **Actions:** mark complete, send templated message, reschedule

### Admission Confirmation
- **Purpose:** convert an enquiry into a student stub record
- **Key elements:** student details form, guardian details, class or section selector
- **Actions:** confirm admission

### CSV Export
- **Purpose:** export admitted students in a standard, fixed CSV format
- **Key elements:** date range, run history table, download link per past run
- **Actions:** run export now, download a file, view export log

## 4. Unified App, Teacher Screens

**Revised 11 August 2026** against the client's AI Module Build Document. All Teacher screens below now hang off a **Topic**, selected or created at entry, rather than a bare class/board input. See PRD Section 6.1.1 for the fixed terms (Topic, Context, Generation, Observation, Answer Key, Plan/Generate mode, School format).

### Topic Selection
- **Purpose:** entry point for Lesson Studio, listing the teacher's existing topics for the selected class and letting them start a new one
- **Key elements:** class/subject filter, existing-topics list (most recent first), "new topic" action
- **Actions:** continue an existing topic, start a new topic

### Content Library / Context (new topic only)
- **Purpose:** on starting a new topic, show existing material from the iDream K12 content library for that topic, or let the teacher upload their own
- **Key elements:** iDream K12 search results, upload control (PDF, DOCX, PPTX, image, URL)
- **Actions:** select a library item, upload a file, add a URL, skip to generation setup
- **Edge case:** iDream K12 returns no results — teacher must still be able to proceed via upload

### Lesson Studio, Generation Setup
- **Purpose:** dropdown-driven setup for a generation, no prompt-writing required
- **Key elements:** class, subject, topic (carried from Topic Selection), language, content source, output type (lesson plan, custom activity report, flashcards, presentation, explanatory video), class count, minutes per class, plan mode / generate mode toggle, optional custom prompt field
- **Actions:** generate

### Lesson Studio, Generation Review
- **Purpose:** review and edit a generated output before it saves or shares — the edited version is what persists
- **Key elements:** generated content in the school format template, edit controls, context sources used (still attached and visible)
- **Actions:** edit, save, send to students, send to parents
- **Note:** a generation that fails must preserve the teacher's inputs and offer a one-click retry, per the client doc's acceptance criteria

### Observation Capture
- **Purpose:** lightweight note the teacher can add during or immediately after class, attached to the topic
- **Key elements:** free-text note field, timestamp
- **Actions:** save observation
- **Note:** feeds the Attainment Report automatically, no further action needed

### Assignment Lab, Create Assignment
- **Purpose:** build a new assignment for a class or a single named student, optionally with personalisation
- **Key elements:** context source (Lesson Studio generation or fresh upload), question count, question types, difficulty split, due date, custom instructions, per-question photo-vs-online submission flag, personalisation toggle (off by default), schedule now / schedule later
- **Actions:** generate, save as draft, publish

### Assignment Lab, Answer Key Review
- **Purpose:** teacher verification step before distribution — the teacher-verified answer key is authoritative, never the AI's original
- **Key elements:** generated questions and matching answer key, per-question edit controls (question text, answer, mark allocation)
- **Actions:** edit any question/answer/mark, approve and distribute

### Assignment Lab, Personalisation Review
- **Purpose:** review and approve the system's suggested difficulty mix (Method 1, single student) or per-student extra questions (Method 2, class level), before either is applied
- **Key elements:** per-student suggested mix or extra-question set, reasoning summary, approve/override/opt-out controls, prerequisite status (needs 2 prior graded assignments on this topic — students who don't meet it are shown plainly why personalisation is unavailable for them)
- **Actions:** approve individually, approve all, override a specific student, opt a student out
- **Note:** no personalisation is applied to a student without an explicit action on this screen. This remains the single place in the product where FR-AI-2 personalisation is applied.

### Grading Review
- **Purpose:** review AI-generated grades and feedback before release to students
- **Key elements:** submission list, AI score/feedback/next-step per submission, OCR'd photo submissions shown alongside the extracted text for verification, flagged-for-attention indicator, three-level class banding (top / middle / needs attention, editable thresholds), item analysis (questions most of the class got wrong), suggested classroom actions
- **Actions:** accept AI grade, override score, edit feedback, release grades
- **Note:** AI grades on photo submissions are a suggestion for teacher confirmation, never published directly — this is the highest-risk surface in the module per the client doc's OCR risk note

### Teacher Analytics
- **Purpose:** view per-student and per-class performance
- **Key elements:** class performance summary, per-student drill-down, common struggle areas
- **Actions:** filter by class, by date range
- **Note:** superseded in scope by the Student Analytics Dashboard below, which the client doc specifies as the canonical teacher-facing analytics page — reconcile before both are built (see Q-07)

### Attainment Report
- **Purpose:** standard, printable, per-topic record of what was done, objectives, observations, and outcomes, structured against Bloom's taxonomy
- **Key elements:** auto-populated sections (what was done, objectives, observations, outcomes, what can be improved next time), Bloom's taxonomy labels against objectives, term-level roll-up across a class and subject
- **Actions:** export to PDF (school format), export a term's reports as a single document
- **Note:** teacher sees their own reports; school leadership sees all. If a topic was generated but never taught, the report must show that gap honestly rather than fabricate content.

### Student Analytics Dashboard
- **Purpose:** one page for the teacher to see a student's or a class's report in one place — the interactive counterpart to the Attainment Report
- **Key elements:** individual-student view, whole-class view, drawing on the same underlying data as the Attainment Report (generations, observations, grade results)
- **Actions:** switch between student and class view
- **Open question (Q-07):** exact contents are one line of spec in the client doc today and need to be nailed down before this can be estimated or built — do not assume it duplicates Teacher Analytics above without confirming

### Communication Hub
- **Purpose:** centralised teacher-to-parent, teacher-to-student, and teacher-to-class communication
- **Key elements:** automatic weekly parent update per child (assembled from that week's generations and assignment results), one-to-one teacher-to-student thread, teacher-to-class broadcast composer, retained message history
- **Actions:** send a message to a student, broadcast to a class, review/hold a pending weekly parent update before it sends
- **Edge case:** a week with no teaching activity must not produce an empty update; a parent with multiple children gets one update per child, never merged

## 4a. Unified App, Student Screens

**New section, 11 August 2026.** The client's AI Module Build Document specifies a functional Students Dashboard, which contradicts the "structural shell only" position elsewhere in these docs — see PRD Section 6.7. Screens below are speculative pending client sign-off on that scope change; do not build against them until confirmed.

### Student Home / Materials
- **Purpose:** access learning materials shared by the teacher
- **Key elements:** list of shared generations by topic
- **Actions:** open a material

### Student Assignments
- **Purpose:** view assigned assignments with due dates and status, complete and submit them
- **Key elements:** assignment list (due/overdue/submitted), per-question online answer input or photo upload, submission confirmation
- **Actions:** answer online, upload a photo, submit
- **Note:** a part-completed attempt must survive the browser closing or connection dropping, and be resumable — this is a mobile-browser flow, not a native app screen, per the client doc's acceptance criteria

### Student Results
- **Purpose:** view graded submissions and teacher feedback, once released
- **Key elements:** full history of past submissions, grade and feedback per submission
- **Actions:** review a past submission
- **Note:** grades are visible only after the teacher has released them (`grade.released_to_student`)

### Student Messages
- **Purpose:** reach out to the teacher
- **Key elements:** thread with the teacher, routed through the Communication Hub
- **Actions:** send a message

Phase 2, explicitly not in this build per the client doc: an AI Socratic chatbot to support the student through an assignment.

## 5. Admin and Leadership Dashboard

Card-based layout per Section 1.1, sidebar navigation, green accent on primary actions and highlights.

### Enrolment Funnel
- **Purpose:** leadership view of enquiry to admission conversion
- **Key elements:** funnel chart by stage, conversion rate, trend over time
- **Actions:** filter by date range, by source

### Enquiry Source Breakdown
- **Purpose:** volume of enquiries by channel
- **Key elements:** bar or pie chart by source, comparison to prior period

### Counsellor Performance
- **Purpose:** conversion rate and activity per counsellor
- **Key elements:** leaderboard or table, conversion rate, response time

### AI Usage Analytics
- **Purpose:** leadership visibility into AI Module adoption
- **Key elements:** generations per teacher, grading turnaround time, feature usage breakdown

### User and Role Management
- **Purpose:** manage staff accounts and their access
- **Key elements:** user list, role assignment, school or trust scope assignment
- **Actions:** invite user, change role, disable account

## 6. Notes for Implementation

- All screens inherit `school_id` scoping automatically from the logged-in user, no screen should allow selecting a different school unless the user is trust-scoped
- The Personalisation Review screen is the single place in the product where FR-AI-2 personalisation is applied, it must never be bypassed by any other flow
- **Contested, 11 August 2026:** the client's AI Module Build Document specifies a functional Students Dashboard (Section 4a above), which contradicts the "login and role-based home only" position this bullet previously stated as final. Get explicit sign-off before building Section 4a screens. Parent role remains receive-only (Communication Hub weekly update), no dedicated Parent screens are specified by either document.
- Screens should be built mobile-first for the Unified App, and desktop-first for the Admin Dashboard, consistent with expected usage patterns. The Students Dashboard is explicitly a mobile-browser flow per the client doc, not a native screen.
- Follow the Section 1.1 visual direction consistently, card-based layout, single accent colour, rounded corners, light background, across every Admin Dashboard screen
- Teacher Analytics (Section 4) and the Student Analytics Dashboard (Section 4) overlap in purpose and are not yet reconciled — see PRD Q-07. Do not build both without confirming they're distinct.

---
*End of document. Fovea Infotech. Confidential.*
