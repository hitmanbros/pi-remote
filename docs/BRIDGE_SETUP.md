# Bridge Server Setup Guide

This guide walks through installing, configuring, and running the pi-remote bridge on any Linux or macOS host. The bridge spawns `pi --mode rpc` and exposes it over WebSocket so the mobile app can connect.

---

## Prerequisites

| Requirement | Version / Notes |
|-------------|-----------------|
| Node.js | 18+ (LTS recommended) |
| `pi` | Installed globally and available on `$PATH` |
| OS | Linux or macOS (Windows may work with WSL but is not tested) |
| Network | Tailscale, Cloudflare Tunnel, or another way to reach the host from your phone |

Verify Node.js:

```bash
node --version   # should print v18.x.x or higher
```

Verify `pi`:

```bash
which pi
pi --version
```

---

## Installation

### 1. Clone the repository

```bash
git clone https://github.com/mariozechner/pi-remote.git /opt/pi-remote
cd /opt/pi-remote/bridge
```

You can clone to any directory (`/opt/pi-remote`, `$HOME/pi-remote`, etc.). The examples below assume `/opt/pi-remote/bridge`.

### 2. Install dependencies

```bash
npm install
```

### 3. Build

```bash
npm run build
```

This compiles TypeScript to `dist/`. You only need to rebuild after pulling updates or changing source code.

---

## Environment Variables

Create a file named `.env` inside `bridge/` (optional but convenient) or export variables directly.

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8765` | TCP port for the HTTP/WebSocket server |
| `PI_REMOTE_TOKEN` | `change-me-in-production` | Bearer token the app must present |
| `PI_CWD` | `process.cwd()` | Default working directory for pi sessions |

### Example `.env`

```bash
PORT=8765
PI_REMOTE_TOKEN=$(openssl rand -hex 32)
PI_CWD=/home/you/projects
```

Load it before running:

```bash
set -a && source .env && set +a
```

> **Security tip:** Generate a strong token per host. Never commit tokens to git.
>
> ```bash
> openssl rand -hex 32
> ```

---

## Running in Development

Use `npm run dev` for live reload via `tsx`:

```bash
cd /opt/pi-remote/bridge
export PORT=8765
export PI_REMOTE_TOKEN="$(openssl rand -hex 32)"
export PI_CWD="/home/you/projects"
npm run dev
```

You should see:

```
pi-remote-bridge listening on ws://0.0.0.0:8765
Working directory: /home/you/projects
Set PI_REMOTE_TOKEN env var to customize auth token
```

Stop with `Ctrl+C`.

---

## Running in Production

### Option A: Direct start

```bash
cd /opt/pi-remote/bridge
npm run build   # if not already built
npm start
```

### Option B: systemd service (Linux)

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
Environment="PI_REMOTE_TOKEN=YOUR_TOKEN_HERE"
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Replace `User=pi`, `WorkingDirectory`, `PI_CWD`, and `PI_REMOTE_TOKEN` with your actual values.

Enable and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now pi-remote-bridge
sudo systemctl status pi-remote-bridge
```

View logs:

```bash
sudo journalctl -u pi-remote-bridge -f
```

---

## macOS launchd (auto-start on boot)

Save as `~/Library/LaunchAgents/com.pi-remote.bridge.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.pi-remote.bridge</string>

    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/node</string>
        <string>/opt/pi-remote/bridge/dist/server.js</string>
    </array>

    <key>EnvironmentVariables</key>
    <dict>
        <key>PORT</key>
        <string>8765</string>
        <key>PI_CWD</key>
        <string>/Users/you/projects</string>
        <key>PI_REMOTE_TOKEN</key>
        <string>YOUR_TOKEN_HERE</string>
    </dict>

    <key>WorkingDirectory</key>
    <string>/opt/pi-remote/bridge</string>

    <key>RunAtLoad</key>
    <true/>

    <key>KeepAlive</key>
    <true/>

    <key>StandardOutPath</key>
    <string>/Users/you/Library/Logs/pi-remote-bridge.log</string>

    <key>StandardErrorPath</key>
    <string>/Users/you/Library/Logs/pi-remote-bridge.error.log</string>
</dict>
</plist>
```

