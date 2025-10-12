"use server";

import { createClient } from "@/utils/supabase/server";

interface OnboardingFormData {
  fullName: string;
  school: string;
  major: string;
  levelOfStudy: string;
  graduationYear: string;
  github: string;
  linkedin: string;
  shirtSize: string;
  dietaryRestrictions: string;
  skills: string;
  agreeToCodeOfConduct: boolean;
}

export async function submitOnboardingForm(formData: OnboardingFormData) {
  const supabase = await createClient();
  
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  
  console.log("=== ONBOARDING SUBMISSION DEBUG ===");
  console.log("User:", user?.id, user?.email);
  console.log("User Error:", userError);
  
  if (userError || !user) {
    console.log("ERROR: No user found");
    return { success: false, error: "Unauthorized" };
  }

  const { data: existingProfile, error: fetchError } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();
  
  console.log("Existing Profile:", existingProfile);
  console.log("Fetch Error:", fetchError);

  // update
  const updateData = {
    full_name: formData.fullName,
    school: formData.school,
    major: formData.major,
    level_of_study: formData.levelOfStudy,
    graduation_year: formData.graduationYear,
    github: formData.github,
    linkedin: formData.linkedin,
    shirt_size: formData.shirtSize,
    dietary_restrictions: formData.dietaryRestrictions,
    skills: formData.skills,
    form_completed: true,
    updated_at: new Date().toISOString(),
  };

  console.log("Update Data:", updateData);

  const { data: updateResult, error } = await supabase
    .from("profiles")
    .update(updateData)
    .eq("id", user.id)
    .select();

  console.log("Update Result:", updateResult);
  console.log("Update Error:", error);

  if (error) {
    console.error("Error updating profile:", error);
    return { success: false, error: error.message };
  }

  return { success: true };
}