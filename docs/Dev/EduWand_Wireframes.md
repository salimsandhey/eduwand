# EduWand Platform — ASCII Wireframes
Low-fidelity layout sketches for every screen in [EduWand_UI_Screen_Spec.md](EduWand_UI_Screen_Spec.md).
Unified App sketches are mobile-first (narrow column). Admin Dashboard sketches are desktop-first (sidebar + cards).

---

## 1. Unified App — Shared Screens

### 1.1 Login
```
┌──────────────────────────────┐
│                               │
│           [ LOGO ]           │
│         EduWand               │
│                               │
│  Email or phone               │
│  ┌─────────────────────────┐  │
│  │                         │  │
│  └─────────────────────────┘  │
│                               │
│  Password / OTP                │
│  ┌─────────────────────────┐  │
│  │                         │  │
│  └─────────────────────────┘  │
│                               │
│  Forgot password?              │
│                               │
│  ┌─────────────────────────┐  │
│  │        LOG IN           │  │
│  └─────────────────────────┘  │
│                               │
└──────────────────────────────┘
```

### 1.2 Role-Based Home
```
┌──────────────────────────────┐
│ ☰  EduWand            🔔 (3) │
├──────────────────────────────┤
│                               │
│  Front desk / Counsellor:      │
│  ┌─────────────────────────┐  │
│  │  Enquiry List            │  │
│  │  12 new today →          │  │
│  └─────────────────────────┘  │
│  ┌─────────────────────────┐  │
│  │  Pipeline Board          │  │
│  │  38 active →             │  │
│  └─────────────────────────┘  │
│                               │
│  — or, Teacher: —              │
│  ┌─────────────────────────┐  │
│  │  Lesson Studio →         │  │
│  └─────────────────────────┘  │
│  ┌─────────────────────────┐  │
│  │  Assignment Lab →        │  │
│  └─────────────────────────┘  │
│                               │
├──────────────────────────────┤
│ [Home] [List] [Board] [More]  │  <- bottom tab nav
└──────────────────────────────┘
```

---

## 2. Unified App — Front Desk / Counsellor Screens

### 2.1 Enquiry List
```
┌──────────────────────────────┐
│ ← Enquiries              + Add│
├──────────────────────────────┤
│ 🔍 Search enquiries...        │
│ [Status ▾][Source ▾][Owner ▾] │
├──────────────────────────────┤
│ ● Aarav Sharma        New     │
│   Grade 5 · Website · 2h ago  │
├──────────────────────────────┤
│ ● Meera Iyer      Contacted   │
│   Grade 8 · Referral · 1d ago │
├──────────────────────────────┤
│ ● Kabir Khan          Visit   │
│   Grade 3 · Walk-in · 2d ago  │
├──────────────────────────────┤
│           ...more             │
├──────────────────────────────┤
│  [ Bulk Upload ]               │
└──────────────────────────────┘
```

### 2.2 New Enquiry Form
```
┌──────────────────────────────┐
│ ← New Enquiry                 │
├──────────────────────────────┤
│ Contact name                  │
│ ┌───────────────────────────┐ │
│ └───────────────────────────┘ │
│ Phone                          │
│ ┌───────────────────────────┐ │
│ └───────────────────────────┘ │
│ Email                          │
│ ┌───────────────────────────┐ │
│ └───────────────────────────┘ │
│ Source        [ Dropdown ▾ ]   │
│ Grade/Board   [ Dropdown ▾ ]   │
│ Notes                          │
│ ┌───────────────────────────┐ │
│ │                           │ │
│ └───────────────────────────┘ │
│                               │
│ ┌────────────┐ ┌────────────┐ │
│ │Save & Me    │ │Assign to.. │ │
│ └────────────┘ └────────────┘ │
└──────────────────────────────┘
```

### 2.3 Enquiry Detail
```
┌──────────────────────────────┐
│ ← Aarav Sharma          ⋮     │
├──────────────────────────────┤
│ ⚠ Possible duplicate found     │  <- banner, conditional
├──────────────────────────────┤
│ Phone: 98xxxxxxx  Email: ...  │
│ Grade 5 · Website              │
├──────────────────────────────┤
│ New → Contacted → Visit →      │
│ Application → Admitted →       │
│ Enrolled                       │
│        [Change Stage ▾]        │
├──────────────────────────────┤
│ Stage History                  │
│ • New — 8 Aug, 10:03            │
│ • Contacted — 8 Aug, 14:20      │
├──────────────────────────────┤
│ Notes                          │
│ [ + Add note ]                 │
├──────────────────────────────┤
│ Follow-up Tasks                │
│ ☐ Call back — tomorrow          │
│ [ + Add follow up ]             │
├──────────────────────────────┤
│ [ Merge Duplicate ] [Confirm    │
│                      Admission] │
└──────────────────────────────┘
```

