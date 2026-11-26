import { describe, expect, it } from "vitest";
import {
  CODES_PER_DOMAIN_PER_HOUR,
  CODES_PER_LARGE_DOMAIN_PER_HOUR,
  CODES_PER_NETWORK_PER_HOUR,
  networkOf,
  requesterCodeCaps,
} from "./auth-throttle";

describe("networkOf", () => {
  it("groups an IPv4 address with the rest of its /24", () => {
    expect(networkOf("203.0.113.7")).toBe("203.0.113.0/24");
    expect(networkOf("203.0.113.250")).toBe("203.0.113.0/24");
    expect(networkOf("203.0.114.7")).toBe("203.0.114.0/24");
  });

  it("groups an IPv6 address with the rest of its /48", () => {
    expect(networkOf("2001:db8:1:2:aaaa:bbbb:cccc:dddd")).toBe("2001:db8:1::/48");
    expect(networkOf("2001:DB8:1:2::1")).toBe("2001:db8:1::/48");
    expect(networkOf("2001:db8:2:2::1")).toBe("2001:db8:2::/48");
  });

  it("puts every /64 of one /48 in one network", () => {
    // A site is routinely given a /48, and a host there picks any of its 65,536
    // /64s: a cap per /64 would give it that many caps.
    expect(networkOf("2001:db8:1:0::1")).toBe(networkOf("2001:db8:1:ffff::1"));
    expect(networkOf("2001:db8:1:0::1")).not.toBe(networkOf("2001:db8:2:0::1"));
  });

  it("expands :: before it takes the first 48 bits", () => {
    expect(networkOf("2001:db8::1")).toBe("2001:db8:0::/48");
    expect(networkOf("::1")).toBe("0:0:0::/48");
  });

  it("treats an IPv4 address written as IPv6 as the IPv4 network", () => {
    expect(networkOf("::ffff:203.0.113.9")).toBe("203.0.113.0/24");
  });

  it("drops an IPv6 zone", () => {
    expect(networkOf("fe80::1%eth0")).toBe("fe80:0:0::/48");
  });

  it("puts anything it cannot read in one shared bucket", () => {
    expect(networkOf("unknown")).toBe("unknown");
    expect(networkOf("")).toBe("unknown");
    expect(networkOf("not an address")).toBe("unknown");
  });
});

describe("requesterCodeCaps", () => {
  const caps = (identifier: string, ip: string | null = "203.0.113.7") =>
    Object.fromEntries(
      requesterCodeCaps(identifier, ip).map((cap) => [cap.key, cap.max]),
    );

  it("caps the client's network and the address's domain", () => {
    expect(caps("a@example.test")).toEqual({
      "ip:203.0.113.0/24": CODES_PER_NETWORK_PER_HOUR,
      "domain:example.test": CODES_PER_DOMAIN_PER_HOUR,
    });
  });

  it("gives a big school and the big mail providers a larger share", () => {
    for (const domain of [
      "gatech.edu",
      "emory.edu",
      "mail.gatech.edu",
      "gmail.com",
      "outlook.com",
    ]) {
      expect(caps(`a@${domain}`)[`domain:${domain}`]).toBe(
        CODES_PER_LARGE_DOMAIN_PER_HOUR,
      );
    }
  });

  it("leaves the domain and network caps off an address that already has an account", () => {
    // A venue shares one address among everyone who applied, and nearly all of
    // them have an account already.
    const keys = requesterCodeCaps("a@gatech.edu", "203.0.113.7", {
      existingUser: true,
    }).map((cap) => cap.key);

    expect(keys).toEqual([]);
  });

  it("keeps both on one that has none", () => {
    const keys = requesterCodeCaps("a@gatech.edu", "203.0.113.7", {
      existingUser: false,
    }).map((cap) => cap.key);

    expect(keys).toEqual(["ip:203.0.113.0/24", "domain:gatech.edu"]);
  });

  it("keeps the domain cap below the deployment-wide one", () => {
    expect(CODES_PER_LARGE_DOMAIN_PER_HOUR).toBeLessThan(300);
    expect(CODES_PER_NETWORK_PER_HOUR).toBeLessThan(300);
  });

  it("is case-blind about the domain", () => {
    expect(caps("A@GATECH.EDU")["domain:gatech.edu"]).toBe(
      CODES_PER_LARGE_DOMAIN_PER_HOUR,
    );
  });

  it("charges no network when the request carries no client address", () => {
    expect(Object.keys(caps("a@example.test", null))).toEqual([
      "domain:example.test",
    ]);
  });

  it("uses the last @ for the domain", () => {
    expect(caps('"a@b"@example.test')).toHaveProperty("domain:example.test");
  });

  it("has no domain cap for something that is not an address", () => {
    expect(Object.keys(caps("no-at-sign"))).toEqual(["ip:203.0.113.0/24"]);
  });

  it("never collides with an address's own row", () => {
    for (const cap of requesterCodeCaps("a@example.test", "203.0.113.7")) {
      expect(cap.key).not.toContain("@");
    }
  });
});
