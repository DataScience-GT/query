import React from "react";

interface MiniProps extends React.HTMLAttributes<HTMLParagraphElement> {
  children: React.ReactNode;
}

const Mini: React.FC<MiniProps> = ({ children, className, ...props }) => {
  const defaultClasses = `
    text-gray-300 text-lg md:text-xl font-normal leading-relaxed m-0
  `;

  return (
    <p
      {...props}
      className={`${defaultClasses} ${className ?? ""}`}
    >
      {children}
    </p>
  );
};

export default Mini;