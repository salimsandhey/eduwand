# EduWand Admin Dashboard — Testing Guide

Step-by-step walkthrough for testing the Admin Dashboard (`admin-dashboard/`,
served at `http://localhost:5179`) across all three roles that use it:
`platform_admin`, `leadership`, and `admin`. Follow the parts in order —
Platform Admin creates the trust/school data that Leadership and Admin depend
on.

---

## 0. Prerequisites

### Services that must be running

| Service | Command (from repo root) | URL |
|---|---|---|
| Backend API | `cd backend && npm run dev` | http://localhost:4000/api/v1 |
| Background worker | `cd backend && npm run worker` | (no UI — powers auto follow-ups/exports) |
| Admin Dashboard | `cd admin-dashboard && npm run dev` | http://localhost:5179 |
| Unified App (mobile) | `cd unified-app && npm start` | http://localhost:8081 (Metro) |

Check they're up:

```bash
curl http://localhost:4000/api/v1/health   # {"data":{"status":"ok"}}
curl -o /dev/null -w "%{http_code}\n" http://localhost:5179/   # 200
```

If the database has never been seeded, run once from `backend/`:

```bash
npm run prisma:migrate
npm run prisma:seed
```

### Test accounts (all password `password123`)

| Email | Role | Scope |
|---|---|---|
| `platform@eduwand.local` | `platform_admin` | Whole platform, no trust/school |
| `leadership@dev.eduwand.local` | `leadership` | Dev Trust (2 schools: Dev School, Dev School 2) |
| `admin@dev.eduwand.local` | `admin` | Dev School only |
| `admin2@dev.eduwand.local` | `admin` | Dev School 2 only |

The login page (http://localhost:5179) has **dev quick-fill buttons** for these
four — click one, then click **Log in** (password fills automatically). The
other seeded accounts (`counsellor@`, `frontdesk@`, `teacher@`) are mobile-only
and can't log into the Admin Dashboard.

---

## Part 1 — Platform Admin (`platform@eduwand.local`)

Do this part first: it creates the trust and school that Parts 2 and 3 use.

### 1.1 Overview
1. Log in. You land on **Overview**.
2. Check: stat tiles for **Trusts** and **Schools** counts, a table listing
   existing trusts (should show "Dev Trust" from the seed).

### 1.2 Onboard a new trust + school
1. Click **Onboarding** in the sidebar.
2. Under "1. Create a trust", enter a name (e.g. `Test Trust A`) → **Create trust**.
   - Check: a success message appears with a link to view it.
3. Under "2. Add a school", the trust you just created should be pre-selected
   in the dropdown. Enter a school name (e.g. `Test School A`), pick a board →
   **Add school**.
   - Check: success message with a link to the school.
4. Under "3. Invite the school's first admin", enter a name + email (any
   fake email, e.g. `admin@testschoola.local`) → **Invite admin**.
   - Check: a temporary password is shown on screen — **copy it**, you'll use
     it to log in as this new admin later if you want to test a completely
     fresh school with zero data.

### 1.3 Trusts list and detail
1. Click **Trusts** in the sidebar.
2. Check: your new trust appears in the list alongside "Dev Trust".
3. Click **View →** on "Dev Trust".
4. Check: trust details (name, contact email, status) are editable; the
   "Schools" table lists Dev School and Dev School 2 with **View →** links.
5. Click into "Dev School" → check school details are editable (name, board,
   address) and status can be changed (active/suspended/onboarding).

**Expected result for Part 1:** you can create a trust and school from nothing,
invite its first admin, and browse the full trust/school hierarchy.

---

## Part 2 — Trust Leadership (`leadership@dev.eduwand.local`)

### 2.1 Overview
1. Log in. You land on **Overview**, showing "Dev Trust" with a table of its
   schools (Dev School, Dev School 2) and stat tiles for school counts.
2. Click **View data →** on "Dev School" — this should jump you to the Funnel
   page with Dev School already selected in the topbar switcher.

### 2.2 The school switcher (this is the main thing to verify for this role)
1. Look at the top bar — you should see a **"Viewing"** dropdown showing
   "Dev School" (leadership has no single school, so this switcher is what
   scopes every page below).
2. Switch it to "Dev School 2" and confirm the page you're on reloads with
   different (likely emptier) numbers.
3. Switch back to "Dev School".

### 2.3 Walk every nav item
With "Dev School" selected in the switcher, click through each of these and
confirm **no 403 or warning box appears** — every one of these was broken for
leadership before the Module 1 fixes, so this is the actual regression check:

- **Enrolment Funnel** — funnel bars + the "Enrolment Trend" line chart below
- **Source Breakdown** — bar chart by source
- **Counsellor Performance** — table with conversion rate + avg. response time
- **User & Role Management** — staff list for Dev School
- **Pipeline Stages** — the 7 default stages (new/contacted/.../lost)

### 2.4 Onboarding (trust-scoped)
1. Click **Onboarding**.
2. Notice there's no "Create a trust" step (leadership can't create trusts,
   only platform_admin can) — you go straight to "Add a school to your trust".
