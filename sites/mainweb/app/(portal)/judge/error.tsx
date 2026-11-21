"use client";

import { PortalError } from "@/components/portal/PortalError";

export default function JudgeError(props: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <PortalError
      {...props}
      title="The desk did not load"
      hint="Something went wrong. Check your connection, then try again. Evaluations you already submitted are unaffected."
    />
  );
}
