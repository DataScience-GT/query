import React from "react";
import { Clock, UserCheck, UserX, Users, Shield } from "lucide-react";

export type RegistrationStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "waitlisted"
  | "checked_in";

export function statusColors(status: string) {
  switch (status) {
    case "approved":
      return "text-green-400 bg-green-500/10 border-green-500/20";
    case "pending":
      return "text-yellow-400 bg-yellow-500/10 border-yellow-500/20";
    case "rejected":
      return "text-red-400 bg-red-500/10 border-red-500/20";
    case "waitlisted":
      return "text-blue-400 bg-blue-500/10 border-blue-500/20";
    case "checked_in":
      return "text-purple-400 bg-purple-500/10 border-purple-500/20";
    default:
      return "text-[var(--text-muted)] bg-gray-500/10 border-gray-500/20";
  }
}

export function statusIcon(status: string) {
  switch (status) {
    case "approved":
      return <UserCheck className="w-3.5 h-3.5" />;
    case "pending":
      return <Clock className="w-3.5 h-3.5" />;
    case "rejected":
      return <UserX className="w-3.5 h-3.5" />;
    case "waitlisted":
      return <Users className="w-3.5 h-3.5" />;
    case "checked_in":
      return <Shield className="w-3.5 h-3.5" />;
    default:
      return null;
  }
}
