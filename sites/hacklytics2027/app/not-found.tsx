import Link from "next/link";

export default function NotFound() {
  return (
    // The footer below brings its own flower bed, so this page needs none.
    <main className="flex min-h-[80svh] flex-col">
      <div className="wrap flex-1 flex flex-col justify-center pt-[8.5rem] md:pt-[11.5rem] pb-16">
        <p className="kicker">Page not found</p>
        <h1 className="display text-[clamp(6rem,24vw,12rem)] leading-[0.85] tracking-[-0.045em] mt-5">
          404
        </h1>
        <p className="font-sans text-[17px] md:text-[19px] text-ink-2 leading-[1.55] max-w-[40ch] mt-8">
          Nothing grows at this address. The page may have moved, or it never
          existed.
        </p>
        <div className="mt-10">
          <Link href="/" className="btn btn-bloom">
            Go to the homepage
          </Link>
        </div>
      </div>
    </main>
  );
}
