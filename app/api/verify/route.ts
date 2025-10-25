import { createClient } from "@/utils/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const uuid = request.nextUrl.searchParams.get("uuid");

    if (!uuid) {
      return NextResponse.json(
        { success: false, message: "UUID is required" },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    const now = new Date().toISOString();
    const { data: updated, error: updateError } = await supabase
      .from("profiles")
      .update({ checked_in: true, checked_in_at: now })
      .eq("id", uuid)
      .is("checked_in", false)
      .select("full_name, school, major, checked_in_at");

    if (updateError) throw updateError;

    if (!updated || updated.length === 0) {
      const { data: existing } = await supabase
        .from("profiles")
        .select("checked_in_at")
        .eq("id", uuid)
        .single();

      return NextResponse.json(
        {
          success: false,
          message: `Already checked in at ${new Date(
            existing?.checked_in_at || ""
          ).toLocaleString()}`,
        },
        { status: 400 }
      );
    }
    const user = updated[0];

    return NextResponse.json({
      success: true,
      userName: user.full_name || "User",
      school: user.school,
      major: user.major,
      scannedAt: user.checked_in_at,
    });
  } catch (error) {
    console.error("Verification error:", error);
    return NextResponse.json(
      { success: false, message: "Verification failed" },
      { status: 500 }
    );
  }
}
