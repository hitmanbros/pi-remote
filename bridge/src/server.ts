import { createServer } from "node:http";
import { WebSocketServer } from "ws";
import { authenticate, getAuthError } from "./auth.js";
import { PiProcess } from "./pi-process.js";

const PORT = Number(process.env.PORT ?? 8765);
const CWD = process.env.PI_CWD ?? process.cwd();

const httpServer = createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ status: "pi-remote-bridge running" }));
});

const wss = new WebSocketServer({ server: httpServer });

interface ClientState {
  ws: WebSocket;
  pi: PiProcess | null;
  authenticated: boolean;
}

wss.on("connection", (ws, req) => {
  const state: ClientState = { ws: ws as WebSocket, pi: null, authenticated: false };

  ws.on("message", (raw) => {
    let data: object;
    try {
      data = JSON.parse(raw.toString());
    } catch {
      ws.send(JSON.stringify({ type: "error", message: "Invalid JSON" }));
      return;
    }

    const d = data as Record<string, unknown>;

    // First message must be auth
    if (!state.authenticated) {
      if (d.type === "auth" && typeof d.token === "string") {
        const fakeReq = { headers: { authorization: `Bearer ${d.token}` } } as typeof req;
        if (authenticate(fakeReq)) {
          state.authenticated = true;
          ws.send(JSON.stringify({ type: "auth", success: true }));
        } else {
          ws.send(JSON.stringify({ type: "auth", success: false, error: "Invalid token" }));
          ws.close(1008, "Invalid token");
        }
        return;
      }
      ws.send(JSON.stringify({ type: "error", message: "Send auth first" }));
      return;
    }

    // Handle session init (spawn pi)
    if (d.type === "init") {
      if (state.pi) {
        state.pi.kill();
      }
      const sessionId = typeof d.sessionId === "string" ? d.sessionId : undefined;
      const cwd = typeof d.cwd === "string" ? d.cwd : CWD;

      state.pi = new PiProcess({
        sessionId,
        cwd,
        onMessage: (msg) => {
          if (ws.readyState === 1) ws.send(JSON.stringify(msg));
        },
        onClose: (code) => {
          if (ws.readyState === 1) {
            ws.send(JSON.stringify({ type: "pi_exit", code }));
          }
        },
      });
      return;
    }

    // Forward everything else to pi
    if (state.pi) {
      state.pi.sendFromClient(data);
    } else {
      ws.send(JSON.stringify({ type: "error", message: "Send init before commands" }));
    }
  });

  ws.on("close", () => {
    if (state.pi) {
      state.pi.kill();
      state.pi = null;
    }
  });

  ws.on("error", (err) => {
    console.error("WS error:", err);
    if (state.pi) {
      state.pi.kill();
      state.pi = null;
    }
  });
});

httpServer.listen(PORT, () => {
  console.log(`pi-remote-bridge listening on ws://0.0.0.0:${PORT}`);
  console.log(`Working directory: ${CWD}`);
  console.log(`Set PI_REMOTE_TOKEN env var to customize auth token`);
});
