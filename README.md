# Cerebra

This monorepo starter was created by **Aamogh Sawant** to help future tech directors and developers streamline their projects with a structured, scalable setup.

## Getting Started

Set up your project by running:
```sh
npx create-turbo@latest -e with-tailwind
```

This creates a fully functional, TypeScript-based monorepo with Tailwind CSS and ready-to-use tooling.

## What's Inside?

This monorepo includes several apps and packages designed to accelerate development.

### Apps and Packages

**docs** — A Next.js application with Tailwind CSS for documentation, guides, or internal knowledge sharing.

**web** — Another Next.js application with Tailwind CSS for your main website or internal dashboards.

**ui** — A shared React component library with Tailwind CSS for reusing UI components across apps. All classes are prefixed with `ui-` to avoid conflicts.

**@repo/eslint-config** — Centralized ESLint configuration, including `eslint-config-next` and `eslint-config-prettier` for consistent linting.

**@repo/typescript-config** — Pre-configured TypeScript settings for all apps and packages.

Everything is built with TypeScript for type safety and maintainable code.

## Building UI Components

The `ui` package produces compiled styles in the `dist` directory. Next.js apps consume these components using `transpilePackages` in `next.config.ts`.

### Key Benefits

- Easy sharing of a single `tailwind.config.ts` across apps and packages
- Simple package compilation with minimal dependencies
- Tailwind CSS class isolation (`ui-` prefix prevents overwriting)
- Clear package boundaries and maintainable exports

### Alternative: Consuming from Source

You can consume `ui` components directly from source without building. Update your apps' `tailwind.config.ts`:
```ts
content: [
  // app content
  `src/**/*.{js,ts,jsx,tsx}`,
  // include packages if consuming from source
  "../../packages/ui/*.{js,ts,jsx,tsx}",
]
```

If using this approach, remove `tailwindcss` and `autoprefixer` from the `ui` package.

## Utilities Included

This monorepo comes pre-configured with:

- **Tailwind CSS** — Modern, responsive styling
- **TypeScript** — Static type safety
- **ESLint** — Consistent code quality
- **Prettier** — Automatic code formatting

## Questions?

Feel free to reach out or contribute to improve this starter for the DSGT community.
