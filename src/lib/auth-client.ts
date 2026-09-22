import { createAuthClient } from "better-auth/client";
import { inferAdditionalFields } from "better-auth/client/plugins";

import type { PrecoProntoAuth } from "@/lib/server/auth";

export const authClient = createAuthClient({
  basePath: "/api/auth",
  plugins: [inferAdditionalFields<PrecoProntoAuth>()],
});
