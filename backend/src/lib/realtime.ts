import type { WebSocket } from "ws";

// In-memory pub/sub for live chat. Rooms are plain strings:
//   user:<userId or studentStubId>  - every device a person is connected on
//   class:<classSectionId>          - every connected student in that class
// Single-process only: running more than one API instance needs a shared
// broker (e.g. Redis pub/sub) behind publish().

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

export function publish(targetRooms: string[], event: unknown) {
  const payload = JSON.stringify(event);
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
