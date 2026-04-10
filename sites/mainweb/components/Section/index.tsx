import { ReactNode, HTMLAttributes } from "react";

interface SectionProps {
  children: any;
  makefull?: boolean;
  [key: string]: any;
}

export default function Section({ children, makefull = false, ...rest }: SectionProps) {
  return (
    <div
      className={`relative w-full h-auto py-10 ${
        makefull ? "max-w-[1600px]" : "max-w-[1400px]"
      } mx-auto px-6 sm:px-4`}
      {...rest}
    >
      {children}
    </div>
  );
}