# Bootcamp materials

Staff attach files to a bootcamp session — slides, notebooks, datasets. Everyone enrolled in that bootcamp downloads them from `/club/bootcamp`; nobody else can, including members who did not buy it.

Sessions themselves are ordinary events carrying `bootcamp_week` and `bootcamp_term`; see [Architecture](./architecture.md). Nothing here adds a second events stack.

## Where things are

| Piece | Path |
| --- | --- |
| Table (metadata only) | `packages/db/src/schemas/bootcamp.ts` (`bootcamp_material`) |
| Read API | `packages/api/src/routers/bootcamp.ts` (`myProgress`, `attendance`) |
| Upload | `sites/mainweb/app/(portal)/api/bootcamp/materials/route.ts` |
| Serve / remove one file | `sites/mainweb/app/(portal)/api/bootcamp/materials/[id]/route.ts` |
| File rules (types, size, names) | `sites/mainweb/lib/bootcamp-materials.ts` |
| Access gate | `sites/mainweb/lib/bootcamp-access.ts` |
| Bucket client | `sites/mainweb/lib/bootcamp-storage.ts` |
| Both UIs | `sites/mainweb/components/portal/BootcampMaterials.tsx` |
| Member page | `sites/mainweb/app/(portal)/club/bootcamp/page.tsx` |
| Staff page | `sites/mainweb/app/(portal)/admin/bootcamp/page.tsx` (`/admin/bootcamp`) |

## Who can read a file

The download route answers for one person and one file:

- Staff, always.
- Anyone whose `member.bootcamp_term` equals the **term of the session the file hangs off** — not the current term. Somebody who bought the fall bootcamp keeps the fall notebooks in January. They do not get the spring ones, because their enrolment never said spring.
- Everyone else gets **404, not 403**. Whether a file exists is itself worth nothing to someone who may not read it.

A file is attached to the session event rather than to a week number, which is what makes that check one lookup: the term comes with the row.

## Storage

Files live in `gs://dsgt-bootcamp` under `sessions/<eventId>/<materialId>.<ext>`. Postgres holds the name, size, content type and object key.

A second bucket rather than a prefix inside `dsgt-resumes`: resumes are documents no member may ever read and handouts are files every enrolled member may, and that difference is worth a bucket boundary rather than a path check.

The object is named after the row id, never the uploaded filename. Two weeks can both hand out `slides.pdf`, and a name that arrived from a form has no business being a path. The extension rides along so a `gcloud storage cp` out of the bucket still produces a usable file.

Write order matches the resume path and for the same reason. Upload writes the object **before** the row — a row pointing at nothing is a download that 404s on a file the cohort was told to expect, while an object with no row costs a few cents. Delete reverses it.

Credentials are Application Default Credentials; the App Hosting runtime service account has `roles/storage.objectAdmin` on the bucket (see `apphosting.yaml`). Locally, `gcloud auth application-default login`. With `BOOTCAMP_BUCKET` unset, uploads and downloads return 503 with a message rather than failing obscurely.

## Downloads are proxied, not signed

The bucket keeps uniform bucket-level access and public access prevention **enforced**. Every byte is streamed through the Next server, so a copied link is worth nothing to someone who is not signed in, and a member who leaves the bootcamp stops being able to use one they saved.

A signed URL would be cheaper — the bytes would never touch the server — but it is a bearer token for the file that keeps working until it expires, and it would need `roles/iam.serviceAccountTokenCreator` on the runtime service account on top of that. If the traffic ever justifies it, that is the trade being made, not a free upgrade.

Streamed rather than buffered: 25MB times a class opening the slides at once is more than an instance has. The cost is that a read failing after the headers are out arrives as a truncated download rather than an error, which is why that failure is logged server-side.

## Limits

| Rule | Value | Why |
| --- | --- | --- |
| Per file | 25MB | A deck with screenshots is 5-15MB; the ceiling is the download path, not storage |
| Kinds | `pdf` `ipynb` `py` `csv` `json` `md` `txt` `zip` `pptx` `xlsx` `docx` `png` `jpg` `jpeg` | Allowlist. The entry **is** the `content-type` served back, so an unlisted kind has none and is refused |
| Uploads | 30 per officer per hour | Token bucket, same limiter as everything else |

`.html` and `.svg` are absent on purpose: both run script from our own origin. The download being `content-disposition: attachment` with `x-content-type-options: nosniff` is the second lock, not the only one.

Uploaded filenames are sanitised before they reach a header or a disk: path separators, control characters and leading dots come out, the extension stays, because the extension is what picks the content type.

## Adding files

`/admin/bootcamp` lists this term's sessions under **Handouts**, each with its files and an **Add file** control. Uploads go straight to the route handler rather than through tRPC — superjson base64s the whole body, which no slide deck survives.

There is no total-storage ceiling and no cleanup job. Deleting a session deletes its rows (`on delete cascade`) but not its objects; a term's worth is a few hundred megabytes, and a sweep that deletes from the bucket on a cascade is a sweep that can delete the wrong thing.
