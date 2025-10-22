import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/middleware";

export async function middleware(req: NextRequest) {
  const url = req.nextUrl.clone();

  const { supabase, supabaseResponse } = createClient(req);

  const { data: { user }, error } = await supabase.auth.getUser();

  // If user is NOT logged in
  if (error || !user) {
    if (url.pathname.startsWith("/portal") || url.pathname.startsWith("/onboarding")) {
      url.pathname = "/";
      return NextResponse.redirect(url);
    }
  } else {
    // Check if they've completed onboarding when accessing /portal
    if (url.pathname.startsWith("/portal")) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('form_completed')
        .eq('id', user.id)
        .single();

      if (!profile?.form_completed) {
        url.pathname = "/onboarding";
        return NextResponse.redirect(url);
      }
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/portal/:path*",
    "/onboarding",
    "/auth/callback",
  ],
};
