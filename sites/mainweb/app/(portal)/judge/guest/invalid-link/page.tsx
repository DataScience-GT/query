import Link from "next/link";
import {
  meta,
  page,
  pageDek,
  pageTitle,
  textLink,
} from "@/components/portal/ui";

// Where a room QR code with a bad signature, a revoked link or an archived
// room ends up.
export default function InvalidRoomLinkPage() {
  return (
    <main className={page}>
      <h1 className={pageTitle}>This QR code no longer works</h1>
      <p className={pageDek}>
        Organisers replaced or switched off this link. Ask an organiser for
        the new QR code at your room or table, then scan that one.
      </p>
      <p className={`mt-8 ${meta}`}>
        Judging with a portal account?{" "}
        <Link href="/judge" className={textLink}>
          Open your judging page
        </Link>
      </p>
    </main>
  );
}
