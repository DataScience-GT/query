import type { StaticImageData } from "next/image";
import type { ReactNode } from "react";
import Image from "next/image";

interface TeamCardProps {
  img?: StaticImageData;
  name: string;
  title: string;
  href?: string;
  children?: ReactNode;
}

function initialsFor(name: string) {
  return name
    .split(/\s+/)
    .filter((part) => /^[A-Za-z]/.test(part))
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

/** Same card as the /projects grid: photo or initials in one tile size. */
export default function TeamCard({
  img,
  name,
  title,
  href,
  children,
}: TeamCardProps) {
  return (
    <article className="group hover:border-dsgt-teal/30 flex flex-col rounded-xl border border-white/5 bg-[#0a0a0a] p-8 transition-colors duration-300">
      <div className="mb-6 flex items-center gap-5">
        <div className="relative size-16 shrink-0 overflow-hidden rounded-lg border border-white/10 bg-[#111]">
          {img ? (
            <Image
              src={img}
              alt=""
              fill
              sizes="64px"
              className="object-cover"
            />
          ) : (
            <span
              aria-hidden="true"
              className="text-dsgt-teal flex size-full items-center justify-center font-mono text-lg font-bold tracking-[0.1em]"
            >
              {initialsFor(name)}
            </span>
          )}
        </div>
        <div className="min-w-0">
          <h3 className="group-hover:text-dsgt-teal text-xl font-semibold tracking-tight text-white transition-colors">
            {href ? (
              <a href={href} target="_blank" rel="noopener noreferrer">
                {name}
              </a>
            ) : (
              name
            )}
          </h3>
          <p className="mt-1 font-mono text-xs tracking-[0.12em] text-neutral-400 uppercase">
            {title}
          </p>
        </div>
      </div>
      {children && (
        <p className="text-[15px] leading-relaxed text-neutral-300">{children}</p>
      )}
    </article>
  );
}
