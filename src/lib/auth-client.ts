"use client";

import { createAuthClient } from "better-auth/react";
import { magicLinkClient } from "better-auth/client/plugins";

// Same-origin: no baseURL needed.
export const authClient = createAuthClient({
  plugins: [magicLinkClient()],
});
