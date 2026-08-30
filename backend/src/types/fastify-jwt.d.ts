import "@fastify/jwt";

export interface AppJwtPayload {
  sub: string;
  role: string;
  schoolId: string | null;
  trustId: string | null;
  type: "access" | "refresh" | "student_select";
  phone?: string;
}

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: AppJwtPayload;
    user: AppJwtPayload;
  }
}
