import { createClient } from "@supabase/supabase-js";
import { Database } from "@/types/supabase";

export const createRouteHandlerClient = () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!supabaseKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY is required in env");

  return createClient<Database>(supabaseUrl, supabaseKey);
};
