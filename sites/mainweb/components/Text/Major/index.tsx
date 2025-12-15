import React from "react";

interface MajorProps extends React.HTMLAttributes<HTMLElement> {
  type?: "primary" | "secondary" | "a" | "b"; // support legacy 'a'|'b'
  as?: keyof JSX.IntrinsicElements;
  compact?: boolean; // small, non-uppercase style for inline/card headings
  children: React.ReactNode;
}

const Major: React.FC<MajorProps> = ({
  type = "primary",
  as = "h1",
  compact = false,
  children,
  className,
  ...props
}) => {
  // Support legacy values 'a'|'b' for backwards compatibility
  const resolvedType = type === "a" ? "primary" : type === "b" ? "secondary" : type;

  // Tailwind colors per type for a modern dark theme (e.g., Indigo/Amber)
  const typeClasses: Record<string, string> = {
    primary: "text-indigo-400 drop-shadow-lg",
    secondary: "text-amber-400 drop-shadow-lg",
  };

  const displayClasses = compact
    ? `text-lg md:text-xl lg:text-xl font-semibold leading-snug tracking-normal m-0`
    : `uppercase text-4xl md:text-5xl lg:text-6xl font-extrabold text-center leading-tight tracking-wide my-4`;

  const Tag = as as any;

  return (
    <Tag {...props} className={`${displayClasses} ${typeClasses[resolvedType] ?? ""} ${className ?? ""}`}>
      {children}
    </Tag>
  );
};

export default Major;