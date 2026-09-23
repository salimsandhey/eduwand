import { useCallback, useRef, useState } from "react";

// Talks to the physical ESP32-C3 clicker receiver over USB serial, using the
// Web Serial API (Chrome/Edge desktop only - no Bluetooth involved, despite
// what the original client brief assumed). Mirrors the connection logic from
// the reference eduwand-demo_1.html: open at 115200 baud, decode text, split
// on newlines, and parse each line as JSON. The receiver prints two kinds of
// lines once flashed with receiver.ino:
//   {"status":"receiver ready"}
//   {"id":1,"ans":"A"}   // A/B/C/D or "?" for the doubt button
//
// This hook only owns the port + parsing; PresentControlPage decides what a
// parsed packet means (which student seatNumber N is, and which quiz action
// to record).

export type ClickerStatus = "unsupported" | "idle" | "connecting" | "live" | "error";

export interface ClickerPacket {
  id: number;
  ans: "A" | "B" | "C" | "D" | "?";
}

interface UseClickerReceiverOptions {
  onPacket: (packet: ClickerPacket) => void;
}

// Minimal Web Serial typings - not part of lib.dom yet in most TS configs.
interface SerialPortLike {
  open(options: { baudRate: number }): Promise<void>;
  close(): Promise<void>;
  readable: ReadableStream<Uint8Array> | null;
}

function isClickerPacket(value: unknown): value is ClickerPacket {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return typeof v.id === "number" && typeof v.ans === "string" && ["A", "B", "C", "D", "?"].includes(v.ans);
}

export function useClickerReceiver({ onPacket }: UseClickerReceiverOptions) {
  const supported = typeof navigator !== "undefined" && "serial" in navigator;
  const [status, setStatus] = useState<ClickerStatus>(supported ? "idle" : "unsupported");
  const [log, setLog] = useState<string[]>([]);
  const [checkedInSeats, setCheckedInSeats] = useState<Set<number>>(new Set());
  const portRef = useRef<SerialPortLike | null>(null);
  const readerRef = useRef<ReadableStreamDefaultReader<string> | null>(null);
  const stoppedRef = useRef(false);

  const appendLog = useCallback((line: string) => {
    setLog((prev) => {
      const next = [...prev, line];
      return next.length > 200 ? next.slice(next.length - 200) : next;
    });
  }, []);

  const disconnect = useCallback(async () => {
    stoppedRef.current = true;
    try {
      await readerRef.current?.cancel();
    } catch {
      // already gone - fine
    }
    readerRef.current = null;
    try {
      await portRef.current?.close();
    } catch {
      // already gone - fine
    }
    portRef.current = null;
    setStatus(supported ? "idle" : "unsupported");
  }, [supported]);

  const connect = useCallback(async () => {
    if (!supported) return;
    setStatus("connecting");
    setLog([]);
    setCheckedInSeats(new Set());
    stoppedRef.current = false;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const port: SerialPortLike = await (navigator as any).serial.requestPort();
      await port.open({ baudRate: 115200 });
      portRef.current = port;

      if (!port.readable) throw new Error("Receiver port has no readable stream");
      // TextDecoderStream's writable side is typed as BufferSource, which TS's lib.dom
      // doesn't consider assignable to ReadableStream<Uint8Array>'s expected pair even
      // though it works fine at runtime - cast through the DOM-standard pair type.
      const textStream = port.readable.pipeThrough(new TextDecoderStream() as unknown as ReadableWritablePair<string, Uint8Array>);
      const reader = textStream.getReader();
      readerRef.current = reader;

      let buffer = "";
      setStatus("live");
      appendLog("connected - waiting for receiver…");

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { value, done } = await reader.read();
        if (done || stoppedRef.current) break;
        buffer += value;
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const rawLine of lines) {
          const line = rawLine.trim();
          if (!line) continue;
          appendLog(line);
          try {
            const parsed = JSON.parse(line);
            if (isClickerPacket(parsed)) {
              setCheckedInSeats((prev) => {
                if (prev.has(parsed.id)) return prev;
                const next = new Set(prev);
                next.add(parsed.id);
                return next;
              });
              onPacket(parsed);
            }
          } catch {
            // not JSON (e.g. a boot banner line) - already logged, ignore
          }
        }
      }
    } catch (err) {
      if (!stoppedRef.current) {
        setStatus("error");
        appendLog(err instanceof Error ? `error: ${err.message}` : "error: could not connect to receiver");
      }
      return;
    }
    if (!stoppedRef.current) {
      // Port closed on its own (unplugged etc.)
      setStatus("idle");
    }
  }, [appendLog, onPacket, supported]);

  return { supported, status, log, checkedInSeats, connect, disconnect };
}