### 2.4 Admissions Pipeline Board
```
┌──────────────────────────────────────────────────────────┐
│ ← Pipeline Board                                    + Add │
├──────┬──────────┬───────┬────────────┬─────────┬─────────┤
│ New  │Contacted │ Visit │Application │ Admitted│ Enrolled│
├──────┼──────────┼───────┼────────────┼─────────┼─────────┤
│┌────┐│┌────────┐│┌─────┐│┌──────────┐│┌───────┐│┌───────┐│
││Aarav││Meera    │││Kabir││ Priya     │││ Zara  │││ Dev   ││
││ 5   ││ 8       │││ 3   ││ 6         │││ 4     │││ 7     ││
│└────┘│└────────┘│└─────┘│└──────────┘│└───────┘│└───────┘│
│┌────┐│          │       │            │         │         │
││... ││          │       │            │         │         │
│└────┘│          │       │            │         │         │
└──────┴──────────┴───────┴────────────┴─────────┴─────────┘
        (cards drag left/right between columns; tap opens detail)
```
*(Mobile: columns become horizontally swipeable instead of side-by-side.)*

### 2.5 Follow Up Task List
```
┌──────────────────────────────┐
│ ← Tasks                       │
├──────────────────────────────┤
│ OVERDUE (2)                    │
│ ☐ Call Kabir Khan  — linked ↗  │
│ ☐ Send brochure — linked ↗     │
├──────────────────────────────┤
│ DUE TODAY (4)                  │
│ ☐ Follow up Meera — linked ↗   │
│ ☐ Confirm visit — linked ↗     │
├──────────────────────────────┤
│ UPCOMING                       │
│ ☐ Check in — Fri — linked ↗    │
├──────────────────────────────┤
│ [Complete] [Message] [Reschedule]│  <- per-row swipe actions
└──────────────────────────────┘
```

### 2.6 Admission Confirmation
```
┌──────────────────────────────┐
│ ← Confirm Admission            │
├──────────────────────────────┤
│ Student Details                │
│ Name  ┌─────────────────────┐  │
│       └─────────────────────┘  │
│ DOB   ┌─────────────────────┐  │
│       └─────────────────────┘  │
├──────────────────────────────┤
│ Guardian Details                │
│ Name  ┌─────────────────────┐  │
│ Phone ┌─────────────────────┐  │
├──────────────────────────────┤
│ Class / Section  [ Dropdown ▾]  │
├──────────────────────────────┤
│ ┌───────────────────────────┐  │
│ │     Confirm Admission     │  │
│ └───────────────────────────┘  │
└──────────────────────────────┘
```

### 2.7 CSV Export
```
┌──────────────────────────────┐
│ ← Export Admitted Students     │
├──────────────────────────────┤
│ Date range                     │
│ [ From ▾ ]   [ To ▾ ]          │
│ ┌───────────────────────────┐  │
│ │      Run Export Now       │  │
│ └───────────────────────────┘  │
├──────────────────────────────┤
│ Run History                    │
│ 8 Aug 2026, 10:00  [Download]  │
│ 1 Aug 2026, 09:12  [Download]  │
│ 25 Jul 2026, 09:00 [Download]  │
├──────────────────────────────┤
│ [ View full export log ]        │
└──────────────────────────────┘
```

---

## 3. Unified App — Teacher Screens

### 3.1 Lesson Studio
```
┌──────────────────────────────┐
│ ← Lesson Studio                │
├──────────────────────────────┤
│ Topic                          │
│ ┌───────────────────────────┐  │
│ └───────────────────────────┘  │
│ Board [▾]   Class [▾]          │
│ Format [ Lesson Plan / Report ▾]│
│ ┌───────────────────────────┐  │
│ │        Generate           │  │
│ └───────────────────────────┘  │
├──────────────────────────────┤
│ Generated Content               │
│ ┌───────────────────────────┐  │
│ │  1. Introduction (5 min)  │  │
│ │  2. Core concept...       │  │
│ │  ...                      │  │
│ └───────────────────────────┘  │
│ [ Edit ]   [ Save to Classroom ]│
└──────────────────────────────┘
```

