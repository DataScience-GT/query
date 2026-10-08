export function databaseUrl(): string | null {
  return process.env.DATABASE_URL ?? process.env.PANEL_DATABASE_URL ?? null;
}

export function requireDatabaseUrl(): string {
  const url = databaseUrl();
  if (!url) {
    throw new Error("Set DATABASE_URL to the Postgres database");
  }
  return url;
}
