import { describe, expect, it } from "vitest";

import {
  DISCORD_LOGIN_SCOPE,
  discordLoginEnabled,
  discordProviders,
  hasVerifiedDiscordEmail,
} from "./discord";

const env = { DISCORD_CLIENT_ID: "123", DISCORD_CLIENT_SECRET: "s3cret" };

type Registered = {
  id: string;
  authorization?: { params?: { scope?: string } };
  options?: {
    checks?: string[];
    allowDangerousEmailAccountLinking?: boolean;
    authorization?: { params?: { scope?: string } };
  };
};

const registered = () => discordProviders(env)[0] as unknown as Registered;

describe("discord provider registration", () => {
  it("registers only when both client variables are set", () => {
    expect(discordProviders(env)).toHaveLength(1);
    expect(discordProviders({ DISCORD_CLIENT_ID: "123" })).toHaveLength(0);
    expect(discordProviders({ DISCORD_CLIENT_SECRET: "s" })).toHaveLength(0);
    expect(discordProviders({})).toHaveLength(0);
  });

  it("reports the same answer to the login page", () => {
    expect(discordLoginEnabled(env)).toBe(true);
    expect(discordLoginEnabled({ DISCORD_CLIENT_ID: "123" })).toBe(false);
    expect(discordLoginEnabled({})).toBe(false);
  });

  it("matches Google: pkce + state and email linking", () => {
    const { options, id } = registered();
    expect(id).toBe("discord");
    expect(options?.checks).toEqual(["pkce", "state"]);
    expect(options?.allowDangerousEmailAccountLinking).toBe(true);
  });
});

describe("discord login scope", () => {
  // Linked Roles metadata needs role_connections.write on the token. A login
  // that never asks for it cannot publish roles, whatever code runs afterwards.
  it("never asks for role_connections.write", () => {
    const provider = registered();
    const scope =
      provider.options?.authorization?.params?.scope ??
      provider.authorization?.params?.scope ??
      "";
    expect(scope.split(/\s+/).sort()).toEqual(["email", "identify"]);
    expect(scope).not.toContain("role_connections");
    expect(DISCORD_LOGIN_SCOPE).not.toContain("role_connections");
  });
});

describe("hasVerifiedDiscordEmail", () => {
  it("needs verified true and an email", () => {
    expect(hasVerifiedDiscordEmail({ verified: true, email: "a@b.co" })).toBe(
      true,
    );
    expect(hasVerifiedDiscordEmail({ verified: false, email: "a@b.co" })).toBe(
      false,
    );
    expect(hasVerifiedDiscordEmail({ email: "a@b.co" })).toBe(false);
    expect(hasVerifiedDiscordEmail({ verified: "true", email: "a@b.co" })).toBe(
      false,
    );
    expect(hasVerifiedDiscordEmail({ verified: true, email: null })).toBe(false);
    expect(hasVerifiedDiscordEmail(null)).toBe(false);
    expect(hasVerifiedDiscordEmail(undefined)).toBe(false);
  });
});
