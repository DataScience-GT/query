import { describe, expect, it } from "vitest";
import { readPass } from "./pass";

const HACKATHON = "6f1c2a9e-3b7d-4e21-9a55-0c8d7e4b2f10";
const PARTICIPANT = "1b2c3d4e-5f60-4718-8a9b-0c1d2e3f4a5b";

const pass = (fields: Record<string, unknown>) => JSON.stringify(fields);

describe("readPass", () => {
  it("reads the participant off a pass for this edition", () => {
    expect(
      readPass(
        pass({ type: "CHECK_IN", hackathonId: HACKATHON, participantId: PARTICIPANT }),
        HACKATHON,
      ),
    ).toEqual({ participantId: PARTICIPANT });
  });

  it("refuses a pass from another edition", () => {
    const result = readPass(
      pass({
        type: "CHECK_IN",
        hackathonId: "00000000-0000-4000-8000-000000000000",
        participantId: PARTICIPANT,
      }),
      HACKATHON,
    );
    expect(result).toEqual({ error: "That pass is for a different hackathon." });
  });

  it("refuses anything that is not a pass", () => {
    for (const raw of [
      "https://example.com",
      "",
      "null",
      "42",
      pass({ type: "EVENT", hackathonId: HACKATHON, participantId: PARTICIPANT }),
      pass({ type: "CHECK_IN", hackathonId: HACKATHON }),
      pass({ type: "CHECK_IN", hackathonId: HACKATHON, participantId: 7 }),
    ]) {
      expect(readPass(raw, HACKATHON)).toHaveProperty("error");
    }
  });
});
