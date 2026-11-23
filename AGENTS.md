# Agent notes

## ui-sdk (sites/mainweb)

Before using ui-sdk (`@ui-sdk/react`, `@ui-sdk/core`), follow the `ui-sdk` skill if it is installed, and read `sites/mainweb/node_modules/@ui-sdk/react/docs/llms.txt`. To build a new component, also search `sites/mainweb/node_modules/@ui-sdk/react/docs/core.md` by heading, and read `rendering.md` next to it.

Its styles load in `sites/mainweb/app/globals.css`: `@layer ui-sdk;` comes first, and `@ui-sdk/core/web.css` is imported into the `components` layer right after Tailwind, so Tailwind's base styles do not reset them.

The skill installs per machine and is not committed: from `sites/mainweb`, run `npx skills@latest add vercel-labs/ui --skill ui-sdk`.
