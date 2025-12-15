import React from "react";

interface MinorProps extends React.HTMLAttributes<HTMLHeadingElement> {
  type?: "primary" | "secondary"; // Renamed 'a' and 'b' for clarity
  children: React.ReactNode;
}

const Minor: React.FC<MinorProps> = ({ type = "primary", children, className, ...props }) => {
  // Matching colors to the Major component
  const typeClasses = {
    primary: "text-indigo-400 drop-shadow-sm", // Replaces #74b1aa
    secondary: "text-amber-400 drop-shadow-sm", // Replaces #ecae58
  };

  const defaultClasses = `
    text-2xl md:text-3xl font-semibold m-0
    leading-normal
  `;

  return (
    <h2
      {...props}
      className={`${defaultClasses} ${typeClasses[type]} ${className ?? ""}`}
    >
      {children}
    </h2>
  );
};

export default Minor;