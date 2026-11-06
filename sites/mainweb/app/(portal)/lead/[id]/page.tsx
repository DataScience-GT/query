import { PrefetchedPage } from "@/components/portal/PrefetchedPage";
import LeadInitiativePage from "./LeadInitiativePage";

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  return (
    <PrefetchedPage
      reads={async (c) => {
        const { id } = await params;
        return [["initiative.getById", { id }, c.initiative.getById({ id })]];
      }}
    >
      <LeadInitiativePage params={params} />
    </PrefetchedPage>
  );
}
