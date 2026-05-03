# pi-remote App Setup Guide

Complete guide for installing, running, and using the pi-remote React Native app.

---

## Quick Install (Android APK)

The easiest way — no Node.js, no Expo, no build tools needed on your phone.

1. Go to the [**Releases**](https://github.com/hitmanbros/pi-remote/releases/tag/latest) page on GitHub
2. Download `pi-remote.apk`
3. Enable **"Install from unknown sources"** when prompted
4. Open the APK and install

> This is a debug build. You may see a Play Protect warning — tap **"Install anyway"**.

That's it. Skip to [Adding Your First Host](#adding-your-first-host-in-settings).

---

## Build from Source (Alternative)

If you want to run via Expo or build the APK yourself:

### Prerequisites

| Requirement | Version / Note |
|-------------|---------------|
| **Node.js** | 18+ (check with `node -v`) |
| **npm** | Comes with Node.js |
| **Expo CLI** | Installed via `npx` (no global install needed) |
| **Expo Go** | Free app from App Store (iOS) or Play Store (Android) |
| **A running bridge** | See README.md for bridge setup on your host machine(s) |

### Verify Node.js

```bash
node -v   # Should print v18.x.x or higher
```

### Install Expo Go on Your Phone

- **iOS**: Search "Expo Go" in the App Store
- **Android**: Search "Expo Go" in the Play Store

No Apple Developer account or Xcode required.

---

## Installation

```bash
cd /home/bryan/pi/remote_sessions/pi-remote/app
npm install
```

This installs React Native, Expo, navigation, Markdown rendering, and other dependencies.

---

## Running the App

### Start the Metro bundler

```bash
npx expo start
```

A QR code appears in the terminal.

### Connect your phone

| Platform | How to scan |
|----------|-------------|
| **iOS** | Open Camera app, point at QR code, tap the notification that appears |
| **Android** | Open Expo Go, tap "Scan QR Code", point camera at terminal |

The app bundles and loads on your phone. Initial load takes 10–30 seconds.

### Common `npx expo start` flags

```bash
npx expo start --clear     # Clear Metro cache
npx expo start --android   # Launch Android emulator (if configured)
npx expo start --ios       # Launch iOS simulator (macOS + Xcode only)
```

---

## Adding Your First Host in Settings

Before chatting, you must tell the app where your bridge server lives.

1. Open the app and tap **Settings** in the top-right corner.
2. Tap **+ Add Host**.
3. Fill in the fields:

| Field | What to enter |
|-------|--------------|
| **Name** | A friendly label, e.g. "My VPS" or "Home PC" |
| **Server URL** | `ws://<tailscale-ip>:8765` or `wss://pi-remote.yourdomain.com` |
| **Auth Token** | The `PI_REMOTE_TOKEN` value from that host's bridge |
| **Session ID** (optional) | Leave blank to continue the most recent session on that host |
| **Working Directory** (optional) | Override the default project folder for that host |

4. Tap **Save**.

> **Tip**: If this is your first host, the app automatically selects it as active.

### Example host configurations

**Tailscale (recommended)**
```
Name:       Home PC
Server URL: ws://100.x.x.x:8765
Token:      <PI_REMOTE_TOKEN from that machine>
```

**Cloudflare Tunnel**
```
Name:       VPS
Server URL: wss://pi-remote.yourdomain.com
Token:      <PI_REMOTE_TOKEN from that machine>
```

---

## Switching Between Hosts

You can add multiple hosts and switch at any time. Each host maintains its own independent session state.

1. Go to **Settings**.
2. Tap a host card to make it **active** (a blue border appears).
3. Tap **Connect**.

The app disconnects from the previous host and connects to the selected one. Your chat history on each host is preserved on the server, not the phone.

### Host status colors

| Dot color | Meaning |
|-----------|---------|
| 🟢 Green | Active host, connected |
| 🟡 Orange | Active host, disconnected |
| ⚪ Gray | Inactive |

---

## Understanding the Chat UI

### Message types

The chat screen shows four kinds of bubbles:

| Role | Appearance | Purpose |
|------|-----------|---------|
| **User** | Blue bubble, right side | Messages you send |
| **Assistant** | Gray bubble, left side | LLM responses with Markdown rendering |
| **Tool** | Centered, italic gray | Live tool execution updates (e.g. `▶ read_file`) |
| **System** | Centered, small gray | Notifications like "Started new session" |

### Streaming

As the assistant generates a response, text appears character-by-character inside the assistant bubble. A `…` indicator shows while the message is still being written.

### Thinking blocks

If the assistant emits reasoning/thinking tokens, a collapsible "thinking" block appears above the main response in muted text.

### Abort button

While the assistant is streaming, the **Send** button becomes **Abort** (red). Tap it to cancel the current generation. The partial response stays in the chat.

### Queue indicator

If you send messages while the assistant is busy, a `queue: N` badge appears in the header showing how many pending steering or follow-up messages are queued.

---

## Using Slash Commands

Because the app talks directly to `pi --mode rpc`, all native pi slash commands work:

| Command | What it does |
|---------|-------------|
| `/new` | Starts a brand-new session (handled locally in the app) |
| `/resume <id>` | Sends a message to resume a specific session by ID |
| `/commit` | Stage and commit changes (pi handles this) |
| `/pr` | Open a pull request (pi handles this) |
| `/test` | Run tests (pi handles this) |

### `/new` — Start fresh session

Type `/new` and send. The app clears the local message list and tells the bridge to start a new pi session. A system message confirms the action.

### `/resume` — Continue a specific session

1. In **Settings**, edit the active host and enter a **Session ID**.
2. Tap **Connect**.
3. The bridge spawns `pi --mode rpc --session <id>`.

Alternatively, type `/resume <session-id>` as a regular message.

---

## How Extension UI Modals Work

When pi needs user input mid-conversation (e.g. asking which file to edit), the bridge forwards an `extension_ui_request` event. The app renders a native modal instead of requiring terminal interaction.

### Modal types

| Method | UI shown | How you respond |
|--------|----------|---------------|
| **select** | Scrollable list of options | Tap an option |
| **confirm** | Yes/No buttons | Tap **Yes** or **No** |
| **input** | Single-line text field | Type and tap **Submit** |
| **editor** | Multi-line text area | Type or paste and tap **Submit** |

### Flow

1. Pi sends `extension_ui_request` → bridge → app.
2. App pauses the chat and shows a modal overlay.
3. You interact with the modal.
4. App sends `extension_ui_response` → bridge → pi.
5. Pi continues processing.

### Canceling

Every modal has a **Cancel** option. Canceling sends `{ cancelled: true }` back to pi, which typically aborts the current operation.

### Non-interactive methods

Methods like `setStatus`, `setWidget`, `setTitle`, and `set_editor_text` do **not** open modals. They are silently handled or ignored by the app.

---

## Dark Mode Support

The app automatically follows your phone's system appearance setting:

- **iOS**: Settings → Display & Brightness → Light / Dark
- **Android**: Settings → Display → Dark theme

All screens, modals, Markdown rendering, and syntax highlighting adapt instantly. No in-app toggle — it uses `useColorScheme()` from React Native.

---

## Troubleshooting

### "Invalid token" or immediate disconnect

- Double-check the **Auth Token** in Settings matches `PI_REMOTE_TOKEN` on the bridge host.
- Check bridge logs: `journalctl -u pi-remote-bridge -f` or console output.

### "Send init before commands"

- The app auto-sends `init` after successful auth. If you see this, reconnect via Settings → Connect.
- Ensure the bridge is running and reachable.

### Connection refused / timeout

- Verify bridge is listening: `curl http://<host-ip>:8765` should return `{ "status": "pi-remote-bridge running" }`.
- Check firewall rules. Tailscale IPs should be pingable from your phone.
- If using Cloudflare Tunnel, verify tunnel health in Cloudflare dashboard.

### No response from pi

- Check bridge logs for `[pi stderr]` output.
- Ensure `PI_CWD` points to a valid directory.
- pi may be waiting for user input (check for an extension UI modal).

### Expo build or bundling errors

- Use Node.js 18+.
- Clear Metro cache: `npx expo start --clear`.
- Delete `node_modules` and re-run `npm install`.

### App crashes on modal open

- Rare on modern devices. Ensure Expo Go is up to date.
- Report the exact modal type (`select`, `confirm`, `input`, `editor`) and payload if reproducible.

### Messages not sending

- Confirm the connection dot in the header is 🟢 green.
- If orange/gray, tap Settings → Connect.
