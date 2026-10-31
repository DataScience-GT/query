/** Hangs from the top right of the page it sits on, which must be `relative`. */
export default function MlhBadge() {
  return (
    <a
      href="https://mlh.io/na?utm_source=na-hackathon&utm_medium=TrustBadge&utm_campaign=2026-season&utm_content=white"
      target="_blank"
      rel="noopener noreferrer"
      className="mlh-badge absolute top-0 right-5 md:right-12 z-50 w-[9%] max-w-[90px] min-w-[56px] hover:opacity-85 transition-opacity duration-150 ease-(--ease)"
    >
      <img src="/mlh-trust-badge.svg" alt="Major League Hacking 2027" className="w-full" />
    </a>
  );
}