### 3.2 Assignment Lab — Create Assignment
```
┌──────────────────────────────┐
│ ← New Assignment               │
├──────────────────────────────┤
│ Title  ┌────────────────────┐  │
│        └────────────────────┘  │
│ Class  [ Dropdown ▾ ]          │
├──────────────────────────────┤
│ Question Set                   │
│ 1. ...                    [x]  │
│ 2. ...                    [x]  │
│ [ + Add Question ]              │
├──────────────────────────────┤
│ Personalise per student  ( ⭘ ) │  <- toggle
├──────────────────────────────┤
│ [ Save Draft ]   [ Publish ]    │
└──────────────────────────────┘
```

### 3.3 Assignment Lab — Personalisation Review
```
┌──────────────────────────────┐
│ ← Personalisation Review       │
├──────────────────────────────┤
│ Student: Aarav Sharma           │
│ Suggested mix: Easy 40% /       │
│  Medium 40% / Hard 20%          │
│ Reason: recent quiz scores 62%  │
│ [Approve] [Override] [Opt-out]  │
├──────────────────────────────┤
│ Student: Meera Iyer              │
│ Suggested mix: Easy 20% /        │
│  Medium 50% / Hard 30%           │
│ Reason: consistent high scores   │
│ [Approve] [Override] [Opt-out]   │
├──────────────────────────────┤
│           ...more students       │
├──────────────────────────────┤
│ ┌───────────────────────────┐   │
│ │      Approve All           │   │
│ └───────────────────────────┘   │
└──────────────────────────────┘
```

### 3.4 Grading Review
```
┌──────────────────────────────┐
│ ← Grading Review — Quiz 3      │
├──────────────────────────────┤
│ ⚑ Aarav Sharma      AI: 7/10   │
│   Feedback: "Good structure,   │
│    missed step 3"              │
│   [Accept] [Override] [Edit]   │
├──────────────────────────────┤
│   Meera Iyer         AI: 9/10  │
│   Feedback: "..."               │
│   [Accept] [Override] [Edit]   │
├──────────────────────────────┤
│           ...more                │
├──────────────────────────────┤
│ ┌───────────────────────────┐   │
│ │      Release Grades        │   │
│ └───────────────────────────┘   │
└──────────────────────────────┘
```
`⚑` = flagged-for-attention indicator

### 3.5 Teacher Analytics
```
┌──────────────────────────────┐
│ ← Analytics                    │
├──────────────────────────────┤
│ Class [ 8-A ▾ ]  Date [ ▾ ]     │
├──────────────────────────────┤
│ Class Performance               │
│ ┌───────────────────────────┐  │
│ │   ▁▃▅▇▆▄▂  avg 74%        │  │
│ └───────────────────────────┘  │
├──────────────────────────────┤
│ Per-Student Drill-down          │
│ Aarav   74% →                  │
│ Meera   88% →                  │
│ Kabir   61% →                  │
├──────────────────────────────┤
│ Common Struggle Areas            │
│ • Fractions (12 students)        │
│ • Grammar tenses (8 students)    │
└──────────────────────────────┘
```

---

## 4. Admin & Leadership Dashboard
Desktop-first: fixed left sidebar, top bar, card-based main area, single green accent (per Section 1.1 of the spec).

### 4.0 Shared Shell
```
┌────────────┬──────────────────────────────────────────────┐
│  EduWand   │  🔍 Search...                     👤 Admin ▾ │
│            ├──────────────────────────────────────────────┤
│ ▸ Overview │                                                │
│ ▸ Funnel   │   [ main content area — cards below ]         │
│ ▸ Sources  │                                                │
│ ▸ Counsel. │                                                │
│ ▸ AI Usage │                                                │
│ ▸ Users    │                                                │
│            │                                                │
└────────────┴──────────────────────────────────────────────┘
```

