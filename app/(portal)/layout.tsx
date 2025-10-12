import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import SignOutButton from "@/components/SignOutButton";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();

  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    redirect("/");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("form_completed, full_name")
    .eq("id", user.id)
    .single();

  if (!profile?.form_completed) {
    redirect("/onboarding");
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex justify-between items-center">
          <div>
            <h1 className="text-2xl md:text-3xl font-extrabold text-purple-700">
              Portal Dashboard
            </h1>
            <p className="text-gray-500 mt-1 text-sm md:text-base">
              Welcome back, <span className="font-medium">{profile?.full_name || user.email}</span>
            </p>
          </div>
          <SignOutButton />
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        {children}
      </main>
    </div>
  );
}
