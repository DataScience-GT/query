"use client";

import { useState, useEffect } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import {
  UserCircle,
  Sun,
  Moon,
  Save,
  LogOut,
  MapPin,
  Globe,
  FileText,
  User,
  CheckCircle,
  Mail,
  GraduationCap,
  Link as LinkIcon,
  CreditCard,
} from "lucide-react";
import { MembershipTab } from "@/components/portal/MembershipTab";
import Image from "next/image";
import { trpc } from "@/lib/trpc";
import { trpcErrorMessage } from "@/lib/trpc-error";
import { LiquidGlass } from "@/components/portal/LiquidGlass";
import { LoadingScreen } from "@/components/portal/LoadingScreen";

export default function SettingsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<
    "profile" | "membership" | "appearance" | "account"
  >("profile");
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);

  const { data: userData } = trpc.user.me.useQuery(undefined, { enabled: !!session });
  const updateProfile = trpc.user.updateProfile.useMutation();
  const updateProfileImage = trpc.user.updateProfileImage.useMutation();
  const utils = trpc.useUtils();

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingImage(true);
    
    try {
      // 1. Read file as Data URL
      const reader = new FileReader();
      reader.onloadend = async () => {
        try {
          const originalBase64 = reader.result as string;
          
          // 2. Client-side compression via Canvas to avoid overkilling the database
          const img = new window.Image();
          img.src = originalBase64;
          
          await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = reject;
          });

          // Max dimensions for an avatar
          const MAX_SIZE = 400;
          let width = img.width;
          let height = img.height;

          if (width > height && width > MAX_SIZE) {
            height *= MAX_SIZE / width;
            width = MAX_SIZE;
          } else if (height > MAX_SIZE) {
            width *= MAX_SIZE / height;
            height = MAX_SIZE;
          }

          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          
          const ctx = canvas.getContext("2d");
          if (!ctx) throw new Error("Could not get canvas context");
          
          ctx.drawImage(img, 0, 0, width, height);
          
          // Compress to WebP at 80% quality
          const compressedBase64 = canvas.toDataURL("image/webp", 0.8);

          // 3. Upload the tiny payload
          await updateProfileImage.mutateAsync({ base64Image: compressedBase64 });
          await utils.user.me.invalidate();
        } catch (err) {
          console.error("Failed to process and upload image:", err);
          // Optional: show a toast notification here
        } finally {
          setIsUploadingImage(false);
        }
      };
      
      reader.onerror = () => {
        console.error("FileReader failed");
        setIsUploadingImage(false);
      };

      reader.readAsDataURL(file);
    } catch (e) {
      console.error(e);
      setIsUploadingImage(false);
    }
  };

  const [form, setForm] = useState({
    name: "",
    bio: "",
    website: "",
    location: "",
    gtEmail: "",
  });

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  useEffect(() => {
    if (userData) {
      setForm({
        name: userData.name || "",
        bio: userData.bio || "",
        website: userData.website || "",
        location: userData.location || "",
        gtEmail: userData.gtEmail || "",
      });
    }
  }, [userData]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      // Sent as-is, not `|| undefined`: an emptied field means "clear it", and
      // collapsing it to undefined made the server skip it while the UI still
      // reported a save.
      await updateProfile.mutateAsync({
        name: form.name || undefined,
        bio: form.bio,
        website: form.website,
        location: form.location,
        gtEmail: form.gtEmail.trim(),
      });
      await utils.user.me.invalidate();
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      console.error(e);
    } finally {
      setIsSaving(false);
    }
  };

  if (status === "loading") return <LoadingScreen message="Loading settings…" />;
  if (!session) return null;

  const tabs = [
    { id: "profile", label: "Profile", icon: UserCircle, desc: "Personal info & bio" },
    // The club member profile: school, major, skills, interests, socials. The
    // columns and the procedures existed with no screen behind them.
    { id: "membership", label: "Membership", icon: CreditCard, desc: "Club profile & status" },
    { id: "appearance", label: "Appearance", icon: Sun, desc: "Theme & display" },
    { id: "account", label: "Account", icon: Mail, desc: "Account & sign out" },
  ] as const;

  return (
    <div className="min-h-screen bg-[var(--bg-tertiary)]">
      {/* Ambient glow */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute top-[-20%] right-[5%] w-[500px] h-[500px] bg-accent/5 blur-[200px] rounded-full" />
        <div className="absolute bottom-[-10%] left-[10%] w-[400px] h-[400px] bg-indigo-600/5 blur-[180px] rounded-full" />
      </div>

      <div className="relative z-10 max-w-5xl mx-auto px-6 py-10 space-y-8">
        {/* Header */}
        <div>
          <p className="text-[10px] font-mono text-accent/60 uppercase tracking-[0.2em] mb-2 flex items-center gap-2">
            <UserCircle className="w-3 h-3" /> Personal Settings
          </p>
          <h1 className="text-3xl font-black text-[var(--text-primary)] tracking-wider font-oswald uppercase">
            My Settings
          </h1>
          <p className="text-sm text-[var(--text-muted)] mt-1">
            Manage your personal profile, appearance, and account preferences.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Sidebar Tabs */}
          <div className="lg:col-span-1 space-y-2">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full flex flex-col items-start p-4 rounded-sm transition-ui duration-200 ${
                  activeTab === tab.id
                    ? "bg-accent/10 border border-accent/25 text-[var(--text-primary)]"
                    : "bg-[var(--bg-card)] border border-[var(--border-subtle)] text-[var(--text-muted)] hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-medium)]"
                }`}
              >
                <div className="flex items-center gap-3 w-full">
                  <tab.icon className={`w-4 h-4 ${activeTab === tab.id ? "text-accent" : "text-[var(--text-subtle)]"}`} />
                  <span className="font-bold text-sm">{tab.label}</span>
                </div>
                <span className="text-xs text-[var(--text-subtle)] mt-1.5 ml-7">{tab.desc}</span>
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="lg:col-span-3">
            <LiquidGlass className="p-6 md:p-8 relative overflow-hidden">
              {/* Profile Tab */}
              {activeTab === "profile" && (
                <div className="space-y-8 animate-in fade-in duration-200">
                  {/* Avatar */}
                  <div className="flex items-center gap-5">
                    <label htmlFor="avatar-upload" className="relative flex-shrink-0 cursor-pointer group">
                      <input
                      id="avatar-upload"
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className="hidden"
                        onChange={handleImageUpload}
                        disabled={isUploadingImage}
                      />
                      <div className="relative h-[72px] w-[72px] rounded-full overflow-hidden border-2 border-[var(--border-medium)] group-hover:border-accent transition-colors">
                        <Image
                          src={userData?.image || "/avatars/default.svg"}
                          alt="Avatar"
                          width={72}
                          height={72}
                          className={`object-cover h-full w-full ${isUploadingImage ? 'opacity-50' : ''}`}
                        />
                        <div className="absolute inset-0 pointer-events-none bg-[var(--ui-scrim)] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                          <span className="text-[var(--text-on-accent)] text-xs font-bold">Edit</span>
                        </div>
                        {isUploadingImage && (
                          <div className="absolute inset-0 flex items-center justify-center">
                            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-sm animate-spin" />
                          </div>
                        )}
                      </div>
                      <span className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full border-2 border-[var(--bg-card)] bg-emerald-500 flex items-center justify-center z-10">
                        <CheckCircle className="w-2.5 h-2.5 text-[var(--text-on-accent)]" />
                      </span>
                    </label>
                    <div>
                      <p className="text-sm font-bold text-[var(--text-primary)]">
                        {userData?.name || "Your Name"}
                      </p>
                      <p className="text-xs text-[var(--text-muted)] mt-0.5">{userData?.email}</p>
                      <p className="text-[10px] text-[var(--text-subtle)] mt-1.5 font-mono">
                        Click on your avatar to upload a new profile picture. Max 2MB (jpg/png/webp).
                      </p>
                    </div>
                  </div>

                  <div className="border-t border-[var(--border-subtle)] pt-6 grid grid-cols-1 md:grid-cols-2 gap-5">
                    {/* Display Name */}
                    <div className="space-y-2">
                      <label htmlFor="display-name" className="flex items-center gap-2 text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest">
                        <User className="w-3.5 h-3.5" /> Display Name
                      </label>
                      <input
                        id="display-name"
                        type="text"
                        value={form.name}
                        onChange={(e) => setForm({ ...form, name: e.target.value })}
                        placeholder="Your full name"
                        className="w-full bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-sm px-4 py-3 text-[var(--text-primary)] placeholder:text-[var(--text-subtle)] focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition-ui text-sm"
                      />
                    </div>

                    {/* Email (read-only from Google) */}
                    <div className="space-y-2">
                      <label htmlFor="email" className="flex items-center gap-2 text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest">
                        <Mail className="w-3.5 h-3.5" /> Email
                      </label>
                      <input
                        id="email"
                        type="email"
                        autoComplete="email"
                        spellCheck={false}
                        value={userData?.email || ""}
                        readOnly
                        className="w-full bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-sm px-4 py-3 text-[var(--text-muted)] cursor-not-allowed text-sm"
                      />
                      <p className="text-[10px] text-[var(--text-subtle)] font-mono">
                        Managed by your Google account
                      </p>
                    </div>

                    {/* GT Email — editable, since most people sign in with a
                        personal Google account and the club needs the school
                        address on file. */}
                    <div className="space-y-2">
                      <label htmlFor="gt-email" className="flex items-center gap-2 text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest">
                        <GraduationCap className="w-3.5 h-3.5" /> Georgia Tech Email
                      </label>
                      <input
                        id="gt-email"
                        type="email"
                        autoComplete="off"
                        spellCheck={false}
                        value={form.gtEmail}
                        onChange={(e) => setForm({ ...form, gtEmail: e.target.value })}
                        placeholder="gburdell3@gatech.edu"
                        className="w-full bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-sm px-4 py-3 text-[var(--text-primary)] placeholder:text-[var(--text-subtle)] focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition-ui text-sm"
                      />
                      <p className="text-[10px] text-[var(--text-subtle)] font-mono">
                        Any gatech.edu address. Leave blank to remove.
                      </p>
                    </div>

                    {/* Location */}
                    <div className="space-y-2">
                      <label htmlFor="location" className="flex items-center gap-2 text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest">
                        <MapPin className="w-3.5 h-3.5" /> Location
                      </label>
                      <input
                        id="location"
                        type="text"
                        value={form.location}
                        onChange={(e) => setForm({ ...form, location: e.target.value })}
                        placeholder="City, State"
                        className="w-full bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-sm px-4 py-3 text-[var(--text-primary)] placeholder:text-[var(--text-subtle)] focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition-ui text-sm"
                      />
                    </div>

                    {/* Website */}
                    <div className="space-y-2">
                      <label htmlFor="website" className="flex items-center gap-2 text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest">
                        <Globe className="w-3.5 h-3.5" /> Website
                      </label>
                      <input
                        id="website"
                        type="url"
                        value={form.website}
                        onChange={(e) => setForm({ ...form, website: e.target.value })}
                        placeholder="https://yoursite.com"
                        className="w-full bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-sm px-4 py-3 text-[var(--text-primary)] placeholder:text-[var(--text-subtle)] focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition-ui text-sm"
                      />
                    </div>
                  </div>

                  {/* Bio */}
                  <div className="space-y-2">
                    <label htmlFor="bio" className="flex items-center gap-2 text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest">
                      <FileText className="w-3.5 h-3.5" /> Bio
                    </label>
                    <textarea
                      id="bio"
                      value={form.bio}
                      onChange={(e) => setForm({ ...form, bio: e.target.value })}
                      placeholder="A short bio about yourself…"
                      rows={4}
                      className="w-full bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-sm px-4 py-3 text-[var(--text-primary)] placeholder:text-[var(--text-subtle)] focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition-ui text-sm resize-none"
                    />
                  </div>

                  {updateProfile.error && (
                    <div className="px-4 py-3 rounded-sm bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                      {trpcErrorMessage(
                        updateProfile.error,
                        "Could not save your profile.",
                      )}
                    </div>
                  )}

                  {/* Save Button */}
                  <div className="flex justify-end pt-2">
                    <button
                      onClick={handleSave}
                      disabled={isSaving}
                      className="flex items-center gap-2 px-6 py-3 bg-accent text-[var(--text-on-accent)] rounded-sm font-bold text-sm uppercase tracking-widest hover:bg-accent-secondary transition-ui disabled:opacity-50"
                    >
                      {isSaving ? (
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-sm animate-spin" />
                      ) : saved ? (
                        <><CheckCircle className="w-4 h-4" /> Saved!</>
                      ) : (
                        <><Save className="w-4 h-4" /> Save Profile</>
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* Membership Tab */}
              {activeTab === "membership" && <MembershipTab />}

              {/* Appearance Tab */}
              {activeTab === "appearance" && (
                <div className="space-y-6 animate-in fade-in duration-200">
                  <h3 className="text-base font-bold text-[var(--text-primary)] flex items-center gap-2 border-b border-[var(--border-subtle)] pb-4">
                    <Sun className="w-4 h-4 text-accent" /> Theme
                  </h3>

                  {mounted && (
                    <div className="grid grid-cols-2 gap-4">
                      {/* Dark Mode */}
                      <button
                        onClick={() => setTheme("dark")}
                        className={`group relative flex flex-col items-center gap-3 p-6 rounded-sm border-2 transition-ui duration-200 ${
                          theme === "dark"
                            ? "border-accent bg-accent/10"
                            : "border-[var(--border-subtle)] bg-[var(--bg-secondary)] hover:border-[var(--border-medium)]"
                        }`}
                      >
                        <Moon className={`w-8 h-8 ${theme === "dark" ? "text-accent" : "text-[var(--text-subtle)]"}`} />
                        <div className="text-center">
                          <p className={`text-sm font-bold ${theme === "dark" ? "text-accent" : "text-[var(--text-primary)]"}`}>
                            Dark Mode
                          </p>
                          <p className="text-xs text-[var(--text-muted)] mt-0.5">
                            Dark backgrounds, easy on the eyes
                          </p>
                        </div>
                        {theme === "dark" && (
                          <span className="absolute top-3 right-3 w-5 h-5 rounded-full bg-accent flex items-center justify-center">
                            <CheckCircle className="w-3 h-3 text-[var(--text-on-accent)]" />
                          </span>
                        )}
                      </button>

                      {/* Light Mode */}
                      <button
                        onClick={() => setTheme("light")}
                        className={`group relative flex flex-col items-center gap-3 p-6 rounded-sm border-2 transition-ui duration-200 ${
                          theme === "light"
                            ? "border-accent bg-accent/10"
                            : "border-[var(--border-subtle)] bg-[var(--bg-secondary)] hover:border-[var(--border-medium)]"
                        }`}
                      >
                        <Sun className={`w-8 h-8 ${theme === "light" ? "text-accent" : "text-[var(--text-subtle)]"}`} />
                        <div className="text-center">
                          <p className={`text-sm font-bold ${theme === "light" ? "text-accent" : "text-[var(--text-primary)]"}`}>
                            Light Mode
                          </p>
                          <p className="text-xs text-[var(--text-muted)] mt-0.5">
                            Crisp whites, vibrant accent colors
                          </p>
                        </div>
                        {theme === "light" && (
                          <span className="absolute top-3 right-3 w-5 h-5 rounded-full bg-accent flex items-center justify-center">
                            <CheckCircle className="w-3 h-3 text-[var(--text-on-accent)]" />
                          </span>
                        )}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Account Tab */}
              {activeTab === "account" && (
                <div className="space-y-6 animate-in fade-in duration-200">
                  <h3 className="text-base font-bold text-[var(--text-primary)] flex items-center gap-2 border-b border-[var(--border-subtle)] pb-4">
                    <Mail className="w-4 h-4 text-accent" /> Account Info
                  </h3>

                  {/* Linked Google */}
                  <div className="flex items-center justify-between p-4 rounded-sm bg-[var(--bg-secondary)] border border-[var(--border-subtle)]">
                    <div className="flex items-center gap-4">
                      <div className="p-2.5 rounded-sm bg-[var(--bg-elevated)] border border-[var(--border-subtle)]">
                        <LinkIcon className="w-5 h-5 text-accent" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-[var(--text-primary)]">Google Account</p>
                        <p className="text-xs text-[var(--text-muted)] mt-0.5">{session.user?.email}</p>
                      </div>
                    </div>
                    <span className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-emerald-500 bg-emerald-500/10 border border-emerald-500/20 rounded-sm">
                      Connected
                    </span>
                  </div>

                  {/* User ID */}
                  <div className="p-4 rounded-sm bg-[var(--bg-secondary)] border border-[var(--border-subtle)] space-y-1">
                    <p className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest">User ID</p>
                    <p className="text-sm font-mono text-[var(--text-subtle)] break-all">{userData?.id || "…"}</p>
                  </div>

                  {/* Sign Out */}
                  <div className="pt-2 border-t border-[var(--border-subtle)]">
                    <button
                      onClick={() => signOut({ callbackUrl: "/login" })}
                      className="flex items-center gap-3 px-5 py-3 rounded-sm border border-[var(--border-medium)] bg-[var(--bg-secondary)] text-[var(--text-muted)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)] hover:border-[var(--border-hover)] transition-ui text-sm font-bold uppercase tracking-widest"
                    >
                      <LogOut className="w-4 h-4" /> Sign Out
                    </button>
                  </div>
                </div>
              )}
            </LiquidGlass>
          </div>
        </div>
      </div>
    </div>
  );
}
