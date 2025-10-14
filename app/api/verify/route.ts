import { createClient } from "@/utils/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const uuid = searchParams.get("uuid");

    if (!uuid) {
      return NextResponse.json(
        { success: false, message: "UUID is required" },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Get user profile
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", uuid)
      .single();

    if (profileError || !profile) {
      return NextResponse.json(
        { success: false, message: "User not found" },
        { status: 404 }
      );
    }

    // Check if already checked in
    if (profile.checked_in) {
      return NextResponse.json(
        { 
          success: false, 
          message: `Already checked in at ${new Date(profile.checked_in_at).toLocaleString()}` 
        },
        { status: 400 }
      );
    }

    // Mark as checked in
    const { error: updateError } = await supabase
      .from("profiles")
      .update({ 
        checked_in: true, 
        checked_in_at: new Date().toISOString() 
      })
      .eq("id", uuid);

    if (updateError) {
      throw updateError;
    }

    return NextResponse.json({
      success: true,
      userName: profile.full_name || "User",
      school: profile.school,
      major: profile.major,
      scannedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Verification error:", error);
    return NextResponse.json(
      { success: false, message: "Verification failed" },
      { status: 500 }
    );
  }
}