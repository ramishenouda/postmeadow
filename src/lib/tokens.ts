import "server-only";
import { randomBytes } from "node:crypto";

/** URL-safe, unguessable token (192 bits). */
export const randomToken = () => randomBytes(24).toString("base64url");