3. Add a school → check it appears under your trust without needing to pick a
   trust from a dropdown (it's forced to your own trust).

**Expected result for Part 2:** every school-scoped page works once a school
is selected in the switcher, and switching schools changes the data shown.

---

## Part 3 — School Admin (`admin@dev.eduwand.local`)

This role has the most real data to look at, since Dev School accumulated
enquiries, students, and AI usage during earlier testing — if you're on a
freshly seeded database instead, see **Appendix A** to seed a few records
first so these pages aren't empty.

### 3.1 Overview
1. Log in. You land on **Overview**: total enquiries, conversion rate, active
   staff, a funnel snapshot chart, and a "Top counsellor" callout.

### 3.2 Enrolment Funnel
1. Click **Enrolment Funnel**.
2. Check: stat tiles (total enquiries, converted, conversion rate), the funnel
   bar chart, and the **Enrolment Trend (last 12 months)** line chart below it
   — hover over the line chart to confirm the tooltip + crosshair work.
3. Try the date range filters (Start date / End date) and **Clear Filters**.

### 3.3 Source Breakdown
1. Click **Source Breakdown**.
2. Check: bar chart by source (phone/website/walk_in/referral/event/social).
3. Set a date range on both start and end — a "vs previous period" stat tile
   should appear, comparing to the prior period of equal length.

### 3.4 Counsellor Performance
1. Click **Counsellor Performance**.
2. Check: a ranked table (conversion rate highest first) with an **Avg.
   response time** column — this should show real hour values (or "—" for
   counsellors who haven't responded to anything yet).

### 3.5 Pipeline Stages
1. Click **Pipeline Stages**.
2. Check: the 7 default stages, in order.
3. Add a new stage (e.g. key `waitlist`, label `Waitlist`) → **Add stage**.
4. Reorder it with the ↑ button, rename it by editing the label field and
   clicking away, and toggle its "Terminal" or "Counts as converted" checkbox.
5. Go back to **Enrolment Funnel** — your new stage should now appear as a bar
   there too (proves the pipeline is genuinely dynamic, not hardcoded).

### 3.6 User & Role Management
1. Click **User & Role Management**.
2. Check: staff list with role/status; use the search box to filter by name.
3. Click **Invite user**, fill in a name/email, pick a role → **Send invite**.
   - Check: a temporary password is displayed (there's no email delivery yet
     in this build — the message on screen says so).
4. On any non-self row, click **Change role** and pick a different role, then
   click **Disable** / **Enable** to toggle status.

### 3.7 AI Usage Analytics
1. Click **AI Usage Analytics**.
2. Check: **Total generations** and **Avg. grading turnaround** stat tiles,
   plus **Generations per teacher** and **Feature usage breakdown** bar
   charts. If these are all empty/zero, see **Appendix A.3** to generate some
   AI activity from the mobile app first.

**Expected result for Part 3:** every analytics page shows real numbers (not
placeholders), Pipeline Stages changes are reflected live in Funnel, and user
management round-trips correctly.

---

## Appendix A — Seeding test data if a page looks empty

Analytics pages only show real numbers once there's underlying data. If
you're testing against a freshly seeded database, do this first (fastest via
the mobile app; curl equivalents given for each).

### A.1 Create an enquiry (feeds Funnel / Source Breakdown / Counsellor Performance)

**Mobile app:** log in as `frontdesk@dev.eduwand.local`, go to **Enquiries →
+**, fill in a name/phone/source, save.

**Or via curl** (as `admin@dev.eduwand.local`):
```bash
TOKEN=$(curl -s -X POST http://localhost:4000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@dev.eduwand.local","password":"password123"}' \
  | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).data.accessToken))")

curl -s -X POST http://localhost:4000/api/v1/enquiries \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"contactName":"Test Parent","contactPhone":"9000000001","source":"phone"}'
```

### A.2 Admit a student (needed before Assignment Lab / AI features can target a class)

**Mobile app:** open the enquiry → move its stage to **application** or later
→ tap **Confirm admission** → fill in the form (pick the seeded "Grade 5 A"
class section) → confirm.

### A.3 Generate some AI usage (feeds AI Usage Analytics on the Admin Dashboard)

**Mobile app**, logged in as `teacher@dev.eduwand.local`:
1. **Studio** tab → enter a topic, pick a board → **Generate** (writes a
   `lesson_plan` usage log).
2. **Assignment** tab → **+** → create an assignment for "Grade 5 A" with
   personalisation on → **Publish** (writes a `personalisation_suggestion`
   usage log per student in the class).
3. On the assignment's detail screen → **Log a submission** for a student →
   fill in answers → save. Then open **Grading Review** → **Grade with AI**
   (writes a `grading` usage log).

Refresh **AI Usage Analytics** on the Admin Dashboard afterward — the numbers
should update immediately (no caching).

---

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| Login page won't submit / "Failed to fetch" | Backend isn't running on :4000 |
| Leadership sees a "no schools" warning box on every page | The school switcher hasn't loaded yet, or the trust genuinely has 0 schools — check Onboarding |
| A page 403s with `school_selection_required` | You're logged in as leadership and haven't picked a school in the topbar switcher yet |
| AI Usage Analytics is all zeros | No AI generations have happened yet for this school — see Appendix A.3 |
| Scheduled export / automated follow-up doesn't seem to fire | The **worker** process (`npm run worker`) isn't running — it's separate from the API server |
