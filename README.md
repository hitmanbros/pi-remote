# pi-remote

Chat with [pi](https://github.com/mariozechner/pi) from your phone.

pi-remote is a WebSocket bridge + React Native client that lets you run `pi --mode rpc` on any machine (VPS, personal PC, homelab) and control it from anywhere. Think of it as an open, self-hosted alternative to Claude Code's `/remote` — you own the server, the token, and the network.

**How it compares:**

| | pi-remote | Claude Code /remote |
|---|---|---|
| **Host** | Your machines (VPS, PC, etc.) | Anthropic's cloud |
| **Code access** | Full shell on your machine | Sandboxed |
| **Privacy** | Your token, your Tailnet | Third-party relay |
| **Cost** | VPS you already have | Pro plan |
| **Model** | Whatever pi is configured with | Claude only |
| **Multi-host** | ✅ Switch between VPS and PC | ❌ Single cloud endpoint |

---

## Architecture

```
                    ┌─────────────────┐
                    │   pi-remote     │◄──┐
                    │   bridge (PC)   │   │
                    └─────────────────┘   │
                           ▲              │
     ┌─────────────────────┼──────────────┘
     │              ┌──────┴──────┐
┌────┴─────┐        │  pi-remote  │      ┌─────────────────┐
│ Expo Go  │◄──────►│   bridge    │◄────►│   pi-remote     │
│  (App)   │        │   (VPS)     │      │   bridge (more) │
└──────────┘        └─────────────┘      └─────────────────┘
```

1. The **bridge** spawns `pi --mode rpc` as a child process and translates between line-delimited JSON-RPC over stdio and WebSocket messages.
2. The **app** connects over WebSocket, authenticates with a Bearer token, and exposes a chat UI.
3. You can configure **multiple hosts** (VPS, PC, etc.) and switch between them from the app.
4. Session state lives on each host (pi handles that). The app can start fresh sessions or continue existing ones on any host.

---

## Download & Install (Android)

Prebuilt APKs are automatically built on every push. No need to install Node.js or Expo on your phone.

### Option 1: Download latest APK

1. Go to the [**Releases**](https://github.com/hitmanbros/pi-remote/releases/tag/latest) page
2. Download `pi-remote.apk`
3. On your Android phone, enable **"Install from unknown sources"** (Settings → Security → Unknown sources, or the installer will prompt you)
4. Open the downloaded APK and install

> The APK is signed with a debug keystore. You may see a Play Protect warning — tap **"Install anyway"**.

### Option 2: Build locally

If you prefer to build the APK yourself:

```bash
cd app
npm install
npm run build:android
# APK will be at app/android/app/build/outputs/apk/release/app-release.apk
```

Requires: Node.js 20+, JDK 17, Android SDK (or let `expo prebuild` handle it).

---

## Prerequisites

- One or more machines to run the bridge on: VPS, personal PC, homelab, or always-on Mac/Linux host. Each needs:
  - Node.js 18+
  - `pi` installed and on `$PATH`
- A way to reach each host from your phone:
  - **Tailscale** (recommended) — both phone and host on same tailnet
  - Or **Cloudflare Tunnel** — public HTTPS endpoint per host
- iOS/Android phone with **Expo Go** installed

---

## Bridge Server Setup

### 1. Clone and install

```bash
cd /opt/pi-remote/bridge
npm install
npm run build
```

### 2. Environment variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `8765` | TCP port for the HTTP/WebSocket server |
| `PI_REMOTE_TOKEN` | `change-me-in-production` | Bearer token clients must present |
| `PI_CWD` | `process.cwd()` | Default working directory for pi sessions |

Install the bridge on **every machine** you want to connect to (VPS, PC, etc.). Each gets its own token and port.

Create a systemd unit or just run with env vars:

```bash
export PI_REMOTE_TOKEN="$(openssl rand -hex 32)"
export PORT=8765
export PI_CWD=/home/you/projects
npm start
```

### 3. Systemd service example

Save as `/etc/systemd/system/pi-remote-bridge.service`:

```ini
[Unit]
Description=pi-remote bridge
After=network.target

[Service]
Type=simple
User=pi
WorkingDirectory=/opt/pi-remote/bridge
ExecStart=/usr/bin/node dist/server.js
Environment="PORT=8765"
Environment="PI_CWD=/home/pi/projects"
# Use a systemd drop-in or load-credential for the token in production
Environment="PI_REMOTE_TOKEN=YOUR_TOKEN_HERE"
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Then:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now pi-remote-bridge
sudo systemctl status pi-remote-bridge
```

---

## Network Options

### Tailscale (recommended)

1. [Install Tailscale](https://tailscale.com/download) on each host (VPS, PC, etc.) and your phone.
2. In the app settings, add each host with its Tailscale IP:
   ```
   ws://100.x.x.x:8765   # VPS
   ws://100.y.y.y:8765   # PC
   ```
3. Traffic is encrypted by WireGuard. No TLS certificate management needed.

### Cloudflare Tunnel

If you want access without Tailscale on a particular host:

```bash
cloudflared tunnel --no-autoupdate run --token <TOKEN>
```

Route `wss://pi-remote.yourdomain.com` → `localhost:8765` via a Cloudflare Tunnel public hostname. In the app, use:

```
wss://pi-remote.yourdomain.com
```

The bridge itself speaks plain WS; Cloudflare handles TLS termination.

> ⚠️ Do **not** expose the bridge directly to the public internet without a tunnel or reverse proxy. The token is the only auth mechanism.

---

## App Setup

### 1. Install dependencies

```bash
cd app
npm install
```

### 2. Configure hosts

Go to **Settings** and add each machine you want to connect to:

- **Name**: "My VPS", "Home PC", etc.
- **Server URL**: `ws://<tailscale-ip>:8765` (or `wss://` for Cloudflare)
- **Token**: the `PI_REMOTE_TOKEN` from that machine's bridge
- **Session ID** (optional): leave blank to continue the most recent session
- **Working Directory** (optional): override `PI_CWD` for that host

You can add **multiple hosts** and switch between them by tapping a host card. The app disconnects from the current host and connects to the selected one.

### 3. Run

```bash
npx expo start
```

Scan the QR code with Expo Go (iOS Camera or Android Expo Go app).

---

## Usage

### Starting a session

1. Open the app and go to **Settings**.
2. Tap a host to select it (it becomes active).
3. Tap **Connect**.
4. The bridge spawns `pi --mode rpc -c` (continues the most recent session, or starts fresh if none exists).
5. Type in the chat box and send.

### Switching between hosts

1. Go to **Settings**.
2. Tap the host you want to switch to.
3. Tap **Connect**. The app disconnects from the previous host and connects to the new one.
4. Session state is local to each host — your VPS session and PC session are independent.

### Continuing a session

1. In **Settings**, select the host.
2. Edit the host and enter the session ID you want to resume.
3. Tap **Connect**.
4. The bridge spawns `pi --mode rpc --session <id>`.

### Slash commands

Because you are talking directly to `pi --mode rpc`, all pi features work:

- `/commit` — stage and commit changes
- `/pr` — open a pull request
- `/test` — run tests
- Any custom pi skills or extensions

The bridge forwards every message from the app to pi as a `prompt`, `steer`, `follow_up`, or `abort` event.

### Extension UI

If pi requests user input (select, confirm, input, editor), the app receives `extension_ui_request` events. Respond via `extension_ui_response` with the chosen value.

---

## Security Notes

- **Token auth**: Every connection must authenticate with the `PI_REMOTE_TOKEN`. The server rejects any message before auth.
- **Tailscale encryption**: Tailscale traffic is encrypted in transit by WireGuard. No need for TLS certificates inside the tailnet.
- **Cloudflare TLS**: When using Cloudflare Tunnel, use `wss://` so the client encrypts to Cloudflare's edge.
- **Do not expose the bridge raw**: The bridge listens on plain WebSocket. Never forward port 8765 directly from your router to the internet.
- **Token hygiene**: Generate a long random token per host (`openssl rand -hex 32`). Rotate it if a device is lost. Store it in a password manager, not in the repo.
- **Per-host tokens**: Use a different token for each machine. If one is compromised, the others remain secure.

---

## Troubleshooting

### "Invalid token" or immediate disconnect

- Double-check `PI_REMOTE_TOKEN` on the server matches the token in the app settings.
- Check bridge logs: `journalctl -u pi-remote-bridge -f`.

### "Send init before commands"

- The app should auto-send `init` after auth. If you see this, the app may not be sending it — check the Settings screen and reconnect.

### "pi not found" or spawn errors

- Ensure `pi` is installed and on the `$PATH` of the user running the bridge.
- Test manually: `pi --mode rpc -c` on the host.

### Connection refused / timeout

- Verify the bridge is listening: `curl http://<host-ip>:8765` should return `{ "status": "pi-remote-bridge running" }`.
- Check firewall rules. If using Tailscale, make sure the Tailscale IP is reachable from the phone (test with `ping`).
- If using Cloudflare Tunnel, verify the tunnel is healthy in the Cloudflare dashboard.

### No response from pi

- Check the bridge logs for `[pi stderr]` output.
- Ensure `PI_CWD` points to a valid directory.
- pi may be waiting for user input or stuck on a long operation.

### Expo build errors

- Make sure you are using a compatible Node version (18+).
- Clear Metro cache: `npx expo start --clear`.

---

## Project Structure

```
pi-remote/
├── bridge/
│   ├── src/
│   │   ├── server.ts      # HTTP + WebSocket server
│   │   ├── auth.ts        # Bearer token verification
│   │   └── pi-process.ts  # Spawns pi --mode rpc, handles stdio JSON-RPC
│   ├── package.json
│   └── tsconfig.json
└── app/
    ├── src/
    │   ├── screens/
    │   │   ├── ChatScreen.tsx          # Chat UI with streaming
    │   │   └── SettingsScreen.tsx      # Multi-host management
    │   ├── components/
    │   │   └── ExtensionUIModal.tsx    # Native modals for select/confirm/input/editor
    │   ├── services/
    │   │   └── websocket.ts            # PiWebSocket client class
    │   └── types/
    │       └── index.ts                # Shared types
    ├── App.tsx
    ├── app.json
    └── package.json
```

---

## License

MIT
