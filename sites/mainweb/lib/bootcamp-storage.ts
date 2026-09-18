import { Storage } from "@google-cloud/storage";
import { once, setMaxListeners } from "node:events";
import type { Readable } from "node:stream";
import { streamBootcampZip } from "./bootcamp-file";

// teeny-request pipelines reads through a PassThrough already carrying ten
// listeners. This fixed-size chain is expected and is not a listener leak.
setMaxListeners(15);

let storage: Storage | undefined;

const client = () => (storage ??= new Storage());

export const bootcampBucketName = () => process.env.BOOTCAMP_BUCKET ?? "";

const bucket = () => client().bucket(bootcampBucketName());

/**
 * Keyed by immutable workshop id, never (term, week): a week can be edited,
 * and a deterministic week key lets one row's upload overwrite another's.
 */
export const bootcampStorageKey = (
  workshopId: string,
  kind: "materials" | "solution",
) => `bootcamp/${workshopId}/${kind}.zip`;

export { BootcampZipError } from "./bootcamp-file";

/**
 * Streams directly into GCS while enforcing the magic bytes and cap. The
 * first four bytes are held until validated; no request-sized buffer exists.
 */
export async function putBootcampZip(
  key: string,
  body: ReadableStream<Uint8Array>,
) {
  const output = bucket().file(key).createWriteStream({
    metadata: { contentType: "application/zip" },
    resumable: false,
  });
  const finished = new Promise<void>((resolve, reject) => {
    output.once("finish", resolve);
    // Validation destroys the stream before `finish`; `close` releases that
    // wait so the route can return the validation error instead of hanging.
    output.once("close", resolve);
    output.once("error", reject);
  });

  try {
    const size = await streamBootcampZip(body, async (chunk) => {
      if (!output.write(chunk)) await once(output, "drain");
    });
    output.end();
    await finished;
    return size;
  } catch (error) {
    output.destroy();
    await finished.catch(() => undefined);
    // GCS object writes become visible atomically at finish. Do not delete the
    // key here: a rejected replacement must leave the previous valid ZIP intact.
    throw error;
  }
}

export function bootcampReadStream(key: string): Readable {
  return bucket().file(key).createReadStream();
}

export async function deleteBootcampZip(key: string) {
  await bucket().file(key).delete({ ignoreNotFound: true });
}
