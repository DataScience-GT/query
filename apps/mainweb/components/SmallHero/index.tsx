import React, { ReactNode, HTMLAttributes } from "react";

interface SmallHeroProps extends HTMLAttributes<HTMLDivElement> {
  title: string;
  desc?: string;
  description?: string;
  children?: ReactNode;
}

const SmallHero: React.FC<SmallHeroProps> = ({
  title,
  desc,
  description,
  ...rest
}) => {
  const text = desc || description;

  return (
    <div
      {...rest}
      className="relative w-full h-auto z-10 animate-fadeIn"
    >
      <div className="relative flex w-full max-w-[1600px] mx-auto p-10 pb-0">
        <div className="flex flex-col w-4/5 sm:w-full">
          {/* Title */}
          <h1 className="text-[4em] font-bold text-transparent text-left font-sans 
                         relative tracking-normal 
                         [text-shadow:2px_2px_rgb(229,230,219)]
                         [-webkit-text-stroke:1.5px_rgb(229,230,219)]">
            {title}
          </h1>

          {/* Description */}
          <h2 className="text-[1.2em] font-normal text-left font-sans tracking-tight text-[rgb(229,230,219)]">
            {text}
          </h2>

          {/* Separator */}
          <div className="relative w-32 h-0.5 border-b-2 border-[rgb(229,230,219)] my-8 translate-x-1">
            <span className="absolute -left-1.5 -top-1 w-3 h-3 border-2 border-[rgb(229,230,219)] rounded-full"></span>
            <span className="absolute -right-1.5 -top-1 w-3 h-3 border-2 border-[rgb(229,230,219)] rounded-full"></span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SmallHero;
