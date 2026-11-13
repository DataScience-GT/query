import type { ReactNode } from "react";

const sizes = {
  13: "text-[13px]",
  14: "text-sm",
  15: "text-[15px]",
} as const;

const leftRule = "border-l-2 border-[var(--danger)] pl-3";

interface AlertProps {
  children: ReactNode;
  size?: keyof typeof sizes;
  rule?: boolean;
  className?: string;
}

export function Alert({
  children,
  size = 15,
  rule = false,
  className,
}: AlertProps) {
  const classes = [
    rule && leftRule,
    sizes[size],
    "text-[var(--danger)]",
    className,
  ];
  return (
    <p role="alert" className={classes.filter(Boolean).join(" ")}>
      {children}
    </p>
  );
}
