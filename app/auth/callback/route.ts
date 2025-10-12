import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url);
  const code = searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(`${origin}/`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  
  if (error) {
    console.error("Auth callback error:", error);
    return NextResponse.redirect(`${origin}/`);
  }

  // Get the user
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(`${origin}/`);
  }

  // check if they exist 
  const { data: profile } = await supabase
    .from('profiles')
    .select('form_completed')
    .eq('id', user.id)
    .single();

  const redirectUrl = profile?.form_completed 
    ? `${origin}/portal` 
    : `${origin}/onboarding`;

  return NextResponse.redirect(redirectUrl);
}