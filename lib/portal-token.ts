import { randomBytes } from "crypto";

/** URL-safe random token for external (institution/advisee) portal access links. */
export function generatePortalToken(): string {
  return randomBytes(24).toString("base64url");
}
