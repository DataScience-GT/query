# Resume book

Members upload a resume from their profile. Staff filter those resumes and download the set as one streamed ZIP.

Sized for **5000+ resumes, growing indefinitely**. That number drives every decision below.

## Where things are

| Piece | Path |
| --- | --- |
| Table (metadata only) | `packages/db/src/schemas/resumes.ts` (`member_resume`) |
| Shared query | `packages/api/src/services/resume-list.ts` |
| Metadata API | `packages/api/src/routers/resume.ts` |
| Upload / remove | `sites/mainweb/app/(portal)/api/resume/route.ts` |
| Serve one PDF | `sites/mainweb/app/(portal)/api/resume/[userId]/route.ts` |
| ZIP | `sites/mainweb/app/(portal)/api/resume-book/route.ts` |
| Bucket client | `sites/mainweb/lib/resume-storage.ts` |
| Member UI | `sites/mainweb/components/portal/ResumeSection.tsx` (Settings → Profile) |
| Staff UI | `sites/mainweb/app/(portal)/admin/resumes/page.tsx` (`/admin/resumes`) |

## Storage

PDFs live in Cloud Storage under `resumes/<userId>.pdf`. Postgres holds metadata and the object key.

5000 resumes is 1.5 GB at typical size and 10 GB at the per-file cap. The Neon instance is 0.5 GB and is shared with members, payments and sessions — bytea was never going to hold this. The key is deterministic, so a replacement overwrites rather than orphaning.

Write order is deliberate. Upload writes the object **before** the row: a failed write leaves the old row pointing at the old object, which is a stale resume. A row pointing at nothing is a 404 on a resume the member believes they uploaded. Delete reverses it — an orphaned object costs pennies, an orphaned row serves a resume somebody asked to remove.

Credentials are Application Default Credentials. App Hosting runs as a service account that needs `roles/storage.objectAdmin` on the bucket; see `apphosting.yaml` for the two `gcloud` commands. Locally, `gcloud auth application-default login`. With `RESUME_BUCKET` unset, uploads return 503 with a message rather than failing obscurely.

## The book is a ZIP, not a merged PDF

5000 resumes merged is ~7500 pages and ~1.5 GB. It does not fit in a 1 GB container, and nobody opens it.

The ZIP streams: entries are appended one at a time while reads run 8 ahead, so peak memory is roughly `PREFETCH × 2MB`, not the size of the book. It is served over **GET** and downloaded by navigating to a link — `fetch` would put the whole thing in a Blob in the tab.

Every ZIP contains `index.csv` (name, email, school, major, grad year, membership, filename). Entry names are `Lastname Firstname.pdf`, deduped case-insensitively, because Windows and macOS extract onto case-insensitive filesystems where `wei chen.pdf` would silently replace `Wei Chen.pdf`. An object that cannot be read is skipped and listed in `skipped.txt` rather than failing the book.

## The two views

`/admin/resumes` has one control that matters: **Members** or **All**.

- **Members** — a paid membership whose end date has not passed. Same rule as `member.checkStatus`. This is the book a sponsor is promised.
- **All** — everyone with a resume: hackathon participants, lapsed members, judges.

The table pages 100 at a time; the ZIP works from the *filters*, not the visible page, so "Download all 4,812" does not need 4,812 ids in a URL. Checkboxes are for hand-picking a subset, which goes over `?ids=`.

Switching view or search clears the selection and resets to page 1. A selection carried across views would put non-members into a members-only book with nobody noticing.

## Why files do not go through tRPC

`uploadProcedure` caps payloads at 2MB (`packages/api/src/trpc.ts`) and superjson base64s the body, inflating a PDF by a third. Raising that cap would also loosen the avatar path. Bytes move over plain route handlers; tRPC carries metadata only.

## Limits

| Limit | Value | Where |
| --- | --- | --- |
| Per file | 2MB | `MAX_RESUME_BYTES` |
| Uploads per person | 6/hour | `UPLOAD_LIMIT` |
| ZIP prefetch window | 8 | `PREFETCH` |
| Table page | 100 | `PAGE_SIZE` |

2MB is a quality call now, not a storage one — a Word or LaTeX resume runs 100-500KB, and files needing more are scans, which read badly through an applicant tracker. Raising it is one constant plus the copy beside it.

There is no total-storage ceiling. Cloud Storage does not fill up, and blocking uploads to protect a bucket would be theatre. Watch `dsgt_resume_bytes_stored` and `dsgt_resumes_stored` on `/api/metrics` for the bill, not for a wall.

## What happens to an uploaded PDF

1. Rejected unless the first five bytes are `%PDF-`. The extension is not evidence.
2. Re-saved through pdf-lib with object streams. Lossless — text stays selectable and links stay clickable, which is what applicant trackers read. 5-15% off a text resume, near nothing off a scan. If the re-save is larger, the original is kept.
3. A PDF that will not parse is refused at upload, with a message the member can act on, rather than reaching a sponsor broken.

Embedded images are untouched; re-encoding those needs Ghostscript or equivalent, which the runtime does not have.

## Access

- A member can read and delete their own resume, nobody else's.
- Staff (`isAdmin` — active admin row, not a volunteer, not expired) can read any resume and build books.
- `/api/resume/me` resolves to the caller, so the settings page never puts a user id in its markup.
- Single PDFs are **proxied**, not redirected to a signed URL: a redirect off-origin takes the response out of `frame-src 'self'` and out of the auth check. Both PDF and ZIP responses are `private, no-store`.
- Download and ZIP entry names come from the name on file, never the uploaded filename, which is attacker-controlled text heading for a `Content-Disposition` header and for a path inside an archive thousands of people will extract.

## CSP

Previews are same-origin `<iframe>`s, which needs `'self'` in `frame-src` (`sites/mainweb/next.config.mjs`). It was missing before this feature — the policy runs report-only until `CSP_ENFORCE=true`, so every same-origin frame would have gone blank the day that flipped, with nothing saying why.

## Known ceiling

A full 5000-resume ZIP is ~1.5 GB through one Cloud Run request. Streaming keeps memory flat, but the request still has to finish inside Cloud Run's timeout (300s by default). At ~20MB/s to the client that is around 75 seconds, so it fits — with less headroom as the archive grows.

When it stops fitting, the fix is a job that builds the ZIP into the bucket and hands back a signed URL, not a bigger timeout. `runConfig.timeoutSeconds` in `apphosting.yaml` buys time in the meantime.

## Deploying

`apphosting.yaml` runs `drizzle-kit push` before the build, so `member_resume` is created on deploy. Push refuses destructive changes, so if an earlier build created the old `data bytea` column it will be left behind harmlessly — drop it by hand if you care.
