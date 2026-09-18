interface DownloadCaller {
  isStaff: boolean;
  bootcampTerm: string | null;
}

interface DownloadWorkshop {
  term: string;
  isPublished: boolean;
}

/**
 * Staff can inspect drafts and archives. Members only receive a published file
 * from the cohort they paid for — the workshop's own term, not the current
 * one, so fall material stays reachable in January. Callers see only a 404.
 */
export function canDownloadBootcampFile(
  caller: DownloadCaller,
  workshop: DownloadWorkshop,
  hasMetadata: boolean,
) {
  if (!hasMetadata) return false;
  if (caller.isStaff) return true;
  return (
    caller.bootcampTerm !== null &&
    caller.bootcampTerm === workshop.term &&
    workshop.isPublished
  );
}
