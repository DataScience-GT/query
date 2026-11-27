// App Router routes in sites/mainweb/app, from the folder tree: a folder with a
// page or route file is a URL, `(group)` folders are not part of it, and
// `@slot` folders are parallel routes that do not add a segment either.
import { dirname, relative, resolve } from "node:path";

import { read, rel, ROOT, walk } from "./source.ts";

const APP = resolve(ROOT, "sites/mainweb/app");
const SPECIAL =
  /^(page|layout|route|loading|error|global-error|not-found|template|default)\.(tsx?|jsx?|mdx)$/;
const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];

interface RouteFile {
  kind: string;
  file: string;
  client: boolean;
  /** HTTP methods a route handler exports. */
  methods: string[];
}

interface Route {
  url: string;
  group: string;
  files: RouteFile[];
  /** Layouts that wrap the route, outermost first. */
  layouts: string[];
}

// True when the file opens with a "use client" directive, ahead of any code.
export function isClientFile(text: string): boolean {
  let rest = text.replace(/^﻿/, "");
  for (;;) {
    rest = rest.trimStart();
    if (rest.startsWith("//"))
      rest = rest.slice(rest.indexOf("\n") + 1 || rest.length);
    else if (rest.startsWith("/*"))
      rest = rest.slice(rest.indexOf("*/") + 2 || rest.length);
    else break;
  }
  return /^(["'])use client\1/.test(rest);
}

const methodsIn = (text: string) =>
  METHODS.filter((method) =>
    new RegExp(
      `export\\s+(?:async\\s+)?(?:function|const)\\s+${method}\\b|export\\s*\\{[^}]*\\bas\\s+${method}\\b|export\\s*\\{[^}]*\\b${method}\\b[^}]*\\}`,
    ).test(text),
  );

export function routes(): Route[] {
  const byDir = new Map<string, RouteFile[]>();
  for (const file of walk(APP, (f) =>
    SPECIAL.test(f.split(/[\\/]/).pop() ?? ""),
  )) {
    const text = read(file);
    const kind = (file.split(/[\\/]/).pop() ?? "").split(".")[0];
    const dir = dirname(file);
    byDir.set(dir, [
      ...(byDir.get(dir) ?? []),
      {
        kind,
        file: rel(file),
        client: kind !== "route" && isClientFile(text),
        methods: kind === "route" ? methodsIn(text) : [],
      },
    ]);
  }
  const out: Route[] = [];
  for (const [dir, files] of byDir) {
    if (!files.some((f) => f.kind === "page" || f.kind === "route")) continue;
    const segments = relative(APP, dir).split(/[\\/]/).filter(Boolean);
    const groups = segments.filter(
      (s) => /^\(.+\)$/.test(s) && !/^\(\.{1,3}\)/.test(s),
    );
    const url =
      "/" +
      segments
        .filter(
          (s) =>
            !/^\(.*\)$/.test(s) &&
            !s.startsWith("@") &&
            !/^\(\.{1,3}\)/.test(s),
        )
        .join("/");
    const layouts: string[] = [];
    for (let i = 0; i <= segments.length; i++) {
      const ancestor = resolve(APP, ...segments.slice(0, i));
      const layout = byDir.get(ancestor)?.find((f) => f.kind === "layout");
      if (layout) layouts.push(layout.file);
    }
    out.push({ url, group: groups.join("") || "(none)", files, layouts });
  }
  return out.sort((a, b) => a.url.localeCompare(b.url));
}

export function formatRoutes(list: Route[]): string {
  return [
    `${list.length} routes in ${rel(APP)}`,
    ...list.map((route) => {
      const files = route.files
        .filter((f) =>
          ["page", "route", "loading", "error", "not-found"].includes(f.kind),
        )
        .map((f) => {
          const tag = f.methods.length
            ? ` [${f.methods.join(",")}]`
            : f.kind === "page"
              ? f.client
                ? " [client]"
                : " [server]"
              : "";
          return `${f.kind}${tag} ${f.file}`;
        });
      return [
        `${route.url}  ${route.group}`,
        ...files.map((f) => `  ${f}`),
        route.layouts.length ? `  layouts: ${route.layouts.join(" > ")}` : "",
      ]
        .filter(Boolean)
        .join("\n");
    }),
  ].join("\n");
}
