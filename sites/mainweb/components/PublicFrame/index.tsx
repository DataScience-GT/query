import type { ReactNode } from "react";

export default function PublicFrame({
  note,
  children,
}: {
  note: string;
  children: ReactNode;
}) {
  return (
    <div className="public-site">
      <p className="sr-only">{note}</p>
      <div className="public-ticks" aria-hidden="true" />
      {children}
    </div>
  );
}
