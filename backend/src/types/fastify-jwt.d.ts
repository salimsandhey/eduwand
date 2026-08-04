import "@fastify/jwt";

export interface AppJwtPayload {
  sub: string; // app_user id
  role: string;
  schoolId: string | null;
  trustId: string | null;
  type: "access" | "refresh";
}

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: AppJwtPayload;
    user: AppJwtPayload;
  }
}
