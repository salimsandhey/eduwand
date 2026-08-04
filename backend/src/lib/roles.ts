// app_user.role is stored as free text (see prisma/schema.prisma), enforced here in
// application code. platform_admin is a new role for this onboarding sub-module: an
// internal EduWand/Fovea ops account, not tied to any trust or school, that can
// create new trusts and schools. It is never assignable through the normal invite
// endpoint - only seeded directly.
export const PLATFORM_ADMIN_ROLE = "platform_admin";

export const INVITABLE_ROLES = ["front_desk", "counsellor", "teacher", "admin", "leadership"];
