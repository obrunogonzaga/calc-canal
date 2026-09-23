import { createAuthClient } from "better-auth/client";
import { inferAdditionalFields } from "better-auth/client/plugins";

import type { LiquidoAuth } from "@/lib/server/auth";

export const authClient = createAuthClient({
  basePath: "/api/auth",
  plugins: [inferAdditionalFields<LiquidoAuth>()],
});