Update paths and token, then load:

```bash
mkdir -p ~/Library/Logs
launchctl load ~/Library/LaunchAgents/com.pi-remote.bridge.plist
launchctl start com.pi-remote.bridge
launchctl list | grep com.pi-remote.bridge
```

View logs:

```bash
tail -f ~/Library/Logs/pi-remote-bridge.log
```

---

## Firewall / Port Considerations

The bridge binds to `0.0.0.0` on the port you specify.

| Scenario | Action |
|----------|--------|
| **Tailscale** | No firewall changes needed. The Tailscale interface handles connectivity. Ensure `tailscaled` is running. |
| **Local LAN only** | Open the port on your host's firewall (e.g., `ufw allow 8765/tcp` on Ubuntu). |
| **Cloudflare Tunnel** | No inbound port exposure needed. The tunnel connects outbound to Cloudflare. |
| **Direct internet** | **Not recommended.** If you must, restrict by IP and use a reverse proxy with TLS. |

### Common firewall commands

**ufw (Ubuntu/Debian):**

```bash
sudo ufw allow 8765/tcp
```

**firewalld (RHEL/CentOS/Fedora):**

```bash
sudo firewall-cmd --permanent --add-port=8765/tcp
sudo firewall-cmd --reload
```

---

## Verifying It Works

### 1. HTTP health check

```bash
curl http://localhost:8765
```

Expected response:

```json
{"status":"pi-remote-bridge running"}
```

### 2. WebSocket auth test

Install `websocat` or `wscat`:

```bash
# macOS
brew install websocat

# Linux
cargo install websocat   # or download a release binary
```

Connect and authenticate:

```bash
websocat ws://localhost:8765
```

Type:

```json
{"type":"auth","token":"YOUR_TOKEN_HERE"}
```

Expected response:

```json
{"type":"auth","success":true}
```

Then initialize a session:

```json
{"type":"init"}
```

You should see pi startup messages streamed back as JSON.

---

## Common Errors and Solutions

### "Invalid token" or immediate disconnect

- Double-check that `PI_REMOTE_TOKEN` on the server matches the token entered in the app settings.
- For systemd, verify the token is correctly set in the service file and reload the daemon after changes.
- Check logs: `journalctl -u pi-remote-bridge -f` (Linux) or `tail -f ~/Library/Logs/pi-remote-bridge.error.log` (macOS).

### "Send auth first"

- The first WebSocket message must be `{"type":"auth","token":"..."}`. The app does this automatically; if you see this error from a custom client, send auth before anything else.

### "Send init before commands"

- After auth, the client must send `{"type":"init"}` before sending prompts or other commands. The app does this automatically on connect.

### "pi not found" or spawn errors

- Ensure `pi` is installed and on the `$PATH` of the user running the bridge.
- Test manually as that user: `pi --mode rpc -c`
- If `pi` is installed in a non-standard location, symlink it into `/usr/local/bin` or add its directory to the systemd `Environment="PATH=..."` variable.

### Connection refused / timeout

- Verify the bridge is running and listening on the expected port:
  ```bash
  ss -tlnp | grep 8765
  ```
- If using Tailscale, test from another tailnet device:
  ```bash
  curl http://100.x.x.x:8765
  ```
- Check host firewall rules.
- If using Cloudflare Tunnel, verify the tunnel status in the Cloudflare dashboard and ensure the public hostname routes to `localhost:8765`.

### No response from pi

- Check bridge logs for `[pi stderr]` output.
- Ensure `PI_CWD` points to a valid, readable directory.
- pi may be waiting for user input (e.g., a confirmation prompt) or running a long operation.

### Port already in use

- Another process is bound to `8765`. Either stop it or change the bridge `PORT` environment variable.

### systemd service fails to start

- Check for syntax errors in the service file.
- Verify the `User` exists and has read access to `/opt/pi-remote/bridge`.
- Ensure `node` is at the absolute path specified in `ExecStart` (find it with `which node`).
