import { createServerClient } from "@supabase/ssr";
import type { NextRequest } from "next/server";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export function createRouteHandlerClient(req: NextRequest) {
  return createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: () => {
        /* no-op for a one-time auth code exchange */
      },
    },
  });
}
