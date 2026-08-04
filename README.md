# EduWand

Monorepo for the EduWand platform (Enrolment Growth Engine + AI Module), built by Fovea Infotech for LessonForge.

Reference docs: [Docs/Dev](Docs/Dev)

## Structure

- `backend/` — Fastify + TypeScript API, Prisma + PostgreSQL. See [Docs/Dev/EduWand_API_Specification.md](Docs/Dev/EduWand_API_Specification.md) and [Docs/Dev/EduWand_Database_Schema.md](Docs/Dev/EduWand_Database_Schema.md).
- `admin-dashboard/` — React web app for School Leadership/Admin. Not yet scaffolded.
- `unified-app/` — React Native app for Front Desk, Counsellor, and Teacher roles. Not yet scaffolded.

## Status

Build proceeds module by module. Current stage: initial repo/backend setup only — no feature modules built yet.

## Backend, local dev

```
cd backend
cp .env.example .env   # point DATABASE_URL at a local Postgres instance
npm run dev
```
