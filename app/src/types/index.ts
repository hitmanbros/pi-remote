export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "tool" | "system";
  text: string;
  thinking?: string;
  pending?: boolean;
  createdAt: number;
}

export interface HostConfig {
  id: string;
  name: string;
  serverUrl: string;
  token: string;
  sessionId?: string;
  cwd?: string;
}

export interface AppSettings {
  hosts: HostConfig[];
  activeHostId: string | null;
}

export interface ExtensionUIRequest {
  type: "extension_ui_request";
  id: string;
  method: "select" | "confirm" | "input" | "editor" | "notify" | "setStatus" | "setWidget" | "setTitle" | "set_editor_text";
  title?: string;
  message?: string;
  options?: string[];
  placeholder?: string;
  prefill?: string;
  notifyType?: "info" | "warning" | "error";
  statusKey?: string;
  statusText?: string;
  widgetKey?: string;
  widgetLines?: string[];
  text?: string;
  timeout?: number;
}

export interface AgentEvent {
  type: string;
  [key: string]: unknown;
}
