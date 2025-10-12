import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import QRCodeComponent from "@/components/QRCodeComponent";

export default async function PortalPage() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    redirect("/");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  // assgin a user to the uuid 
  const uuid = user.id;

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <h1 className="text-3xl font-bold text-gray-800">
        Welcome, {profile?.full_name || "User"}
      </h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-white p-6 rounded-xl shadow-md">
        <p><span className="font-semibold text-gray-700">Email:</span> {user.email}</p>
        <p><span className="font-semibold text-gray-700">School:</span> {profile?.school || "-"}</p>
        <p><span className="font-semibold text-gray-700">Major:</span> {profile?.major || "-"}</p>
        <p><span className="font-semibold text-gray-700">Level of Study:</span> {profile?.level_of_study || "-"}</p>
        <p><span className="font-semibold text-gray-700">Graduation Year:</span> {profile?.graduation_year || "-"}</p>
        {profile?.github && <p><span className="font-semibold text-gray-700">GitHub:</span> {profile.github}</p>}
        {profile?.linkedin && <p><span className="font-semibold text-gray-700">LinkedIn:</span> {profile.linkedin}</p>}
        {profile?.shirt_size && <p><span className="font-semibold text-gray-700">Shirt Size:</span> {profile.shirt_size}</p>}
        {profile?.dietary_restrictions && (
          <p className="col-span-full"><span className="font-semibold text-gray-700">Dietary Restrictions:</span> {profile.dietary_restrictions}</p>
        )}
        {profile?.skills && (
          <p className="col-span-full"><span className="font-semibold text-gray-700">Skills:</span> {profile.skills}</p>
        )}
      </div>

      {/* QR Code Section */}
      <div className="mt-8 p-6 bg-white rounded-xl shadow-md text-center">
        <h2 className="text-xl font-semibold mb-4 text-gray-700">Your Check-in QR Code</h2>
        <QRCodeComponent value={uuid} />
        <p className="mt-4 text-gray-500 text-sm">Show this QR code at check-in</p>
        <p className="mt-1 text-gray-400 text-xs font-mono break-all">{uuid}</p>
      </div>
    </div>
  );
}