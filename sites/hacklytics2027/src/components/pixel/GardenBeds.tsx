import { BED_SIZE, bloomSet, plantBed, withBlooms } from "./beds";
import { PixelBed } from "./PixelBed";
import { useInBloom } from "./season";

/*
 * The four flower beds that need React. Each is its own island: the share in
 * bloom comes from the clock and a click plants a flower, neither of which the
 * static HTML can know. The seeds match the markup these beds replaced, so the
 * same plants stand in the same places.
 *
 * The islands take the event's start (epoch milliseconds) and its first-day
 * label as props. Importing the event config would put all of its copy in the
 * browser bundle.
 */

interface BedProps {
  start: number;
}

const Heading = () => <h2 className="font-display text-[16px] text-ink">Plant a flower</h2>;

// The static HTML has no count yet. A blank line holds the caption's place, so
// the bed does not grow when hydration fills it in.
const NO_CAPTION = " ";

const HERO_BED = plantBed(0);
const MENU_BED = plantBed(2);
const FOOTER_BED = plantBed(3);

export function HeroBed({ start, startLabel }: BedProps & { startLabel: string }) {
  const inBloom = useInBloom(start);
  return (
    <PixelBed
      plants={withBlooms(HERO_BED, bloomSet(inBloom))}
      soil
      plantable
      hint
      className="h-24"
      gap="block w-52 min-[390px]:w-60 sm:w-72 md:w-80 lg:w-[22rem] xl:w-[28rem] short:w-[calc(100svh-26rem)]"
      heading={<Heading />}
      caption={
        inBloom
          ? `${inBloom} of ${BED_SIZE} in bloom · fills in as ${startLabel} gets closer`
          : NO_CAPTION
      }
    />
  );
}

export function MenuBed({ start }: BedProps) {
  const inBloom = useInBloom(start);
  return <PixelBed plants={withBlooms(MENU_BED, bloomSet(inBloom), 5)} soil />;
}

export function FooterBed({ start }: BedProps) {
  const inBloom = useInBloom(start);
  return (
    <PixelBed
      plants={withBlooms(FOOTER_BED, bloomSet(inBloom), 3)}
      className="pt-6"
      plantable
      soil
      big
    />
  );
}

/* "Nothing grows at this address": the only bed on the site with no plants. */
export function NotFoundBed() {
  return (
    <PixelBed
      plants={[]}
      className="h-24 border-b border-sage"
      plantable
      hint
      heading={<Heading />}
    />
  );
}
