import Link from "next/link";
import MlhBadge from "@/components/MlhBadge";
import { PixelBed } from "@/components/pixel/PixelBed";

export default function NotFound() {
  return (
    // "Nothing grows at this address", so the soil here is bare, the only bed
    // on the site with no plants, until a visitor plants the first one.
    <main className="relative flex min-h-[100svh] flex-col">
      <MlhBadge />

      <div className="wrap flex flex-1 flex-col items-center justify-center pt-28 md:pt-40 short:pt-24 pb-10 text-center">
        <p className="kicker text-[17px] md:text-[20px] leading-7 text-ink">Page not found</p>
        <h1 className="display text-[120px] md:text-[192px] short:text-[128px] mt-4 -translate-x-[0.0625em]">
          404
        </h1>
        <p className="font-sans text-[17px] md:text-[19px] text-ink-2 leading-[1.55] max-w-[40ch] mt-6">
          Nothing grows at this address. The page may have moved, or it never
          existed.
        </p>
        <div className="mt-8">
          <Link href="/" className="btn btn-bloom">
            Go to the homepage
          </Link>
        </div>
      </div>

      <div className="pb-6">
        <PixelBed
          plants={[]}
          className="h-24 border-b border-sage"
          plantable
          hint
          heading={
            <h2 className="font-display text-[16px] text-ink">Plant a flower</h2>
          }
        />
      </div>
    </main>
  );
}
