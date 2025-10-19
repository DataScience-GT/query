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
    // Increased to 10MB to allow for larger resumes
    if (resume.size > 10 * 1024 * 1024) throw new Error("Resume must be smaller than 10MB");

    const buffer = Buffer.from(await resume.arrayBuffer());
    const fileName = sanitizeFileName(resume.name);
    const filePath = `${user.id}/${fileName}`;

    // Use standard upload with proper error handling
    const { error: uploadError } = await supabase.storage
      .from("resumes")
      .upload(filePath, buffer, {
        contentType: "application/pdf",
        cacheControl: "3600",
        upsert: false,
      });

    if (uploadError) {
      console.error("Upload error:", uploadError);
      throw new Error(`Failed to upload resume: ${uploadError.message}`);
    }

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
  if (error) {
    console.error("Database error:", error);
    throw new Error(`Failed to save profile: ${error.message}`);
  }

  redirect("/portal");
}

export async function getResumeUrl(resumePath: string) {
  const supabase = await createClient();
  
  const {
    data: { user },
  } = await supabase.auth.getUser();
  
  if (!user) throw new Error("Unauthorized");

  // Verify the resume belongs to the user
  if (!resumePath.startsWith(`${user.id}/`)) {
    throw new Error("Unauthorized access to resume");
  }

  // Create a signed URL that expires in 1 hour (3600 seconds)
  const { data, error } = await supabase.storage
    .from("resumes")
    .createSignedUrl(resumePath, 3600);
    
  if (error) throw new Error(error.message);
  return data.signedUrl;
}

// Remove getPublicResumeUrl - no longer needed for security
// Delete or deprecate this function

export async function getPublicResumeUrl(resumePath: string) {
  const supabase = await createClient();
  
  // Use Supabase's built-in method to get public URL
  const { data } = supabase.storage
    .from("resumes")
    .getPublicUrl(resumePath);
  
  return data.publicUrl;
}

// Alternative: Use signed URLs (works for private buckets)
export async function getResumeDownloadUrl(resumePath: string) {
  const supabase = await createClient();
  
  const {
    data: { user },
  } = await supabase.auth.getUser();
  
  if (!user) throw new Error("Unauthorized");

  // Verify the resume belongs to the user
  if (!resumePath.startsWith(`${user.id}/`)) {
    throw new Error("Unauthorized access to resume");
  }

  const { data, error } = await supabase.storage
    .from("resumes")
    .createSignedUrl(resumePath, 3600);
    
  if (error) {
    console.error("Error creating signed URL:", error);
    throw new Error(error.message);
  }
  
  return data.signedUrl;
}

// New function to get session for client-side resumable uploads
export async function getUploadSession() {
  const supabase = await createClient();
  
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();
  
  if (error || !session) throw new Error("Unauthorized");
  
  return {
    accessToken: session.access_token,
    userId: session.user.id,
  };
}