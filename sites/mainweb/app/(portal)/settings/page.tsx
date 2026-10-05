"use client";

import { useState, useEffect } from "react";
import { loginHref } from "@/lib/safe-callback";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { Check, LogOut } from "lucide-react";
import { MembershipTab } from "@/components/portal/MembershipTab";
import { ResumeSection } from "@/components/portal/ResumeSection";
import Image from "next/image";
import { trpc } from "@/lib/trpc";
import { trpcErrorMessage } from "@/lib/trpc-error";
import { useIsClient } from "@/lib/use-is-client";
import { LoadingScreen } from "@/components/portal/LoadingScreen";
import {
  page,
  pageTitle,
  pageDek,
  sectionTitle,
  sectionRule,
  meta,
  body,
  fieldLabel,
  fieldHint,
  input,
  btnPrimary,
  btnSecondary,
  tabList,
  tab as tabClass,
  status as statusClass,
} from "@/components/portal/ui";

const readOnlyInput =
  "w-full rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-3.5 py-2.5 text-[15px] text-[var(--text-muted)] cursor-not-allowed focus:outline-none";

export default function SettingsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const mounted = useIsClient();
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

  useEffect(() => {
    if (status === "unauthenticated") router.push(loginHref());
  }, [status, router]);

  // Refill the form whenever new user data arrives. Done during render rather
  // than in an effect, so the stale form never paints.
  const [filledFrom, setFilledFrom] = useState<typeof userData>(undefined);
  if (userData && userData !== filledFrom) {
    setFilledFrom(userData);
    setForm({
      name: userData.name || "",
      bio: userData.bio || "",
      website: userData.website || "",
      location: userData.location || "",
      gtEmail: userData.gtEmail || "",
    });
  }

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
    { id: "profile", label: "Profile", desc: "Name, photo, bio and resume" },
    // The club member profile: school, major, skills, interests, socials. The
    // columns and the procedures existed with no screen behind them.
    { id: "membership", label: "Membership", desc: "Status, school and links" },
    { id: "appearance", label: "Appearance", desc: "Paper or night" },
    { id: "account", label: "Account", desc: "Google sign-in and sign out" },
  ] as const;

  // Each swatch sets its own theme class so it is drawn with that edition's
  // tokens, whichever edition the page is in.
  const themes = [
    { id: "light", name: "Paper", desc: "Bone ground, near-black ink", scope: "light" },
    { id: "dark", name: "Night", desc: "Deep ground, soft ink", scope: "dark" },
  ] as const;

  return (
    <div className={page}>
      <h1 className={pageTitle}>Settings</h1>
      <p className={pageDek}>
        Your profile, club membership, theme and account.
      </p>

      <div className="mt-10 grid grid-cols-1 lg:grid-cols-4 gap-8 lg:gap-12">
        {/* Tabs: horizontal on small screens, a vertical list from lg up */}
        <div className={`${tabList} lg:hidden`}>
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id)}
              aria-current={activeTab === t.id ? "true" : undefined}
              className={tabClass(activeTab === t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <nav aria-label="Settings sections" className="hidden lg:block lg:col-span-1">
          <ul className="space-y-1">
            {tabs.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => setActiveTab(t.id)}
                  aria-current={activeTab === t.id ? "true" : undefined}
                  className={`w-full text-left border-l-2 pl-4 py-2 transition-colors ${
                    activeTab === t.id
                      ? "border-accent text-[var(--text-primary)] font-semibold"
                      : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                  }`}
                >
                  <span className="block text-[15px]">{t.label}</span>
                  <span className={`block mt-0.5 font-normal ${meta}`}>{t.desc}</span>
                </button>
              </li>
            ))}
          </ul>
        </nav>

        {/* Content */}
        <div className="lg:col-span-3 min-w-0">
          {/* Profile Tab */}
          {activeTab === "profile" && (
            <div className="space-y-8">
              <h2 className={sectionTitle}>Profile</h2>

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
                  <div className="relative h-[72px] w-[72px] rounded-full overflow-hidden border border-[var(--border-medium)] group-hover:border-accent transition-colors">
                    <Image
                      unoptimized
                      src={userData?.image || "/avatars/default.svg"}
                      alt="Avatar"
                      width={72}
                      height={72}
                      className={`object-cover h-full w-full ${isUploadingImage ? 'opacity-50' : ''}`}
                    />
                    <div className="absolute inset-0 pointer-events-none bg-[var(--ui-scrim)] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <span className="text-[var(--text-on-accent)] text-[13px] font-semibold">Edit</span>
                    </div>
                    {isUploadingImage && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-5 h-5 border-2 border-[var(--border-medium)] border-t-[var(--text-primary)] rounded-full animate-spin" />
                      </div>
                    )}
                  </div>
                  <span className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full border-2 border-[var(--bg-primary)] bg-[var(--success)] flex items-center justify-center z-10">
                    <Check className="w-3 h-3 text-[var(--text-on-accent)]" strokeWidth={2.5} />
                  </span>
                </label>
                <div className="min-w-0">
                  <p className="text-[15px] font-semibold text-[var(--text-primary)]">
                    {userData?.name || "Your name"}
                  </p>
                  <p className={`${meta} mt-0.5 break-all`}>{userData?.email}</p>
                  <p className={`${meta} mt-1.5`}>
                    Click your photo to upload a new one. JPG, PNG or WebP, up to 2 MB.
                  </p>
                </div>
              </div>

              <div className={`${sectionRule} grid grid-cols-1 md:grid-cols-2 gap-x-5 gap-y-6`}>
                {/* Display Name */}
                <div>
                  <label htmlFor="display-name" className={fieldLabel}>
                    Display name
                  </label>
                  <input
                    id="display-name"
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="Your full name"
                    className={input}
                  />
                </div>

                {/* Email (read-only from Google) */}
                <div>
                  <label htmlFor="email" className={fieldLabel}>
                    Email
                  </label>
                  <input
                    id="email"
                    type="email"
                    autoComplete="email"
                    spellCheck={false}
                    value={userData?.email || ""}
                    readOnly
                    className={readOnlyInput}
                  />
                  <p className={fieldHint}>Managed by your Google account</p>
                </div>

                {/* GT Email — editable, since most people sign in with a
                    personal Google account and the club needs the school
                    address on file. */}
                <div>
                  <label htmlFor="gt-email" className={fieldLabel}>
                    Georgia Tech email
                  </label>
                  <input
                    id="gt-email"
                    type="email"
                    autoComplete="off"
                    spellCheck={false}
                    value={form.gtEmail}
                    onChange={(e) => setForm({ ...form, gtEmail: e.target.value })}
                    placeholder="gburdell3@gatech.edu"
                    className={input}
                  />
                  <p className={fieldHint}>
                    Any gatech.edu address. Leave blank to remove.
                  </p>
                </div>

                {/* Location */}
                <div>
                  <label htmlFor="location" className={fieldLabel}>
                    Location
                  </label>
                  <input
                    id="location"
                    type="text"
                    value={form.location}
                    onChange={(e) => setForm({ ...form, location: e.target.value })}
                    placeholder="City, State"
                    className={input}
                  />
                </div>

                {/* Website */}
                <div>
                  <label htmlFor="website" className={fieldLabel}>
                    Website
                  </label>
                  <input
                    id="website"
                    type="url"
                    value={form.website}
                    onChange={(e) => setForm({ ...form, website: e.target.value })}
                    placeholder="https://yoursite.com"
                    className={input}
                  />
                </div>
              </div>

              {/* Bio */}
              <div>
                <label htmlFor="bio" className={fieldLabel}>
                  Bio
                </label>
                <textarea
                  id="bio"
                  value={form.bio}
                  onChange={(e) => setForm({ ...form, bio: e.target.value })}
                  placeholder="A short bio about yourself…"
                  rows={4}
                  className={`${input} resize-none`}
                />
              </div>

              <ResumeSection />

              {updateProfile.error && (
                <p role="alert" className="text-[13px] text-[var(--danger)]">
                  {trpcErrorMessage(
                    updateProfile.error,
                    "Could not save your profile. Check your connection and try again.",
                  )}
                </p>
              )}

              {/* Save Button */}
              <div className="border-t border-[var(--border-subtle)] pt-6">
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={isSaving}
                  className={btnPrimary}
                >
                  {isSaving ? (
                    <>
                      <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" aria-hidden />
                      <span className="sr-only">Saving</span>
                    </>
                  ) : saved ? (
                    <><Check className="w-4 h-4" strokeWidth={1.75} /> Saved</>
                  ) : (
                    "Save profile"
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Membership Tab */}
          {activeTab === "membership" && <MembershipTab />}

          {/* Appearance Tab */}
          {activeTab === "appearance" && (
            <div className="space-y-6">
              <div>
                <h2 className={sectionTitle}>Appearance</h2>
                <p className={`${body} mt-2`}>
                  Choose the edition the portal is printed in.
                </p>
              </div>

              {mounted && (
                <div
                  role="radiogroup"
                  aria-label="Theme"
                  className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-xl"
                >
                  {themes.map((t) => {
                    const selected = theme === t.id;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => setTheme(t.id)}
                        className={`text-left rounded-[var(--radius-md)] border p-3 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                          selected
                            ? "border-accent"
                            : "border-[var(--border-subtle)] hover:border-[var(--border-hover)]"
                        }`}
                      >
                        <div
                          className={`${t.scope} rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[var(--bg-primary)] p-3 space-y-2`}
                          aria-hidden
                        >
                          <div className="h-2.5 w-2/3 rounded-full bg-[var(--text-primary)]" />
                          <div className="h-1.5 w-full rounded-full bg-[var(--text-subtle)] opacity-50" />
                          <div className="h-1.5 w-4/5 rounded-full bg-[var(--text-subtle)] opacity-50" />
                          <div className="h-3 w-12 rounded-[var(--radius-sm)] bg-[var(--accent)]" />
                        </div>
                        <div className="mt-3 flex items-baseline justify-between gap-3">
                          <span className="text-[15px] font-semibold text-[var(--text-primary)]">
                            {t.name}
                          </span>
                          {selected && (
                            <span className={statusClass("accent")}>In use</span>
                          )}
                        </div>
                        <span className={`block mt-0.5 ${meta}`}>{t.desc}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Account Tab */}
          {activeTab === "account" && (
            <div className="space-y-6">
              <h2 className={sectionTitle}>Account</h2>

              <div className="border-t border-[var(--border-subtle)]">
                {/* Linked Google */}
                <div className="flex flex-wrap items-center justify-between gap-3 py-4 border-b border-[var(--border-subtle)]">
                  <div className="min-w-0">
                    <p className="text-[15px] font-semibold text-[var(--text-primary)]">Google account</p>
                    <p className={`${meta} mt-0.5 break-all`}>{session.user?.email}</p>
                  </div>
                  <span className={statusClass("success")}>Connected</span>
                </div>

                {/* User ID */}
                <div className="py-4 border-b border-[var(--border-subtle)]">
                  <p className="text-[15px] font-semibold text-[var(--text-primary)]">User ID</p>
                  <p className="mt-0.5 text-[13px] font-mono text-[var(--text-subtle)] break-all">{userData?.id || "…"}</p>
                </div>
              </div>

              {/* Sign Out */}
              <button
                type="button"
                onClick={() => signOut({ callbackUrl: "/login" })}
                className={btnSecondary}
              >
                <LogOut className="w-4 h-4" strokeWidth={1.75} /> Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
