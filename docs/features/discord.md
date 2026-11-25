# Discord link

Accepted Hacklytics hackers connect their Discord account from the Hackathon Hub. There is no bot in the server. Roles come from Discord's Linked Roles: the site publishes a few metadata values for the user, and the server's roles are tied to them.

Who can link: a participant of that hackathon whose status is `approved` or `checked_in`, from the moment they are accepted. One Discord account links to one participant per hackathon.

## What the hacker sees

- Accepted and not linked: the dashboard's next step reads "Join the Hacklytics Discord". The same card is on the hackathon page. The button goes to `/api/discord/connect`, and after a successful link sends them straight to the server invite (`DISCORD_INVITE_URL`).
- Participants who answered "Yes" to Ramadan fasting see an unticked checkbox: "Add the Ramadan meals role. Others in the server can see your roles." Nobody else sees it.
- Linked: "Linked as @name", their food group, "Already in the server? Update my roles" (runs the same flow again and returns to the portal) and "Unlink".
- Inside Discord the hacker opens the server menu, then Linked Roles, and connects Hacklytics to claim their roles. Roles are claimed by the user in Discord; the site cannot hand them out.
- Unlink only clears what the site stored. The connection stays in Discord until the user removes it under Settings > Connections.

## Food groups

Eight flower groups, defined in one place: `FOOD_GROUPS` in `packages/api/src/services/discord/config.ts`. Each has a stable `key` (stored in the database), a `number` (sent to Discord as `food_group`) and a display name. Changing the list needs no migration. Keep numbers stable once server roles point at them.

| Number | Group |
| --- | --- |
| 1 | Cherry Blossom |
| 2 | Sunflower |
| 3 | Tulip |
| 4 | Lily |
| 5 | Lotus |
| 6 | Daisy |
| 7 | Orchid |
| 8 | Rose |

A participant gets the group with the fewest members in their hackathon so far (ties random). Assignment runs in a transaction that locks the hackathon row, so concurrent assignments stay balanced. It happens automatically whenever anyone is accepted or checked in (single or bulk status change, acceptance wave, mass acceptance email, event check-in): every accepted participant without a group gets one right after, which also covers people accepted before that existed. If that step fails the acceptance still stands, and the group is assigned the first time the participant's Discord card loads or they link. Existing groups are never changed. There is no admin button.

## Setup

1. In the [Discord developer portal](https://discord.com/developers/applications) create an application.
2. OAuth2: add the redirect `https://datasciencegt.org/api/discord/callback`. Copy the client ID and client secret.
3. General Information: set "Linked Roles Verification URL" to `https://datasciencegt.org/api/discord/connect`. It needs no hackathon parameter; the site picks the current edition the user is accepted to.
4. Register the metadata fields once, from a laptop (not committed anywhere):

   ```
   DISCORD_CLIENT_ID=... DISCORD_BOT_TOKEN=... node tooling/scripts/src/discord-register-metadata.ts
   ```

   The bot token is only the application's own credential for this one call. The application's bot user is never invited to the server, and the website never reads `DISCORD_BOT_TOKEN`.
5. In the server, create the roles, then Server Settings > Roles > (role) > Links > add requirement:
   - Cherry Blossom: `food_group` equals 1. Sunflower 2, Tulip 3, Lily 4, Lotus 5, Daisy 6, Orchid 7, Rose 8. Role names in the DS@GT server are "Bloom · <flower>".
   - Ramadan meals: `ramadan` equals true.
   - Optional Hacklytics role: `accepted` equals true.
6. Set the server invite (a permanent invite link) and the app credentials as runtime env vars.

## Environment variables

| Variable | Used by | Notes |
| --- | --- | --- |
| `DISCORD_CLIENT_ID` | app | Required. |
| `DISCORD_CLIENT_SECRET` | app | Required. |
| `DISCORD_INVITE_URL` | app | Required, `https://` invite to the DS@GT server. |
| `DISCORD_BOT_TOKEN` | setup script only | Never set on the app. |

Unless all three required variables are set the feature is hidden and `/api/discord/*` answers 404. In `apphosting.yaml` they are commented out until the secrets exist.

## Flow

`GET /api/discord/connect?hackathon=ID&ramadan=1|0&then=invite` checks the user is accepted, signs a 10 minute `state` (HMAC with `AUTH_SECRET`: user, hackathon, Ramadan choice, destination, nonce, expiry), sets it in an httpOnly SameSite=Lax cookie and redirects to Discord with scopes `identify role_connections.write`.

`GET /api/discord/callback` verifies the state signature, expiry, cookie and signed-in user, exchanges the code, reads `/users/@me`, stores the Discord id, username and time, then `PUT`s `/users/@me/applications/{client id}/role-connection` as the user with `accepted`, `food_group` and `ramadan` (1 only when opted in and fasting is "Yes"). The access token is never stored. Failures return to the hackathon page with `?discord=error&reason=` (`bad_code`, `rate_limited`, `discord_denied`, `discord_error`, `already_linked`, `not_accepted`, `bad_state`, `cancelled`); success returns `?discord=linked` or goes to the invite.

## Admin

Attendee details and the CSV export include Discord username, food group and Ramadan opt-in. Bug testers are refused on those reads and on the backfill.
