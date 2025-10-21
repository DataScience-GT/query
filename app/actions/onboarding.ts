"use server";

import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";

const capitalizeName = (name: string) => name.replace(/\b\w/g, (c) => c.toUpperCase()); //lol im too lazy to go back and change how i assigned them ealier 

//rewritefilenameforanything
const sanitizeFileName = (fileName: string) =>
  `${fileName.toLowerCase().replace(/[^a-z0-9.-]/g, "_")}_${Date.now()}.pdf`;

export async function submitOnboardingForm(formData: FormData) {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) throw new Error("Unauthorized");

  const updateData: any = {
    id: user.id,
    email: user.email,
    full_name: capitalizeName(formData.get("fullName") as string),
    school: formData.get("school") as string,
    major: formData.get("major") as string,
    level_of_study: formData.get("levelOfStudy") as string,
    graduation_date: formData.get("graduationYear") as string,
    github: formData.get("github") as string || null,
    linkedin: formData.get("linkedin") as string || null,
    personal_website: formData.get("personalWebsite") as string || null,
    shirt_size: formData.get("shirtSize") as string,
    food_allergies: JSON.stringify(formData.get("dietaryRestrictions")),
    skills: formData.get("skills") as string,
    motivation: formData.get("motivation") as string,
    goals: formData.get("goals") as string,
    first_hackathon: formData.get("firstHackathon") === "true",
    form_completed: true,
    updated_at: new Date().toISOString(),
  };

  const resume = formData.get("resume") as File | null;
  if (resume) {
    if (resume.type !== "application/pdf") throw new Error("Resume must be a PDF");
    if (resume.size > 10 * 1024 * 1024) throw new Error("Resume must be smaller than 10MB");

    const filePath = `${user.id}/${sanitizeFileName(resume.name)}`;
    const buffer = Buffer.from(await resume.arrayBuffer());
    const { error: uploadError } = await supabase.storage
      .from("resumes")
      .upload(filePath, buffer, { contentType: "application/pdf", cacheControl: "3600", upsert: false });

    if (uploadError) throw new Error(`Failed to upload resume: ${uploadError.message}`);
    updateData.resume_path = filePath;
  }
  const { error } = await supabase.from("profiles").upsert(updateData, { onConflict: "id" });
  if (error) throw new Error(`Failed to save profile: ${error.message}`);

  redirect("/portal");
}

export async function getUploadSession() {
  const supabase = await createClient();
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error || !session) throw new Error("Unauthorized");

  return { accessToken: session.access_token, userId: session.user.id };
}
