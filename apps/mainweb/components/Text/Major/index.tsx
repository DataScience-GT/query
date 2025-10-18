import React from "react";

interface MajorProps extends React.HTMLAttributes<HTMLHeadingElement> {
  type?: "a" | "b";
  children: React.ReactNode;
}

const Major: React.FC<MajorProps> = ({ type = "a", children, className, ...props }) => {
  // Tailwind colors per type
  const typeClasses = {
    a: "text-[#74b1aa] drop-shadow-md",
    b: "text-[#ecae58] drop-shadow-md",
  };

  return (
    <h1
      {...props}
      className={`
        uppercase text-4xl md:text-5xl font-extrabold text-center
        leading-tight tracking-wider my-2 transform scale-y-110
        bg-[rgb(52,52,52)] w-fit mx-auto
        ${typeClasses[type]}
        ${className ?? ""}
      `}
    >
      {children}
    </h1>
  );
};

export default Major;
