import { type IncomingMessage } from "node:http";

const AUTH_TOKEN = process.env.PI_REMOTE_TOKEN ?? "change-me-in-production";

export function authenticate(req: IncomingMessage): boolean {
  const auth = req.headers.authorization ?? "";
  const [, token] = auth.split(" ");
  return token === AUTH_TOKEN;
}

export function getAuthError(): object {
  return { type: "error", message: "Unauthorized. Provide Bearer token in Authorization header." };
}