### 4.1 Enrolment Funnel
```
┌────────────┬──────────────────────────────────────────────┐
│  EduWand   │  Enrolment Funnel        [Date ▾] [Source ▾] │
│ ▸ Funnel*  ├──────────────────────────────────────────────┤
│ ▸ Sources  │ ┌──────────────┐ ┌──────────────┐             │
│ ▸ Counsel. │ │ New:   420   │ │ Conversion:   │             │
│ ▸ AI Usage │ │ ██████████   │ │    18%        │             │
│ ▸ Users    │ └──────────────┘ └──────────────┘             │
│            │ ┌────────────────────────────────────────┐    │
│            │ │        FUNNEL CHART                     │    │
│            │ │ New        ████████████████ 420         │    │
│            │ │ Contacted  ████████████ 310              │    │
│            │ │ Visit      ██████ 180                    │    │
│            │ │ Application███ 95                        │    │
│            │ │ Admitted   ██ 76                          │    │
│            │ └────────────────────────────────────────┘    │
│            │ ┌────────────────────────────────────────┐    │
│            │ │   Trend over time (line chart)          │    │
│            │ └────────────────────────────────────────┘    │
└────────────┴──────────────────────────────────────────────┘
```

### 4.2 Enquiry Source Breakdown
```
┌────────────┬──────────────────────────────────────────────┐
│  EduWand   │  Enquiry Sources                              │
│ ▸ Sources* ├──────────────────────────────────────────────┤
│            │ ┌───────────────────┐ ┌──────────────────┐    │
│            │ │  PIE / BAR CHART   │ │ vs Prior Period   │    │
│            │ │  Website  45%      │ │ Website  ▲ 12%    │    │
│            │ │  Referral 30%      │ │ Referral ▼ 4%     │    │
│            │ │  Walk-in  15%      │ │ Walk-in  ▲ 2%     │    │
│            │ │  Other    10%      │ │ Other    ▬ 0%     │    │
│            │ └───────────────────┘ └──────────────────┘    │
└────────────┴──────────────────────────────────────────────┘
```

### 4.3 Counsellor Performance
```
┌────────────┬──────────────────────────────────────────────┐
│  EduWand   │  Counsellor Performance                       │
│ ▸ Counsel.*├──────────────────────────────────────────────┤
│            │ ┌──────────────────────────────────────────┐ │
│            │ │ Name     Conversion   Response Time   Rank│ │
│            │ │ Priya    24%          12 min          #1  │ │
│            │ │ Rohan    19%          25 min          #2  │ │
│            │ │ Sana     15%          40 min          #3  │ │
│            │ └──────────────────────────────────────────┘ │
└────────────┴──────────────────────────────────────────────┘
```

### 4.4 AI Usage Analytics
```
┌────────────┬──────────────────────────────────────────────┐
│  EduWand   │  AI Usage Analytics                            │
│ ▸ AI Usage*├──────────────────────────────────────────────┤
│            │ ┌──────────────┐ ┌──────────────┐             │
│            │ │ Generations/ │ │ Grading      │             │
│            │ │ Teacher: 8.4 │ │ Turnaround:  │             │
│            │ │              │ │ 3.2 hrs      │             │
│            │ └──────────────┘ └──────────────┘             │
│            │ ┌────────────────────────────────────────┐    │
│            │ │ Feature Usage Breakdown (bar chart)     │    │
│            │ │ Lesson Studio   ████████ 320             │    │
│            │ │ Assignment Lab  █████ 190                │    │
│            │ │ Grading Review  ███████ 260               │    │
│            │ └────────────────────────────────────────┘    │
└────────────┴──────────────────────────────────────────────┘
```

### 4.5 User and Role Management
```
┌────────────┬──────────────────────────────────────────────┐
│  EduWand   │  Users & Roles                    [+ Invite]  │
│ ▸ Users*   ├──────────────────────────────────────────────┤
│            │ ┌──────────────────────────────────────────┐ │
│            │ │ Name      Role         Scope      Status  │ │
│            │ │ Priya S.  Counsellor   School A   Active   │ │
│            │ │           [Change Role ▾] [Disable]        │ │
│            │ │ Rohan K.  Teacher      School A   Active   │ │
│            │ │           [Change Role ▾] [Disable]        │ │
│            │ │ Sana T.   Trust Admin  Trust X    Active   │ │
│            │ │           [Change Role ▾] [Disable]        │ │
│            │ └──────────────────────────────────────────┘ │
└────────────┴──────────────────────────────────────────────┘
```

---

## 5. Notes carried over from the screen spec
- All screens inherit `school_id` scoping; no school switcher unless trust-scoped.
- Personalisation Review is the only place FR-AI-2 personalisation is applied — never bypass it.
- Student/Parent roles: login + role-based home only, no further screens this phase.
- Unified App = mobile-first; Admin Dashboard = desktop-first.
- Admin Dashboard: card-based, rounded corners, light background, single green accent throughout.
