import { FastifyInstance } from "fastify";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma";
import { AppJwtPayload } from "../types/fastify-jwt";

const ACCESS_TOKEN_EXPIRY = "15m";
const REFRESH_TOKEN_EXPIRY = "30d";

interface LoginBody {
  email: string;
  password: string;
}

export async function authRoutes(app: FastifyInstance) {
  app.post<{ Body: LoginBody }>("/auth/login", async (request, reply) => {
    const { email, password } = request.body ?? {};

    if (!email || !password) {
      return reply.code(400).send({
        data: null,
        error: { code: "validation_error", message: "email and password are required" },
      });
    }

    const user = await prisma.appUser.findUnique({ where: { email } });

    if (!user || !user.passwordHash || user.status !== "active") {
      return reply.code(401).send({
        data: null,
        error: { code: "invalid_credentials", message: "Incorrect email or password" },
      });
    }

    const passwordMatches = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatches) {
      return reply.code(401).send({
        data: null,
        error: { code: "invalid_credentials", message: "Incorrect email or password" },
      });
    }

    const claims = {
      sub: user.id,
      role: user.role,
      schoolId: user.schoolId,
      trustId: user.trustId,
    };

    const accessToken = app.jwt.sign({ ...claims, type: "access" }, { expiresIn: ACCESS_TOKEN_EXPIRY });
    const refreshToken = app.jwt.sign({ ...claims, type: "refresh" }, { expiresIn: REFRESH_TOKEN_EXPIRY });

    return { data: { accessToken, refreshToken }, meta: {} };
  });

  app.post("/auth/refresh", async (request, reply) => {
    const authHeader = request.headers.authorization;
    const refreshToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : undefined;

    if (!refreshToken) {
      return reply.code(401).send({
        data: null,
        error: { code: "unauthorized", message: "Missing refresh token" },
      });
    }

    try {
      const decoded = app.jwt.verify<AppJwtPayload>(refreshToken);
      if (decoded.type !== "refresh") {
        throw new Error("Not a refresh token");
      }

      const user = await prisma.appUser.findUnique({ where: { id: decoded.sub } });
      if (!user || user.status !== "active") {
        throw new Error("User no longer active");
      }

      const claims = {
        sub: user.id,
        role: user.role,
        schoolId: user.schoolId,
        trustId: user.trustId,
      };

      const accessToken = app.jwt.sign({ ...claims, type: "access" }, { expiresIn: ACCESS_TOKEN_EXPIRY });

      return { data: { accessToken }, meta: {} };
    } catch {
      return reply.code(401).send({
        data: null,
        error: { code: "unauthorized", message: "Invalid or expired refresh token" },
      });
    }
  });

  app.get("/auth/me", { onRequest: [app.authenticate] }, async (request) => {
    const user = await prisma.appUser.findUnique({
      where: { id: request.user.sub },
      select: {
        id: true,
        fullName: true,
        email: true,
        role: true,
        schoolId: true,
        trustId: true,
        status: true,
      },
    });

    return { data: user, meta: {} };
  });
}
