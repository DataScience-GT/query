import React from "react";
import type { ComponentType } from "react";
import type { EventConfig, Track } from "../config";

export interface TrackArtProps {
  track: Track;
  index: number;
}

/**
 * One card per track, all the same size and shape: the art on top, standing
 * on a soil line, then the title and the line under it. `Art` fills the cell
 * above the words, which is `relative` so art can paint its own field behind
 * the plant. The row is marked `data-bloom-watch` so a site script can start
 * the art the first time the row is in view, and sets `--bed` so art can
 * double its scale from md.
 *
 * The grid is four across from lg, two by two from sm, and one column of
 * short cards, art beside words, on a phone. Titles are Silkscreen at 16px
 * or 24px, the sizes that stay on its pixel grid. "Entertainment" is 180px
 * wide at 24px and 120px at 16px, so the title steps down to 16px on a phone
 * and again at lg, where four cards are at their narrowest (174px of room).
 */
export default function TracksSection({
  event,
  Art,
}: {
  event: EventConfig;
  Art?: ComponentType<TrackArtProps>;
}) {
  return (
    <section id="tracks" className="section-anchor relative">
      <div className="wrap py-12 md:py-24">
        <h2 className="section-title mb-10 md:mb-16">Tracks</h2>

        <ul
          data-bloom="off"
          data-bloom-watch=""
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 auto-rows-fr gap-4 md:gap-6 [--bed:1] md:[--bed:2]"
        >
          {event.tracks.map((track, i) => (
            <li
              key={track.title}
              className="flex flex-row sm:flex-col overflow-hidden rounded-lg border border-rule bg-raised"
            >
              <div className="relative flex w-24 shrink-0 items-end justify-center self-stretch border-b border-sage sm:w-auto sm:self-auto sm:h-40 md:h-60">
                {Art && <Art track={track} index={i} />}
              </div>
              <div className="p-4 sm:p-5">
                <h3 className="font-display -ml-[0.125em] text-[16px] sm:text-[24px] lg:text-[16px] xl:text-[24px] leading-snug text-ink">
                  {track.title}
                </h3>
                <p className="font-sans text-[17px] leading-[1.5] text-ink-2 mt-2">
                  {track.description}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
