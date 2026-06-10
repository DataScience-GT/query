import { execSync } from "node:child_process";
import type { PlopTypes } from "@turbo/gen";

type Answers = {
  name: string;
  deps?: string;
};

type PkgJson = {
  name: string;
  dependencies?: Record<string, string>;
};

function sanitizeName(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.replace(/^@forge\//, "").trim();
}

async function latestVersion(pkg: string): Promise<string> {
  const res = await fetch(
    `https://registry.npmjs.org/-/package/${pkg}/dist-tags`,
  );
  const json = await res.json();
  return `^${json.latest}`;
}

export default function register(plop: PlopTypes.NodePlopAPI): void {
  plop.setGenerator("init", {
    description: "Create a new monorepo package",
    prompts: [
      {
        type: "input",
        name: "name",
        message: "Package name",
      },
      {
        type: "input",
        name: "deps",
        message: "Dependencies (space separated)",
      },
    ],
    actions: [
      (rawAnswers) => {
        const answers = rawAnswers as Answers;
        answers.name = sanitizeName(answers.name);
        return `Scaffolding ${answers.name}`;
      },
      {
        type: "add",
        path: "packages/{{ name }}/eslint.config.js",
        templateFile: "templates/eslint.config.js.hbs",
      },
      {
        type: "add",
        path: "packages/{{ name }}/package.json",
        templateFile: "templates/package.json.hbs",
      },
      {
        type: "add",
        path: "packages/{{ name }}/tsconfig.json",
        templateFile: "templates/tsconfig.json.hbs",
      },
      {
        type: "add",
        path: "packages/{{ name }}/src/index.ts",
        template: "export const id = '{{ name }}';",
      },
      {
        type: "modify",
        path: "packages/{{ name }}/package.json",
        async transform(content, rawAnswers) {
          const answers = rawAnswers as Answers;
          if (!answers.deps) return content;

          const pkg = JSON.parse(content) as PkgJson;
          pkg.dependencies ??= {};

          const deps = answers.deps.split(/\s+/).filter(Boolean);
          for (const dep of deps) {
            pkg.dependencies[dep] = await latestVersion(dep);
          }

          return JSON.stringify(pkg, null, 2);
        },
      },
      (rawAnswers) => {
        const { name } = rawAnswers as Answers;

        execSync("pnpm install", { stdio: "inherit" });
        execSync(`pnpm prettier --write packages/${name}`, {
          stdio: "inherit",
        });

        return `Finished ${name}`;
      },
    ],
  });
}
