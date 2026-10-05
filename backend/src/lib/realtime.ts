import { randomUUID } from "node:crypto";
import type { WebSocket } from "ws";
import Redis from "ioredis";

// Pub/sub for live chat, Present Mode and the student portal. Rooms are plain
// strings:
//   user:<userId or studentStubId>  - every device a person is connected on
//   class:<classSectionId>          - every connected student in that class
//   present:control:<assessmentId>  - a teacher's Present Mode control page
//   present:display:<assessmentId>  - a class's Present Mode display/clicker receiver
//
// Each process only ever holds the WebSocket objects it accepted - sockets
// can't be shared across servers. Delivery to a room's members connected to
// *this* process is always a plain local Map lookup. When REDIS_URL is set
// (production, with more than one API server behind the load balancer),
// publish() also broadcasts over a single shared Redis channel so every other
// process delivers to its own local members too. INSTANCE_ID lets each
// process ignore its own echo back from Redis, since it already delivered
// locally before publishing. Without REDIS_URL (local dev, UAT's single
// server) this is exactly the old in-memory-only behaviour - nothing to set
// up, nothing that can fail.

const CHANNEL = "eduwand:realtime";
const INSTANCE_ID = randomUUID();

const rooms = new Map<string, Set<WebSocket>>();

export function joinRoom(room: string, socket: WebSocket) {
  let members = rooms.get(room);
  if (!members) {
    members = new Set();
    rooms.set(room, members);
  }
  members.add(socket);
}

export function leaveRoom(room: string, socket: WebSocket) {
  const members = rooms.get(room);
  if (!members) return;
  members.delete(socket);
  if (members.size === 0) rooms.delete(room);
}

function deliverLocally(targetRooms: string[], payload: string) {
  const sent = new Set<WebSocket>();
  for (const room of targetRooms) {
    for (const socket of rooms.get(room) ?? []) {
      // A socket can sit in several targeted rooms - deliver once.
      if (sent.has(socket) || socket.readyState !== socket.OPEN) continue;
      sent.add(socket);
      socket.send(payload);
    }
  }
}

export function publish(targetRooms: string[], event: unknown) {
  const payload = JSON.stringify(event);
  deliverLocally(targetRooms, payload);
  publisher?.publish(CHANNEL, JSON.stringify({ from: INSTANCE_ID, targetRooms, payload }));
}

// --- Redis bridge, only when REDIS_URL is configured ------------------------

let publisher: Redis | null = null;

const redisUrl = process.env.REDIS_URL;
if (redisUrl) {
  publisher = new Redis(redisUrl, { lazyConnect: true });
  publisher.on("error", (err) => console.error("[realtime] redis publisher error", err.message));
  publisher.connect().catch((err) => console.error("[realtime] redis publisher connect failed", err.message));

  const subscriber = new Redis(redisUrl, { lazyConnect: true });
  subscriber.on("error", (err) => console.error("[realtime] redis subscriber error", err.message));
  subscriber.on("message", (_channel, raw) => {
    let msg: { from: string; targetRooms: string[]; payload: string };
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    // Already delivered this one locally before publishing - the Redis round
    // trip would otherwise double-send to this process's own connections.
    if (msg.from === INSTANCE_ID) return;
    deliverLocally(msg.targetRooms, msg.payload);
  });
  subscriber
    .connect()
    .then(() => subscriber.subscribe(CHANNEL))
    .catch((err) => console.error("[realtime] redis subscriber connect failed", err.message));

  console.log("[realtime] Redis bridge enabled - multi-server delivery is on");
} else {
  console.log("[realtime] REDIS_URL not set - realtime delivery is local-process only");
}
