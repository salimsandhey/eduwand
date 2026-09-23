import { FastifyInstance } from "fastify";
import type { WebSocket } from "ws";
import websocket from "@fastify/websocket";
import { prisma } from "../lib/prisma";
import { joinRoom, leaveRoom } from "../lib/realtime";

const HEARTBEAT_MS = 30_000;

// Keeps a connection alive and cleans up its rooms on close - shared by both
// the logged-in (token) and code-based (presentCode) connection paths below.
function attachHeartbeat(socket: WebSocket, rooms: string[]) {
  let alive = true;
  socket.on("pong", () => {
    alive = true;
  });
  const heartbeat = setInterval(() => {
    if (!alive) return socket.terminate();
    alive = false;
    socket.ping();
  }, HEARTBEAT_MS);
  socket.on("close", () => {
    clearInterval(heartbeat);
    rooms.forEach((room) => leaveRoom(room, socket));
  });
}

// Browsers/React Native can't set an Authorization header on a WebSocket
// handshake, so the access token comes in the query string (?token=).
export async function realtimeRoutes(app: FastifyInstance) {
  await app.register(websocket);

  app.get("/realtime", { websocket: true }, async (socket, request) => {
    const query = (request.query as { token?: string; presentCode?: string; role?: string } | undefined) ?? {};

    // A live "present on a screen" session (present.ts) has no logged-in user
    // on the classroom device, so it authenticates with its short-lived code
    // instead of a JWT. role=control (the teacher's own tapping device) joins
    // a separate room from everything else (the projector/Display device) -
    // present.ts broadcasts a different, redacted payload to each, so a
    // socket must never sit in both rooms at once.
    if (query.presentCode) {
      const assessment = await prisma.assessment.findFirst({
        where: { presentCode: query.presentCode, presentCodeExpiresAt: { gt: new Date() } },
        select: { id: true },
      });
      if (!assessment) {
        socket.close(4404, "present session not found or expired");
        return;
      }
      const room = `assessment:${assessment.id}:${query.role === "control" ? "control" : "display"}`;
      joinRoom(room, socket);
      attachHeartbeat(socket, [room]);
      socket.send(JSON.stringify({ type: "ready" }));
      return;
    }

    let claims: { sub: string; role: string; schoolId: string | null; type: string };
    try {
      claims = app.jwt.verify(query.token ?? "");
      if (claims.type !== "access" || !claims.schoolId) throw new Error("bad token");
    } catch {
      socket.close(4401, "unauthorized");
      return;
    }

    const rooms = [`user:${claims.sub}`];
    if (claims.role === "student") {
      const student = await prisma.studentStub.findFirst({
        where: { id: claims.sub, schoolId: claims.schoolId },
        select: { classSectionId: true },
      });
      if (!student) {
        socket.close(4404, "student not found");
        return;
      }
      rooms.push(`class:${student.classSectionId}`);
    } else if (claims.role !== "teacher") {
      socket.close(4403, "forbidden");
      return;
    }
    rooms.forEach((room) => joinRoom(room, socket));
    attachHeartbeat(socket, rooms);
    socket.send(JSON.stringify({ type: "ready" }));
  });
}
