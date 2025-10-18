import React from "react";

interface MiniProps extends React.HTMLAttributes<HTMLParagraphElement> {
  children: React.ReactNode;
}

const Mini: React.FC<MiniProps> = ({ children, className, ...props }) => {
  return (
    <p
      {...props}
      className={`text-white text-lg md:text-xl font-normal leading-snug m-0 ${className ?? ""}`}
    >
      {children}
    </p>
  );
};

export default Mini;
