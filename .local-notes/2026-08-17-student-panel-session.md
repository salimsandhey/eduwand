# Student panel session — handoff notes (2026-08-17)

Local notes only, gitignored (`.local-notes/`) — not part of the repo history.
Written because the local `main` was 3 commits / 171 files behind `origin/main`
when this session started, and the work below was done against the stale
version before that was discovered.

## What happened

Asked to start on student login + student screens. Built a password-based
student login before realizing the local repo was behind `origin/main`, which
already has a full, more sophisticated student panel (OTP-based). **The work
below is superseded and should NOT be reapplied as-is** — it's kept here only
as a decision log and in case a specific piece turns out to still be useful
after reviewing what's actually on GitHub.

## Discovery: origin/main already has this, built differently

`git log HEAD..origin/main --oneline` (before pulling):
```
096c7df ui improved
151d2ff changes made
707d7f7 Fixes UI in admin panel
```

Files on `origin/main` relevant to student panel (does NOT exist locally yet
as of this session):
- `backend/prisma/migrations/20260812134522_student_otp_login/` — **OTP-based**
  student login, not password-based
- `backend/prisma/migrations/20260812140333_password_reset/`
- `backend/prisma/migrations/20260812165215_audit_log/`
- `backend/src/routes/student-auth.ts` — dedicated student auth endpoints
- `backend/src/routes/student-portal.ts` — dedicated student-facing API
- `unified-app/src/screens/auth/StudentLoginScreen.tsx`
- `unified-app/src/screens/auth/NoAccessScreen.tsx` (moved from screens/)
- `unified-app/src/navigation/StudentTabNavigator.tsx`
- `unified-app/src/screens/student/StudentHomeScreen.tsx`
- `unified-app/src/screens/student/StudentResultsScreen.tsx`
- `unified-app/src/screens/student/StudentMaterialsScreen.tsx`
- `unified-app/src/screens/student/StudentMessagesScreen.tsx`
- `unified-app/src/screens/student/StudentAssignmentSubmitScreen.tsx`

Plus a large unrelated wave: admin-dashboard audit log / exports / message
templates pages, a full `unified-app/src/screens/` reorg into subfolders
(auth/, enrolment/, student/, studio/, assignments/, analytics/, shared/),
new brand/decorative image assets, `unified-app/metro.config.js`,
`FloatingTabBar.tsx`, avatar system (`theme/avatars.ts`), and doc updates to
all four `docs/Dev/EduWand_*.md` files (worth re-reading after pull — the PRD
"student = structural shell only" framing may itself be updated upstream).

## Action items after pulling origin/main

1. **Reset local dev DB** — I ran `prisma migrate deploy` locally against a
   migration (`20260817090000_add_student_login_link`, see below) that will
   no longer exist in the pulled codebase. After discarding + pulling, run
   `npx prisma migrate reset` in `backend/` (drops + recreates the local dev
   DB from the real migration history, then runs seed) rather than trying to
   reconcile the stray `app_user_id` column by hand. Local dev DB only, no
   real data at stake.
2. **`npm install`** in `unified-app/` (and root) — `package.json` and
   `package-lock.json` both changed upstream (new deps for the reorg /
   avatar system / metro config).
3. **Check `.env.example` files** for new required vars — OTP login likely
   needs an SMS/email-sending config that didn't exist before (worth diffing
   `backend/.env.example` after pull against what's in `backend/.env` now).
4. **Read the actual upstream implementation** (`student-auth.ts`,
   `student-portal.ts`, `StudentLoginScreen.tsx`, `StudentTabNavigator.tsx`,
   the four student screens) before assuming anything else is missing —
   my earlier claim that "students only get login + a shell screen" was
   based on the stale docs; the upstream `docs/Dev/*` diffs above suggest
   that scope may have already been expanded and documented properly.

## Unresolved: EAS project ID conflict

Uncommitted `unified-app/app.json` (before this session, not something I
created) pointed at a different EAS project than `origin/main`:

| | projectId | owner |
|---|---|---|
| local uncommitted (pre-session) | `b2e11536-be41-43d0-8a1a-67def649ffa3` | `salimtype1` |
| `origin/main` | `74df1a69-be7b-4ab8-a55e-d12357e211a8` | `salimsandhey` |

