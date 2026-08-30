/**
 * Prepare/rebuild results must not apply after the organiser has switched
 * editions or started a newer run. A CONFLICT from A that lands after the
 * selector moved to B would paint A's refusal on B, and Rebuild anyway would
 * send force: true for B.
 */
export function judgingPrepIsCurrent(
  startedHackathonId: string,
  startedGen: number,
  selectedHackathonId: string | null,
  currentGen: number,
): boolean {
  return (
    startedGen === currentGen && startedHackathonId === selectedHackathonId
  );
}
