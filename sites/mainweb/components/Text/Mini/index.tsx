import { ReactNode, HTMLAttributes } from "react";

interface MiniProps {
  children: any;
  [key: string]: any;
}

export default function Mini({ children, className, ...props }: MiniProps) {
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
}