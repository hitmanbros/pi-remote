# pi-remote Architecture

Technical overview for contributors and curious users who want to understand how the pieces fit together.

---

## High-Level Data Flow

```
┌─────────────┐      WebSocket       ┌─────────────┐      stdio (JSONL)      ┌─────────┐
│  React      │ ◄──────────────────► │   Bridge    │ ◄─────────────────────► │   pi    │
│  Native     │   (auth + events)    │   Server    │   (JSON-RPC over stdio) │  (LLM)  │
│   App       │                      │             │                         │         │
└─────────────┘                      └─────────────┘                         └─────────┘
```

1. **App** opens a WebSocket to a bridge host.
2. **Bridge** authenticates the connection, then spawns `pi --mode rpc` as a child process.
3. **Bridge** translates between WebSocket JSON messages and line-delimited JSON-RPC on stdio.
4. **pi** handles session state, tool execution, LLM interaction, and extension UI logic.
5. Responses flow back the same way: **pi → bridge → app**.

---

## Bridge Components

Located in `bridge/src/`.

### `server.ts`

The entry point. Responsibilities:

- Creates an HTTP server (health endpoint at `GET /` returns `{ status: "pi-remote-bridge running" }`).
- Attaches a `WebSocketServer` to the same HTTP port.
- Manages per-connection `ClientState`: WebSocket instance, authentication flag, and active `PiProcess`.
- Enforces the **auth-first** rule: the first message on every WebSocket must be `auth` with a valid token.
- Handles `init` messages by spawning (or respawning) the pi process.
- Forwards all subsequent messages to the active `PiProcess`.
- Cleans up the pi process on disconnect or error.

### `auth.ts`

Minimal bearer-token verification:

- Reads `PI_REMOTE_TOKEN` from environment.
- `authenticate(req)` compares the `Authorization: Bearer <token>` header value against the env var.
- `getAuthError()` returns a structured error object for HTTP contexts.

No sessions, no JWT, no expiration — just a single shared secret per host.

### `pi-process.ts`

Wraps the `pi` child process. Responsibilities:

- Spawns `pi --mode rpc [-c | --session <id>] [--cwd <dir>]` using Node.js `child_process.spawn`.
- Buffers stdout, splits on newlines, and parses each line as JSON.
- **Intercepts `extension_ui_request`** to manage pending responses:
  - Stores a `{ resolve, timeout }` entry keyed by request ID.
  - Auto-cancels after the request's `timeout` (default 60s) if the user never responds.
- `sendFromClient(data)` routes outgoing messages:
  - If the message is an `extension_ui_response` matching a pending ID, it resolves the stored promise instead of writing to stdin.
  - Everything else is serialized to JSONL and written to pi's stdin.
- `kill()` sends `SIGTERM`, clears all pending extension UI timeouts, and marks the process closed.

---

## App Components

Located in `app/src/`.

### Screens

| File | Role |
|------|------|
| `screens/ChatScreen.tsx` | Main chat UI. Renders message list, input bar, handles streaming updates, abort, and queue display. Passes extension UI requests to `ExtensionUIModal`. |
| `screens/SettingsScreen.tsx` | Host CRUD, active host selection, connect/disconnect controls. Persists hosts to AsyncStorage via callbacks from `App.tsx`. |

### Services

| File | Role |
|------|------|
| `services/websocket.ts` | `PiWebSocket` class. Manages WebSocket lifecycle, auth handshake, auto-reconnect (3s backoff), and exposes typed methods: `prompt()`, `steer()`, `followUp()`, `abort()`, `newSession()`, `extensionUIResponse()`. |

### Components

| File | Role |
|------|------|
| `components/ExtensionUIModal.tsx` | Renders React Native `Modal` overlays for `select`, `confirm`, `input`, and `editor` methods. Ignores non-interactive methods (`setStatus`, `setWidget`, etc.). Sends responses back via `ws.extensionUIResponse()`. |

### Types

| File | Role |
|------|------|
| `types/index.ts` | Shared TypeScript interfaces: `ChatMessage`, `HostConfig`, `AppSettings`, `ExtensionUIRequest`, `AgentEvent`. |

### Entry Point

`App.tsx` bootstraps:

- Reads system color scheme (`useColorScheme`) for dark/light mode.
- Loads `AppSettings` from `AsyncStorage` on mount.
- Persists settings on every change.
- Creates a singleton `PiWebSocket` instance shared across screens.
- Auto-connects to the active host once settings load.
- Sets up React Navigation with a `Chat` → `Settings` stack.

