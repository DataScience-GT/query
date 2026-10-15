/**
 * The participant on a scanned event pass. The pass (Schedule tab) is a JSON
 * payload carrying only the edition and the participant id, which is why a
 * screenshot of it works. Returns a sentence for the person at the table when
 * the code is not a pass for this edition.
 */
export function readPass(
  raw: string,
  hackathonId: string,
): { participantId: string } | { error: string } {
  let payload: { type?: unknown; hackathonId?: unknown; participantId?: unknown };
  try {
    payload = JSON.parse(raw) as typeof payload;
  } catch {
    return { error: "That is not a hackathon pass. Scan the QR on their pass." };
  }

  if (
    payload?.type !== "CHECK_IN" ||
    typeof payload.participantId !== "string" ||
    typeof payload.hackathonId !== "string"
  ) {
    return { error: "That is not a hackathon pass. Scan the QR on their pass." };
  }

  if (payload.hackathonId !== hackathonId) {
    return { error: "That pass is for a different hackathon." };
  }

  return { participantId: payload.participantId };
}
