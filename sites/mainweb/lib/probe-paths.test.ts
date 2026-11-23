import { describe, expect, it } from "vitest";
import { isProbePath } from "./probe-paths";

describe("isProbePath", () => {
  // Taken from the CDN logs.
  it.each([
    "/phpinfo.php",
    "/wp-content/themes/hideo/network.php",
    "/randkeyword.PhP7",
    "/wp-login.php",
    "/wordpress",
    "/xmlrpc.php",
    "/phpmyadmin",
    "/pma",
    "/.env",
    "/bulk/.env",
    "/.git/config",
    "/.aws/credentials",
    "/.claude.json",
    "/.cursor/mcp.json",
    "/settings.py.bak",
    "/docker-compose.yml.old",
    "/terraform.tfvars",
    "/server.key",
    "/privatekey.pem",
    "/site.zip",
    "/logs/laravel.log",
    "/k8s/secrets.yaml",
    "/connectionstrings.config",
    "/GoogleService-Info.plist",
  ])("blocks %s", (path) => {
    expect(isProbePath(path)).toBe(true);
  });

  it.each([
    "/",
    "/team",
    "/bootcamp",
    "/events",
    "/projects",
    "/status",
    "/history",
    "/dashboard",
    "/admin/judging/interest",
    "/hackathons/abc/checkin",
    "/api/ping",
    "/schools.json",
    "/manifest.json",
    "/fonts/OFL-geist-sans.txt",
    "/.well-known/passkey-endpoints",
    "/.well-known",
    "/favicon.ico",
    "/logo512.png",
    "/sitemap.xml",
    "/robots.txt",
  ])("lets %s through", (path) => {
    expect(isProbePath(path)).toBe(false);
  });
});