---

## The RPC Protocol Mapping

The bridge does not interpret LLM semantics — it only translates message formats.

### WebSocket events (app ↔ bridge)

| Direction | Event | Payload | Meaning |
|-----------|-------|---------|---------|
| App → Bridge | `auth` | `{ token: string }` | Must be first message |
| Bridge → App | `auth` | `{ success: boolean, error?: string }` | Auth result |
| App → Bridge | `init` | `{ sessionId?, cwd? }` | Spawn pi process |
| App → Bridge | `prompt` | `{ message: string, images? }` | User message |
| App → Bridge | `steer` | `{ message: string }` | Steering message |
| App → Bridge | `follow_up` | `{ message: string }` | Follow-up message |
| App → Bridge | `abort` | `{}` | Cancel current generation |
| App → Bridge | `new_session` | `{}` | Start fresh session |
| App → Bridge | `extension_ui_response` | `{ id, ...values }` | Reply to modal |
| Bridge → App | `message_start` | `{ type }` | Assistant message begins |
| Bridge → App | `message_update` | `{ assistantMessageEvent }` | Text/thinking delta |
| Bridge → App | `message_end` | `{ type }` | Assistant message done |
| Bridge → App | `agent_start` / `agent_end` | `{ type }` | Agent run boundaries |
| Bridge → App | `tool_execution_start` / `tool_execution_end` | `{ toolName, result, isError }` | Tool call lifecycle |
| Bridge → App | `queue_update` | `{ steering[], followUp[] }` | Pending message count |
| Bridge → App | `extension_ui_request` | `{ id, method, title, message, options, ... }` | Modal trigger |
| Bridge → App | `system` | `{ text }` | System notification |
| Bridge → App | `pi_exit` | `{ code }` | Pi process exited |

### stdio JSON-RPC (bridge ↔ pi)

The bridge forwards WebSocket events **as-is** to pi's stdin as JSON lines. Pi's stdout emits JSON lines that the bridge parses and forwards to the WebSocket. There is no transformation of the payload structure — the bridge is a transparent pipe with two additions:

1. **Auth gating**: Messages are blocked until the client authenticates.
2. **Extension UI timeout management**: The bridge intercepts `extension_ui_request` / `extension_ui_response` to handle client disconnects gracefully (auto-cancel on timeout).

---

## Security Model

| Layer | Mechanism |
|-------|-----------|
| **Transport** | WebSocket over Tailscale (WireGuard) or Cloudflare Tunnel (TLS) |
| **Authentication** | Single static Bearer token per host (`PI_REMOTE_TOKEN`) |
| **Authorization** | None — token is binary access. One token = full pi access on that host. |
| **Session isolation** | Sessions live in pi's state on the host; the bridge is stateless |
| **Network exposure** | Bridge should **never** be exposed raw to the public internet. Always use Tailscale or a reverse proxy with TLS. |

### Token hygiene

- Generate per-host tokens: `openssl rand -hex 32`
- Rotate tokens if a device is lost or compromised
- Store tokens in a password manager, not in Git

---

## Why WebSocket Instead of HTTP/SSE

| Approach | Downsides | Why WebSocket wins |
|----------|-----------|-------------------|
| **HTTP polling** | High latency, wasteful requests, no server push | WebSocket gives true bidirectional streaming |
| **SSE** | Server-to-client only; client still needs HTTP POSTs for sending | WebSocket is a single persistent connection for both directions |
| **HTTP/2 streams** | Complex client implementation in React Native | WebSocket is natively supported in React Native and Node.js |
| **gRPC** | Requires protobuf, heavier deps, TLS complexities | WebSocket + JSON is simple, debuggable, and requires zero codegen |

WebSocket also makes **multi-host switching** trivial: close one socket, open another. No connection pooling or cookie state to manage.

---

## Session State Ownership

**pi owns session state. The bridge is stateless.**

- The bridge does not store conversation history, session IDs, or user preferences.
- When a client disconnects, the bridge kills the pi process. The next connection spawns a new one.
- Session persistence is handled by pi's own storage layer on the host machine.
- To continue a session, the client sends a `sessionId` in the `init` message, which the bridge passes to `pi --mode rpc --session <id>`.

This design keeps the bridge small, restart-safe, and horizontally repeatable — you can run multiple bridge instances behind a load balancer without sticky sessions.
