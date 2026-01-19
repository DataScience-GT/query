import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {
    DATABASE_URL: z.string().url().optional(),
  },
  client: {},
  runtimeEnv: process.env as Record<string, string | undefined>,
});
