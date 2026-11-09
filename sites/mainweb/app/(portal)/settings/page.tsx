import { PrefetchedPage } from "@/components/portal/PrefetchedPage";
import SettingsPage from "./SettingsPage";

export default function Page() {
  return (
    <PrefetchedPage
      reads={(c) => [
        ["user.me", undefined, c.user.me()],
        ["resume.me", undefined, c.resume.me()],
      ]}
    >
      <SettingsPage />
    </PrefetchedPage>
  );
}
