import type { ReactNode, HTMLAttributes } from "react";

interface SectionProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export default function Section({ children, ...rest }: SectionProps) {
  return (
    <div
      className="relative w-full h-auto py-10 max-w-[1400px] mx-auto px-6 sm:px-4"
      {...rest}
    >
      {children}
    </div>
  );
}
