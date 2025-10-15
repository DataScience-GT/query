"use server";

import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";

function sanitizeFileName(fileName: string) {
  const timestamp = Date.now();
  const safeName = fileName.toLowerCase().replace(/[^a-z0-9.-]/g, "_");
  return `${safeName}_${timestamp}.pdf`;
}

export async function submitOnboardingForm(formData: FormData) {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) throw new Error("Unauthorized");

  let resumePath: string | null = null;
  const resume = formData.get("resume") as File | null;

  if (resume) {
    if (resume.type !== "application/pdf") throw new Error("Resume must be a PDF");
    if (resume.size > 5 * 1024 * 1024) throw new Error("Resume must be smaller than 5MB");

    const buffer = Buffer.from(await resume.arrayBuffer());
    const fileName = sanitizeFileName(resume.name);

    const filePath = `${user.id}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from("resumes")
      .upload(filePath, buffer, {
        contentType: "application/pdf",
        upsert: false,
      });

    if (uploadError) throw new Error(uploadError.message);

    resumePath = filePath;
  }

  const updateData = {
    id: user.id,
    email: user.email,
    full_name: formData.get("fullName") as string,
    school: formData.get("school") as string,
    major: formData.get("major") as string,
    level_of_study: formData.get("levelOfStudy") as string,
    graduation_year: formData.get("graduationYear") as string,
    github: formData.get("github") as string,
    linkedin: formData.get("linkedin") as string,
    shirt_size: formData.get("shirtSize") as string,
    dietary_restrictions: formData.get("dietaryRestrictions") as string,
    skills: formData.get("skills") as string,
    resume_path: resumePath,
    form_completed: true,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase.from("profiles").upsert(updateData, { onConflict: "id" });
  if (error) throw new Error(error.message);

  redirect("/portal");
}

export async function getResumeUrl(resumePath: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.storage.from("resumes").createSignedUrl(resumePath, 3600);
  if (error) throw new Error(error.message);
  return data.signedUrl;
}

export async function getPublicResumeUrl(resumePath: string) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return `${supabaseUrl}/storage/v1/object/public/${resumePath}`;
}
