import { Storage } from "@google-cloud/storage";
import { setMaxListeners } from "node:events";
import type { Readable } from "node:stream";

/**
 * Every object read goes through teeny-request, which pipelines its response
 * into a PassThrough that already carries ten listeners from the Storage read
 * chain — one over Node's default, so a MaxListenersExceededWarning printed on
 * every resume view. The chain is a fixed size, so this is a ceiling that was
 * set too low, not a leak: 15 clears it and still catches a real one.
 */
setMaxListeners(15);

/**
 * Cloud Storage for resume PDFs.
 *
 * Application Default Credentials — App Hosting runs as a service account that
 * already has them, so there is no key file to manage. Locally, whatever
 * `gcloud auth application-default login` left behind.
 */
let storage: Storage | undefined;

const client = () => (storage ??= new Storage());

export const resumeBucketName = () => process.env.RESUME_BUCKET ?? "";

const bucket = () => client().bucket(resumeBucketName());

/** Deterministic, so a replacement overwrites rather than orphaning the old object. */
export const resumeStorageKey = (userId: string) => `resumes/${userId}.pdf`;

export async function putResume(key: string, bytes: Uint8Array) {
  await bucket().file(key).save(Buffer.from(bytes), {
    contentType: "application/pdf",
    resumable: false,
  });
}

export function resumeReadStream(key: string): Readable {
  return bucket().file(key).createReadStream();
}

/** One resume in memory, capped at 2MB by the upload route. The ZIP builder holds a few of these at a time, never thousands. */
export async function readResume(key: string) {
  const [buffer] = await bucket().file(key).download();
  return buffer;
}

export async function deleteResume(key: string) {
  // ignoreNotFound: a row with no object is still a row that should delete.
  await bucket().file(key).delete({ ignoreNotFound: true });
}
