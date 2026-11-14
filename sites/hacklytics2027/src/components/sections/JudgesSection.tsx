import React from "react";
import { BloomSprite } from "../pixel/PixelSprite";
import { DAISY, SPROUT, TULIP } from "../pixel/sprites";
import { EVENT_DATES_LONG } from "@/lib/event";
import { JUDGE_SIGNUP_URL } from "@/lib/links";

const PLOT = [SPROUT, DAISY, SPROUT, TULIP, SPROUT];

export default function JudgesSection() {
  return (
    <section id="judges" className="section-anchor relative">
      <div className="wrap py-12 md:py-24">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-16 gap-y-10">
          <div>
            <h2 className="section-title">Judges</h2>
            <div
              aria-hidden="true"
              className="flex h-20 sm:h-36 items-end justify-around border-b border-sage mt-8 [--bed:1] sm:[--bed:2]"
            >
              {PLOT.map((map, i) => (
                <BloomSprite key={i} map={map} scale={4} />
              ))}
            </div>
          </div>

          <div>
            <p className="font-sans text-[17px] md:text-[19px] text-ink leading-[1.55] max-w-[55ch]">
              Judges score the projects. Apply on the
              Data Science @ GT portal: you sign in, then answer four short
              steps that take about five minutes. An organizer approves each
              application.
            </p>
            <p className="font-sans text-[17px] md:text-[19px] text-ink-2 leading-[1.55] max-w-[55ch] mt-5">
              {`Judging is part of the ${EVENT_DATES_LONG} weekend. Projects are due on Devpost Sunday at 9:00 AM and the weekend closes at 4:00 PM. On judging day you get a room or table and scan its QR code to take your seat. Exact judging times are not published yet.`}
            </p>
            <p className="font-sans text-[17px] md:text-[19px] text-ink-2 leading-[1.55] max-w-[55ch] mt-5">
              Questions? Email{" "}
              <a href="mailto:hello@hacklytics.io" className="text-link">
                hello@hacklytics.io
              </a>
              .
            </p>
            <a
              href={JUDGE_SIGNUP_URL}
              className="btn btn-bloom mt-8 inline-flex"
            >
              Apply to judge
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
