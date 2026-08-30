import { redirect } from "next/navigation";

/**
 * Judging Setup used to create a second hackathon record. Editions already
 * exist on the hackathon side of the portal; queue prep lives on /admin/judging.
 */
export default function AdminSetupRedirect() {
  redirect("/admin/judging");
}
