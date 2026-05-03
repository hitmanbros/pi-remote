import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { type WebSocket } from "ws";

export interface PiProcessOptions {
  sessionId?: string;
  cwd?: string;
  onMessage: (data: object) => void;
  onClose: (code: number | null) => void;
}

export class PiProcess {
  private proc: ChildProcessWithoutNullStreams;
  private buffer = "";
  private onMessage: (data: object) => void;
  private onClose: (code: number | null) => void;
  private pendingExtensionUIs = new Map<string, { resolve: (value: object) => void; timeout: NodeJS.Timeout }>();
  private closed = false;

  constructor(options: PiProcessOptions) {
    this.onMessage = options.onMessage;
    this.onClose = options.onClose;

    const args = ["--mode", "rpc"];
    if (options.sessionId) {
      args.push("--session", options.sessionId);
    } else {
      args.push("-c"); // continue most recent
    }
    if (options.cwd) {
      args.push("--cwd", options.cwd);
    }

    this.proc = spawn("pi", args, { stdio: ["pipe", "pipe", "pipe"] });

    this.proc.stdout.setEncoding("utf8");
    this.proc.stdout.on("data", (chunk: string) => this.handleStdout(chunk));
    this.proc.stderr.on("data", (chunk: Buffer) => {
      console.error("[pi stderr]", chunk.toString());
    });
    this.proc.on("exit", (code) => {
      this.closed = true;
      this.onClose(code);
    });
  }

  private handleStdout(chunk: string): void {
    this.buffer += chunk;
    while (true) {
      const idx = this.buffer.indexOf("\n");
      if (idx === -1) break;
      let line = this.buffer.slice(0, idx);
      this.buffer = this.buffer.slice(idx + 1);
      if (line.endsWith("\r")) line = line.slice(0, -1);
      if (!line.trim()) continue;

      try {
        const data = JSON.parse(line) as object;
        // Intercept extension_ui_request to manage pending responses
        if ((data as Record<string, unknown>).type === "extension_ui_request") {
          const req = data as Record<string, unknown>;
          const id = req.id as string;
          const timeout = setTimeout(() => {
            if (this.pendingExtensionUIs.has(id)) {
              this.pendingExtensionUIs.delete(id);
              this.sendToPi({ type: "extension_ui_response", id, cancelled: true });
            }
          }, (req.timeout as number) ?? 60000);

          this.pendingExtensionUIs.set(id, {
            resolve: (response: object) => {
              clearTimeout(timeout);
              this.pendingExtensionUIs.delete(id);
              this.sendToPi(response);
            },
            timeout,
          });
        }
        this.onMessage(data);
      } catch {
        // ignore malformed lines
      }
    }
  }

  sendFromClient(data: object): void {
    // If this is an extension_ui_response, resolve the pending request
    const d = data as Record<string, unknown>;
    if (d.type === "extension_ui_response" && typeof d.id === "string") {
      const pending = this.pendingExtensionUIs.get(d.id);
      if (pending) {
        pending.resolve(data);
        return;
      }
    }
    this.sendToPi(data);
  }

  private sendToPi(data: object): void {
    if (this.closed || !this.proc.stdin) return;
    this.proc.stdin.write(JSON.stringify(data) + "\n");
  }

  kill(): void {
    this.closed = true;
    for (const p of this.pendingExtensionUIs.values()) {
      clearTimeout(p.timeout);
    }
    this.pendingExtensionUIs.clear();
    this.proc.kill("SIGTERM");
  }
}