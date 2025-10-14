import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";

export default async function OnboardingLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();

  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    redirect("/");
  }

  //else
  return (
    <div className="min-h-screen relative overflow-hidden bg-gradient-to-br from-pink-200 via-purple-200 to-yellow-200">
      <div className="absolute top-10 left-5 w-64 h-64 bg-gradient-to-tr from-purple-400 via-pink-400 to-yellow-300 rounded-full mix-blend-multiply filter blur-3xl opacity-50 animate-pulse"></div>
      <div className="absolute bottom-16 right-5 w-80 h-80 bg-gradient-to-tr from-pink-400 via-orange-300 to-purple-300 rounded-full mix-blend-multiply filter blur-3xl opacity-50 animate-spin-slow"></div>
      <div className="absolute top-1/3 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-72 h-72 bg-gradient-to-r from-yellow-300 via-pink-400 to-purple-400 rounded-full mix-blend-multiply filter blur-2xl opacity-60 animate-bounce-slow"></div>
      <div className="relative z-10 p-10 rounded-3xl bg-white/80 backdrop-blur-md shadow-xl max-w-4xl mx-auto mt-20">
        {children}
      </div>
    </div>
  );
}