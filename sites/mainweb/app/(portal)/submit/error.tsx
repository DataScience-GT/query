"use client";

import { PortalError } from "@/components/portal/PortalError";

export default function SubmitError(props: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <PortalError
      {...props}
      title="Couldn't load the submission page"
      hint="Something went wrong. If you were mid-submit, reload and check your project on this page before submitting again."
    />
  );
}
