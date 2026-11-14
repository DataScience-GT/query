import React, { useState } from "react";
import type { FormEvent } from "react";
import { judgeInterestUrl } from "@/lib/links";

type Status = "idle" | "sending" | "done" | "error";

// 16px text so iOS does not zoom the page on focus.
const field =
  "block w-full h-12 rounded-lg border border-line bg-raised px-3 font-sans text-[16px] text-ink placeholder:text-ink-3";
const area =
  "block w-full rounded-lg border border-line bg-raised px-3 py-3 font-sans text-[16px] leading-[1.5] text-ink placeholder:text-ink-3";
const label = "block font-sans text-[15px] font-medium text-ink mb-2";

/**
 * "Not ready to apply? Leave your details." No account: it posts to the
 * portal's public judge-interest endpoint, and an organizer follows up with an
 * invitation to the full application. The full application stays the button
 * in the Judges section above.
 */
export default function JudgeInterestForm() {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status === "sending") return;
    const data = new FormData(event.currentTarget);
    const body = Object.fromEntries(
      [...data.entries()].map(([key, value]) => [key, String(value)]),
    );

    setStatus("sending");
    setError("");
    try {
      const res = await fetch(judgeInterestUrl(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setStatus("done");
        return;
      }
      const json = (await res.json().catch(() => null)) as {
        error?: string;
      } | null;
      setError(
        json?.error ??
          "Something went wrong. Please try again or email hello@hacklytics.io.",
      );
    } catch {
      setError(
        "Could not reach the server. Check your connection and try again.",
      );
    }
    setStatus("error");
  }

  return (
    <section id="judge-interest" className="section-anchor relative">
      <div className="wrap pb-12 md:pb-24">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-16 gap-y-8 border-t border-rule pt-10 md:pt-14">
          <div>
            <h3 className="font-sans text-[24px] md:text-[28px] font-semibold text-ink leading-tight">
              Not ready to apply?
            </h3>
            <p className="font-sans text-[17px] text-ink-2 leading-[1.55] max-w-[45ch] mt-4">
              Leave your details and we will be in touch about judging
              Hacklytics. No account needed. Submitting again with the same
              email updates your answers.
            </p>
          </div>

          <div aria-live="polite">
            {status === "done" ? (
              <p
                role="status"
                className="font-sans text-[19px] text-ink leading-[1.55] border border-line rounded-lg p-6"
              >
                Thanks, we&apos;ll be in touch.
              </p>
            ) : (
              <form onSubmit={onSubmit} className="relative space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div>
                    <label htmlFor="ji-name" className={label}>
                      Name
                    </label>
                    <input
                      id="ji-name"
                      name="name"
                      required
                      maxLength={120}
                      autoComplete="name"
                      className={field}
                    />
                  </div>
                  <div>
                    <label htmlFor="ji-email" className={label}>
                      Email
                    </label>
                    <input
                      id="ji-email"
                      name="email"
                      type="email"
                      required
                      maxLength={254}
                      autoComplete="email"
                      className={field}
                    />
                  </div>
                  <div>
                    <label htmlFor="ji-company" className={label}>
                      Company
                    </label>
                    <input
                      id="ji-company"
                      name="company"
                      required
                      maxLength={160}
                      autoComplete="organization"
                      className={field}
                    />
                  </div>
                  <div>
                    <label htmlFor="ji-title" className={label}>
                      Title (optional)
                    </label>
                    <input
                      id="ji-title"
                      name="title"
                      maxLength={160}
                      autoComplete="organization-title"
                      className={field}
                    />
                  </div>
                </div>
                <div>
                  <label htmlFor="ji-expertise" className={label}>
                    Area of expertise (optional)
                  </label>
                  <input
                    id="ji-expertise"
                    name="expertise"
                    maxLength={300}
                    placeholder="Machine learning, data engineering, health"
                    className={field}
                  />
                </div>
                <div>
                  <label htmlFor="ji-linkedin" className={label}>
                    LinkedIn profile (optional)
                  </label>
                  <input
                    id="ji-linkedin"
                    name="linkedinUrl"
                    type="url"
                    maxLength={300}
                    autoComplete="url"
                    placeholder="https://www.linkedin.com/in/your-name"
                    className={field}
                  />
                </div>
                <div>
                  <label htmlFor="ji-message" className={label}>
                    Anything else? (optional)
                  </label>
                  <textarea
                    id="ji-message"
                    name="message"
                    rows={3}
                    maxLength={1000}
                    className={area}
                  />
                </div>

                {/* Honeypot: off-screen and out of the tab order, so only a
                    bot fills it. */}
                <div
                  aria-hidden="true"
                  className="absolute -left-[9999px] h-0 w-0 overflow-hidden"
                >
                  <label htmlFor="ji-website">Website</label>
                  <input
                    id="ji-website"
                    name="website"
                    tabIndex={-1}
                    autoComplete="off"
                  />
                </div>

                {status === "error" && (
                  <p
                    role="alert"
                    className="font-sans text-[15px] text-ink border border-line border-l-4 border-l-bloom rounded-lg p-4"
                  >
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={status === "sending"}
                  className="btn btn-bloom disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {status === "sending" ? "Sending…" : "Keep me posted"}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
