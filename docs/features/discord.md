# Discord link

Hacklytics hackers, judges and volunteers connect their Discord account from the portal. There is no bot in the server. Roles come from Discord's Linked Roles: the site publishes a few metadata values for the user, and the server's roles are tied to them.

Discord is also a sign-in option on `/login`, on the same application. That is a separate thing: signing in with Discord grants no roles and links nothing. See [Signing in with Discord](#signing-in-with-discord).

## Who can link

Three roles, held independently. One person can hold several, and the site publishes all of them in one update. The model is `DiscordRoles` in `packages/api/src/services/discord/roles.ts`; `discordContext` reads it from the database and `resolveConnectTarget` refuses anyone who holds none.

| Role | Who | Joining is |
| --- | --- | --- |
| Hacker | A participant whose status is `approved` and who pressed "I'm coming" on the hackathon Overview (`attendance_confirmed_at` is set), or who is `checked_in`. Being accepted alone is not enough. | Optional |
| Judge | A `judge` row for that edition with `is_active` true, which is what approval sets. A pending, rejected or removed judge holds nothing. | Required |
| Volunteer | An active, unexpired `admin` row with role `volunteer` (added on the staff page). Volunteers are org-wide, not per edition, so the role applies to any edition that is `open`, `closed` or `in_progress`: registration has opened and the event is not over. Not a draft, an announcement, a finished or a cancelled edition. Full staff are not volunteers. | Required |

Judges and volunteers need no registration. The edition is the one in the link (`?hackathon=ID`), or, from Discord's verification URL, the newest edition that is not cancelled or over in which the person holds a role. A confirmed hacker who is also a judge gets both. One Discord account links to one person: `discord_link.discord_user_id` is unique, and the same account may not sit on another person's registration for that hackathon.

Where the link is stored:

- `discord_link` holds one row per user (id and username only, never the token). Every link writes it.
- A confirmed hacker's link is also copied onto their `hackathon_participant` row (`discord_*` columns), which carries the Ramadan choice and feeds the admin roster. Hackers who linked before judges and volunteers could keep that link as it is: the portal reads the participant row first, then `discord_link`.
- Unlink clears both. It does not need the person to be eligible, so someone who un-confirms, or is removed as a judge, can still unlink. Their existing link and the roles already published stay until they update their roles or remove the connection in Discord. The site cannot revoke a role it has no token for.

## What the hacker sees

- Accepted and not yet confirmed: the dashboard's next step reads "Confirm you're coming" and the hackathon Overview shows the card with "Confirm you're coming to get the Discord invite." No invite and no link until they do. Their flower still shows, because it is also their meal wave and is assigned on acceptance.
- Confirmed and not linked: the dashboard's next step reads "Join the Hacklytics Discord". The same card is on the hackathon page. The button goes to `/api/discord/connect` and, after a successful link, sends them to the server invite.
- Participants who answered "Yes" to Ramadan fasting see an unticked checkbox: "Add the Ramadan meals role. Others in the server can see your roles." Nobody else sees it.
- Linked: "Linked as @name", their flower, "Update my roles" (runs the same flow again and returns to the portal) and "Unlink".
- Inside Discord the hacker opens the server menu, then Linked Roles, and connects Hacklytics to claim their roles. Roles are claimed by the user in Discord; the site cannot hand them out.
- Unlink only clears what the site stored. The connection stays in Discord until the user removes it under Settings > Connections.

## What judges and volunteers see

- Judges: a card at the top of the judge page (`/judge`). It reads "Join the Hacklytics Discord. It's required for judges: schedules and room changes are posted there." The approval email and the added-by-organizer email say the same and point to the portal step.
- Volunteers: the same card at the top of the check-in desk (`/scan`): "It's required for volunteers: shifts and desk changes are posted there." There is no volunteer email, because a volunteer is added on the staff page and nothing is sent; the card is the notice.
- Someone who is both reads "judges and volunteers". After linking they return to the page the card is on (hackers to the hackathon page, judges to `/judge`, volunteers to `/scan`), or go on to the server invite.
- Judges and volunteers have no flower and no Ramadan choice.

## Flowers

Only hackers have a flower ("Your bloom"). In code and the database it is a food group, because it also decides the meal wave. The eight groups live in one place, `FOOD_GROUPS` in `packages/api/src/services/discord/config.ts`. Each has a stable `key` (stored in the database), a `number` (sent to Discord as `food_group`) and a display name. Changing the list needs no migration. Keep numbers stable once server roles point at them.

| Number | Flower |
| --- | --- |
| 1 | Cherry Blossom |
| 2 | Sunflower |
| 3 | Tulip |
| 4 | Lily |
| 5 | Lotus |
| 6 | Daisy |
| 7 | Orchid |
| 8 | Rose |

Assignment is automatic and does not wait for the "I'm coming" answer. Whenever anyone is accepted or checked in (single or bulk status change, acceptance wave, mass acceptance email, event check-in), every accepted participant without a flower gets one right after, oldest registration first. Each takes the flower with the fewest members in that hackathon (ties random). The assignment runs in a transaction that locks the hackathon row, so concurrent assignments stay balanced. Existing flowers are never changed. If the assignment fails, the acceptance still stands and the flower is assigned the first time the participant's Discord card loads or they link.

## Setup

1. In the [Discord developer portal](https://discord.com/developers/applications) create an application.
2. OAuth2: add the redirect `https://datasciencegt.org/api/discord/callback` (the link) and `https://datasciencegt.org/api/auth/callback/discord` (sign-in). Copy the client ID and client secret.
3. General Information: set "Linked Roles Verification URL" to `https://datasciencegt.org/api/discord/connect`. It needs no hackathon parameter; the site picks the newest live edition in which the user holds a role.
4. Register the metadata fields once, from a laptop:

   ```
   DISCORD_CLIENT_ID=... DISCORD_BOT_TOKEN=... node tooling/scripts/src/discord-register-metadata.ts
   ```

   This registers five fields, the most Discord allows: `accepted`, `food_group` (labelled "Bloom"), `ramadan`, `judge` and `volunteer`. The call replaces the whole set, so **re-run it once** after this change ships; the first three are unchanged. The bot token is the application's own credential for this one call. The application's bot user is never invited to the server, and the website never reads `DISCORD_BOT_TOKEN`.
5. In the server, create the roles, then Server Settings > Roles > (role) > Links > add requirement:
   - Flowers: `food_group` equals 1 for Cherry Blossom, up to 8 for Rose (see the table). Role names in the DS@GT server are "Bloom · <flower>".
   - Ramadan meals: `ramadan` equals true.
   - Optional Hacklytics role: `accepted` equals true. It now means a hacker who confirmed they are coming, not merely one who was accepted.
   - "Hacklytics 2027 Judge": `judge` equals true.
   - "Hacklytics 2027 Volunteer": `volunteer` equals true.

   Each requirement is on its own role; give a role only the one requirement it needs. Judges and volunteers have no `food_group` or `ramadan` value, so no flower or Ramadan role can match them.
6. Create the client secret in Secret Manager and let the App Hosting backend read it:

   ```
   firebase apphosting:secrets:set discord-client-secret
   firebase apphosting:secrets:grantaccess discord-client-secret --backend query
   ```

## Configuration

`apphosting.yaml` sets the three runtime variables. The app id and the invite are public and live there as values; only the client secret is a secret.

| Variable | Source | Notes |
| --- | --- | --- |
| `DISCORD_CLIENT_ID` | `apphosting.yaml` value | The application id. |
| `DISCORD_INVITE_URL` | `apphosting.yaml` value | A permanent `https://` invite to the DS@GT server. |
| `DISCORD_CLIENT_SECRET` | secret `discord-client-secret` | Needs the `grantaccess` step above. |
| `DISCORD_BOT_TOKEN` | setup script only | Never set on the app. |

Unless the three app variables are set the feature is hidden and `/api/discord/*` answers 404.

## Flow

`GET /api/discord/connect?hackathon=ID&ramadan=1|0&then=invite` checks the user holds a role for that edition (see [Who can link](#who-can-link)), signs a 10 minute `state` (HMAC with `AUTH_SECRET`: user, hackathon, Ramadan choice, destination, nonce, expiry) and redirects to Discord with scopes `identify role_connections.write`.

`GET /api/discord/callback` verifies the state signature, expiry and signed-in user, exchanges the code, reads `/users/@me`, stores the Discord id, username and time, then `PUT`s `/users/@me/applications/{client id}/role-connection` as the user. The metadata is built by `roleMetadata` from the roles the person holds:

| Key | Value |
| --- | --- |
| `accepted` | 1 only for a confirmed hacker, else 0 |
| `food_group` | The flower number, sent only to a confirmed hacker |
| `ramadan` | 1 only when opted in and fasting is "Yes", sent only to a confirmed hacker |
| `judge` | 1 or 0 |
| `volunteer` | 1 or 0 |

If that `PUT` fails the stored link is rolled back to what it was before. The access token is never stored. Failures return to the page the person's card is on (the hackathon page, `/judge` or `/scan`) with `?discord=error&reason=` (`bad_code`, `rate_limited`, `discord_denied`, `discord_error`, `already_linked`, `not_accepted`, `bad_state`, `cancelled`); success returns `?discord=linked` or goes to the invite.

## Signing in with Discord

`/login` offers Discord next to Google and the email code (`packages/auth/src/discord.ts`). It is registered only when `DISCORD_CLIENT_ID` and `DISCORD_CLIENT_SECRET` are both set, and the button shows under the same condition. `DISCORD_INVITE_URL` is not needed for sign-in.

- It asks for the scopes `identify email`, never `role_connections.write`. A sign-in token cannot publish Linked Roles metadata.
- Nothing on the sign-in path calls Discord's role-connection endpoint or sets `hackathon_participants.discord_*`. Auth.js stores the usual `user` and `account` rows and nothing else. Roles still come only from `/api/discord/connect` and its callback, after a hacker is accepted, and only if they press the button there. The Discord account they signed in with and the one they link may differ.
- Only a verified email counts. Discord's profile has `verified`; the `signIn` callback refuses the sign-in unless it is `true` and an email is present. The provider links to an existing member by email like Google does, so an address Discord has not confirmed must never be used.

## Admin

Attendee details and the CSV export include Discord username, food group and Ramadan opt-in. Bug testers are refused on those reads.
