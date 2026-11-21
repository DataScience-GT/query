"use client";

import { PortalError } from "@/components/portal/PortalError";

export default function AdminError(props: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <PortalError {...props} title="This admin page didn't load" />;
}