Not resolved before this note was written. **Ask the user which is correct**
before running any `eas build` — if the local one was deliberately created
(e.g. via `eas init` on this machine) and no build has been pushed to it yet,
either can safely be dropped; if a build already exists under one project,
that one should win.

## My changes, for reference only (superseded, do not reapply blindly)

All against the pre-pull `main` (commit `db00a37`).

**`backend/prisma/schema.prisma`**
- Added `StudentStub.appUserId` (nullable, unique) + relation to `AppUser`,
  and the reverse `AppUser.studentStub` relation. Migration:
  `backend/prisma/migrations/20260817090000_add_student_login_link/migration.sql`
  (untracked — delete this folder before pulling, it's not part of any
  commit and its name will collide conceptually with upstream's own
  `20260812134522_student_otp_login`).
- Updated the `AppUser.role` comment to list `student` and `platform_admin`.

**`backend/src/routes/students.ts`**
- New `POST /api/v1/students/:id/create-login` — admin/leadership only,
  takes `{ email }`, generates a temp password (bcrypt), creates an
  `AppUser` with `role: "student"`, links `StudentStub.appUserId`. Blocks
  double-creation and duplicate emails. This is the password-based
  equivalent of whatever `student-auth.ts` does with OTP upstream — read
  that file first, this probably has no reason to exist once it's pulled in.

**`backend/src/routes/users.ts`**
- Exported the previously-private `generateTempPassword()` helper so
  `students.ts` could reuse it. Harmless either way, but only needed if the
  `create-login` endpoint above is kept.

**`backend/prisma/seed.ts`**
- Seeded a demo admitted student ("Aarav Mehta", enquiry +
  student_stub) and a demo student login `student@dev.eduwand.local` /
  `password123`, linked via `appUserId`. Upstream's OTP seed
  (`20260812134522_student_otp_login` era) almost certainly seeds its own
  demo student differently — check `backend/prisma/seed.ts` post-pull before
  assuming this is still needed.

**`unified-app/src/screens/LoginScreen.tsx`**
- Added a "Student" entry to the dev quick-login list
  (`student@dev.eduwand.local`). Moot once pulled — upstream has a separate
  `screens/auth/StudentLoginScreen.tsx`, i.e. students don't even use the
  same login screen as staff anymore.

**`unified-app/src/screens/NoAccessScreen.tsx`**
- Fixed the shell screen's title/icon to not say "Use the Admin Dashboard"
  for student/parent roles (was showing an admin-oriented message to
  students). Moot once pulled — this file moved to `screens/auth/` upstream
  and role routing for `student` now goes to a real `StudentTabNavigator`,
  not this fallback screen at all.

## Verification performed this session (against local DB, pre-pull code)

Confirmed the create-login endpoint + seeded login worked end-to-end against
the local Postgres DB (not the remote deploy): login as
`student@dev.eduwand.local`, `/auth/me` returned the right role/identity,
`admin`-issued `create-login` on a freshly admitted student worked, a
`teacher` calling `create-login` got 403, and a second `create-login` call on
an already-linked student got a clean 400. Test rows were cleaned up after.
Not relevant test coverage once superseded, but confirms the *pattern*
(temp-password issuance, single-use link, role-scoped guard) works if ever
needed elsewhere (e.g. as a possible fallback path in the real
`student-auth.ts` for guardians without a phone for OTP — worth checking
whether upstream already handles that case).

## Also discovered, still true after any of the above

The `unified-app/.env` (not `.env.example`) points
`EXPO_PUBLIC_API_URL` at a **remote deployed backend**
(`http://fth8wqzdw0tubzmuqc15a1ps.187.127.187.181.sslip.io/api/v1`), not
`localhost:4000`. That remote backend currently 404s on *every* route
(root, health, login) with Go's stdlib default 404 text
(`404 page not found`) — a reverse-proxy/deployment issue, not an app bug.
No backend `Dockerfile` exists in the repo (unlike `admin-dashboard/`), so
it's unclear how the backend is meant to deploy there. This is unrelated to
the student-panel/OTP work and still needs sorting separately — mobile app
testing against the real backend won't work until it does. Local dev
(`npm run dev` in `backend/`) works fine and is what all verification above
used.
