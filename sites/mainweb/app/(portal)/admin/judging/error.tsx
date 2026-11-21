"use client";

import { PortalError } from "@/components/portal/PortalError";

export default function AdminJudgingError(props: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <PortalError
      {...props}
      title="Couldn't load judging"
      backHref="/admin/judging"
      backLabel="All editions"
    />
  );
}
