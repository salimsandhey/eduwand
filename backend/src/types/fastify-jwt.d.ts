import "@fastify/jwt";

export interface AppJwtPayload {
  sub: string; // app_user id, or student_stub id when role is "student"
  role: string;
  schoolId: string | null;
  trustId: string | null;
  type: "access" | "refresh" | "student_select";
  phone?: string; // only set on a short-lived student_select token
}

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: AppJwtPayload;
    user: AppJwtPayload;
  }
}
