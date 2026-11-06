import { BED_SIZE, bloomSet, plantBed, withBlooms } from "./beds";
import { PixelBed } from "./PixelBed";
import { useInBloom } from "./season";

/*
 * The four flower beds that need React. Each is its own island: the share in
 * bloom comes from the clock and a click plants a flower, neither of which the
 * static HTML can know. The seeds match the markup these beds replaced, so the
 * same plants stand in the same places.
 */

const Heading = () => <h2 className="font-display text-[16px] text-ink">Plant a flower</h2>;

// The static HTML has no count yet. A blank line holds the caption's place, so
// the bed does not grow when hydration fills it in.
const NO_CAPTION = " ";

const HERO_BED = plantBed(0);
const MENU_BED = plantBed(2);
const FOOTER_BED = plantBed(3);

export function HeroBed() {
  const inBloom = useInBloom();
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
          ? `${inBloom} of ${BED_SIZE} in bloom · fills in as Feb 26 gets closer`
          : NO_CAPTION
      }
    />
  );
}

export function MenuBed() {
  const inBloom = useInBloom();
  return <PixelBed plants={withBlooms(MENU_BED, bloomSet(inBloom))} soil />;
}

export function FooterBed() {
  const inBloom = useInBloom();
  return (
    <PixelBed
      plants={withBlooms(FOOTER_BED, bloomSet(inBloom))}
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
