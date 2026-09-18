# Bootcamp materials

Each week of a bootcamp has one workshop row: a title, a materials ZIP, a solution ZIP and a recording link. Staff manage the rows at `/admin/bootcamp` and publish each one when it's ready. Members download from `/club/bootcamp`. Nobody else can download, including members who didn't buy the bootcamp.

Sessions themselves are ordinary events carrying `bootcamp_week` and `bootcamp_term`; see [Architecture](./architecture.md). A workshop row finds its session by `(term, week)`. There is no foreign key, so deleting a session never deletes the notebooks.

## Where things are

| Piece | Path |
| --- | --- |
| Table (metadata only) | `packages/db/src/schemas/bootcamp.ts` (`bootcamp_workshop`) |
| API | `packages/api/src/routers/bootcamp.ts` (`workshops`, `adminWorkshops`, `createWorkshop`, `updateWorkshop`, `upsertSession`, `setPublished`) |
| Upload / serve / clear one ZIP | `sites/mainweb/app/(portal)/api/bootcamp/materials/[workshopId]/[kind]/route.ts` |
| Delete a workshop | `sites/mainweb/app/(portal)/api/bootcamp/materials/[workshopId]/route.ts` |
| ZIP rules (signature, cap, names) | `sites/mainweb/lib/bootcamp-file.ts` |
| Download rule | `sites/mainweb/lib/bootcamp-route-rules.ts` |
| Caller lookup | `sites/mainweb/lib/bootcamp-access.ts` |
| Bucket client | `sites/mainweb/lib/bootcamp-storage.ts` |
| Member table / staff modal | `sites/mainweb/components/portal/BootcampMaterialsTable.tsx`, `BootcampWorkshopModal.tsx` |

## Who can download a file

- Staff can download anything, drafts and past terms included.
- A member can download a **published** file when their `member.bootcamp_term` equals the **workshop's term**, not the current term. Someone who bought the fall bootcamp keeps the fall notebooks in January. They don't get the spring ones.
- Everyone else gets **404, not 403**, so a guessed workshop id can't confirm that a draft exists.

Publishing is its own procedure (`setPublished`), separate from saving. That keeps a row hidden until its uploads have landed, and a failed upload can't leave it visible.

## Session dates

The modal's date and room fields call `upsertSession`, but only when the officer changed one of them. So saving a TBA workshop never touches an event. Term and week come from the workshop row, never from the clock, so editing a past cohort can't reach the current one.

- **Setting a date** creates the week's event, or reschedules the existing one. The QR code is minted on insert only, so printed signs keep working. The event's title is left alone on reschedule.
- **Clearing a date** detaches the event (clears `bootcamp_week`/`bootcamp_term`) rather than deleting it, because deleting an event destroys its check-ins.
- A workshop's **week is fixed** once it's created, because moving it would leave its session behind. To renumber a workshop, delete it and create it again.

## Storage

ZIPs live in `gs://dsgt-bootcamp` under `bootcamp/<workshopId>/<kind>.zip`. Postgres holds the object key, file name and size. Objects are keyed by the workshop id, which never changes. A key based on `(term, week)` would let one row's upload overwrite another row's file.

Uploads bypass tRPC and stream straight into the bucket. `uploadProcedure` caps at 2MB and superjson base64-encodes the body. The first four bytes are held until the ZIP signature checks out, and the stream stops at 20MB, which leaves headroom under Cloud Run's 32MiB request limit.

Downloads are proxied, never redirected to a signed URL, which would leave the origin and the auth check behind. The bucket keeps uniform bucket-level access and public access prevention **enforced**. The App Hosting runtime service account has `roles/storage.objectAdmin` on it.

Credentials are Application Default Credentials. Locally, run `gcloud auth application-default login`. With `BOOTCAMP_BUCKET` unset, the file routes return 503.

## Known limitation

An upload and a removal of the same file can race, because the object write and the row update can't be one transaction. With a handful of officers, the impact is low.

## Legacy table

`bootcamp_material` (#390's per-event handouts) is still declared in the schema, but nothing reads or writes it. Deploys run `drizzle-kit push`, and removing the declaration would make push stop at a DROP TABLE prompt. Drop the table in a separate change.
