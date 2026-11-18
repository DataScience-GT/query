import React from "react";
import type { ComponentType } from "react";
import type { EventConfig, Track } from "../config";

export interface TrackArtProps {
  track: Track;
  index: number;
}

/**
 * `Art` draws each track's picture in the cell beside its words. The row is
 * marked `data-bloom-watch` so a site script can start the art the first time
 * the row is in view, and sets `--bed` so art can double its scale from md.
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
        <h2 className="section-title mb-10 md:mb-20">Tracks</h2>

        {/* One plot per track. A phone gets rows, art left of its words.
            From sm each li is a subgrid, so titles and descriptions line up
            across a row. The space between rows there is the li's pb-14, not
            a row gap, which the subgrid would also put between a title and
            its description; -mb-14 takes it back off the last row. */}
        <ul
          data-bloom="off"
          data-bloom-watch=""
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-6 sm:-mb-14 [--bed:1] md:[--bed:2]"
        >
          {event.tracks.map((track, i) => (
            <li
              key={track.title}
              className="grid grid-cols-[5rem_1fr] gap-x-4 py-4 border-b border-sage sm:grid-cols-none sm:grid-rows-subgrid sm:row-span-3 sm:py-0 sm:pb-14 sm:border-b-0"
            >
              <div className="row-span-2 flex items-end sm:row-span-1 sm:h-32 md:h-60 sm:border-b sm:border-sage">
                {Art && <Art track={track} index={i} />}
              </div>
              <h3 className="font-display -ml-[0.125em] text-[24px] leading-snug text-ink self-end sm:mt-5">
                {track.title}
              </h3>
              <p className="font-sans text-[17px] leading-[1.5] text-ink-2 mt-1 sm:mt-3">
                {track.description}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
