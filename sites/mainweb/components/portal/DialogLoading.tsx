import { Spinner } from "@query/ui/Spinner";

/**
 * Stands in for a dialog whose code is still downloading, so the click that
 * opened it visibly did something. Same backdrop and layer as Modal.
 */
export function DialogLoading() {
  return (
    <div
      role="status"
      aria-label="Loading"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-[var(--bg-primary)]/85"
    >
      <Spinner size={32} tone="track" />
    </div>
  );
}
