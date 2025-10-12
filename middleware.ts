import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/middleware";

export async function middleware(req: NextRequest) {
  const url = req.nextUrl.clone();

  // Create a supabase client tied to this request
  const { supabase, supabaseResponse } = createClient(req);

  // Use getUser() instead of getSession() for security
  const { data: { user }, error } = await supabase.auth.getUser();

  // If user is NOT logged in
  if (error || !user) {
    // Redirect away from protected routes
    if (url.pathname.startsWith("/portal") || url.pathname.startsWith("/onboarding")) {
      url.pathname = "/";
      return NextResponse.redirect(url);
    }
  } else {
    // User IS logged in
    // Check if they've completed onboarding when accessing /portal
    if (url.pathname.startsWith("/portal")) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('form_completed')
        .eq('id', user.id)
        .single();

      // If form not completed, redirect to onboarding
      if (!profile?.form_completed) {
        url.pathname = "/onboarding";
        return NextResponse.redirect(url);
      }
    }
  }

  // Continue normally
  return supabaseResponse;
}

export const config = {
  matcher: [
    "/portal/:path*",
    "/onboarding",
    "/auth/callback",
  ],
};