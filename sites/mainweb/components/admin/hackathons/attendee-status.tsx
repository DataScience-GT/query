import React from "react";
import { Clock, UserCheck, UserX, Users, Shield } from "lucide-react";
import { status as statusClass } from "@/components/portal/ui";

export type RegistrationStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "waitlisted"
  | "checked_in";

export function statusColors(status: string) {
  switch (status) {
    case "approved":
      return statusClass("success");
    case "pending":
      return statusClass("warning");
    case "rejected":
      return statusClass("danger");
    case "checked_in":
      return statusClass("accent");
    default:
      return statusClass("neutral");
  }
}

const icon = { className: "w-4 h-4", strokeWidth: 1.75, "aria-hidden": true } as const;

export function statusIcon(status: string) {
  switch (status) {
    case "approved":
      return <UserCheck {...icon} />;
    case "pending":
      return <Clock {...icon} />;
    case "rejected":
      return <UserX {...icon} />;
    case "waitlisted":
      return <Users {...icon} />;
    case "checked_in":
      return <Shield {...icon} />;
    default:
      return null;
  }
}
