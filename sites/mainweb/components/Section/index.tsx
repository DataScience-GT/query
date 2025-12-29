import React, { ReactNode, HTMLAttributes } from "react";

interface SectionProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  makefull?: boolean;
}

const Section: React.FC<SectionProps> = ({ children, makefull = false, ...rest }) => {
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
};

export default Section;