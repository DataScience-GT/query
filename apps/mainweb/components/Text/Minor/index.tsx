import React from "react";

interface MinorProps extends React.HTMLAttributes<HTMLHeadingElement> {
  type?: "a" | "b";
  children: React.ReactNode;
}

const Minor: React.FC<MinorProps> = ({ type = "a", children, className, ...props }) => {
  const typeClasses = {
    a: "text-[#74b1aa] drop-shadow-sm",
    b: "text-[#ecae58] drop-shadow-sm",
  };

  return (
    <h2
      {...props}
      className={`
        text-2xl md:text-3xl font-semibold m-0
        ${typeClasses[type]}
        ${className ?? ""}
      `}
    >
      {children}
    </h2>
  );
};

export default Minor;
