import { plantBed } from "./beds";
import { PixelBed } from "./PixelBed";

/*
 * The four flower beds that need React. Each is its own island: a click plants
 * a flower and the bed opens when it scrolls into view, neither of which the
 * static HTML can do. Every plant in them is a flower in one of the portal's
 * tints: nothing is grey, and the islands take no props, so importing the
 * event config (and all its copy into the browser bundle) is never needed.
 */

const Heading = () => <h2 className="font-display text-[16px] text-ink">Plant a flower</h2>;

const HERO_BED = plantBed(0);
const MENU_BED = plantBed(2);
const FOOTER_BED = plantBed(3);

export function HeroBed() {
  return (
    <PixelBed
      plants={HERO_BED}
      soil
      plantable
      hint
      className="h-24"
      gap="block w-52 min-[390px]:w-60 sm:w-72 md:w-80 lg:w-[22rem] xl:w-[28rem] short:w-[calc(100svh-26rem)]"
      heading={<Heading />}
    />
  );
}

export function MenuBed() {
  return <PixelBed plants={MENU_BED} soil />;
}

export function FooterBed() {
  return <PixelBed plants={FOOTER_BED} className="pt-6" plantable soil big />;
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
