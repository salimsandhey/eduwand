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

### Lesson Studio
- **Purpose:** generate a lesson plan or research report
- **Key elements:** topic input, board and class selector, format selector, generated content viewer
- **Actions:** generate, edit, save to classroom database

### Assignment Lab, Create Assignment
- **Purpose:** build a new assignment, optionally with personalisation
- **Key elements:** title, class selector, question set, personalisation toggle
- **Actions:** save as draft, publish

### Assignment Lab, Personalisation Review
- **Purpose:** review and approve the system's suggested difficulty mix per student, before it is applied
- **Key elements:** per-student suggested mix, reasoning summary, approve, override, and opt-out controls
- **Actions:** approve individually, approve all, override a specific student, opt a student out
- **Note:** no personalisation is applied to a student without an explicit action on this screen

### Grading Review
- **Purpose:** review AI-generated grades and feedback before or after release to students
- **Key elements:** submission list, AI score and feedback per submission, flagged-for-attention indicator
- **Actions:** accept AI grade, override score, edit feedback, release grades

### Teacher Analytics
- **Purpose:** view per-student and per-class performance
- **Key elements:** class performance summary, per-student drill-down, common struggle areas
- **Actions:** filter by class, by date range

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
- Student and Parent roles have login and a role-based home screen only in this build phase, no further screens are built for them yet
- Screens should be built mobile-first for the Unified App, and desktop-first for the Admin Dashboard, consistent with expected usage patterns
- Follow the Section 1.1 visual direction consistently, card-based layout, single accent colour, rounded corners, light background, across every Admin Dashboard screen

---
*End of document. Fovea Infotech. Confidential.*
