export function serverEnv() {
  return {
    databaseUrl: process.env.DATABASE_URL ?? process.env.PANEL_DATABASE_URL ?? "",
    jwtSecret: process.env.PANEL_JWT_SECRET ?? "",
    jwksUrl: process.env.PANEL_JWKS_URL,
    devAuth: process.env.PANEL_DEV_AUTH === "1",
    smtpUrl: process.env.PANEL_SMTP_URL,
    port: Number(process.env.PORT ?? 8787),
    redisUrl: process.env.REDIS_URL,
  };
}
