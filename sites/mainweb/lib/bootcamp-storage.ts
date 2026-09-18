import { Storage } from "@google-cloud/storage";
import type { Readable } from "node:stream";

/**
 * Cloud Storage for bootcamp handouts. Separate bucket from resumes: those are
 * documents no member may read, these are files every enrolled member may.
 * Credentials are ADC, as with resumes.
 */
let storage: Storage | undefined;

const client = () => (storage ??= new Storage());

export const bootcampBucketName = () => process.env.BOOTCAMP_BUCKET ?? "";

const bucket = () => client().bucket(bootcampBucketName());

export async function putMaterial(
  key: string,
  bytes: Uint8Array,
  contentType: string,
) {
  await bucket().file(key).save(Buffer.from(bytes), {
    contentType,
    resumable: false,
  });
}

/** Streamed: 25MB times a class opening the slides at once is not an instance's to hold. */
export function materialReadStream(key: string): Readable {
  return bucket().file(key).createReadStream();
}

export async function deleteMaterial(key: string) {
  await bucket().file(key).delete({ ignoreNotFound: true });
}
