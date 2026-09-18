interface DownloadCaller {
  isStaff: boolean;
  isEnrolled: boolean;
}

interface DownloadWorkshop {
  term: string;
  isPublished: boolean;
}

/**
 * Staff can inspect drafts and archives. Members only receive an object when
 * every current-cohort condition holds; callers see only a 404 when it does not.
 */
export function canDownloadBootcampFile(
  caller: DownloadCaller,
  workshop: DownloadWorkshop,
  currentTerm: string,
  hasMetadata: boolean,
) {
  if (!hasMetadata) return false;
  if (caller.isStaff) return true;
  return (
    caller.isEnrolled &&
    workshop.term === currentTerm &&
    workshop.isPublished
  );
}
