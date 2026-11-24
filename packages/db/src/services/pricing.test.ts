import { describe, expect, it } from "vitest";
import { entitlementForPayment } from "./pricing";

const pay = (amountTotal: number | null, meta?: Record<string, string>) =>
  entitlementForPayment({
    amountTotal,
    metadata: meta ? JSON.stringify(meta) : null,
  });

describe("entitlementForPayment", () => {
  it.each([
    [100, undefined],
    [100, {}],
    [100, { plan: "annual" }],
    [1000, { plan: "annual" }],
    [1500, { plan: "annual" }],
    [2500, { plan: "semester" }],
    [2500, { plan: "annual", bootcamp: "true" }],
    [1500, { plan: "semester", bootcamp: "true" }],
    [1700, undefined],
    [null, { plan: "annual" }],
  ])("buys nothing for %s with %j", (amount, meta) => {
    expect(pay(amount, meta)).toBeNull();
  });

  it("honours stated plans at the exact catalog price", () => {
    expect(pay(2500, { plan: "annual" })).toEqual({
      plan: "annual",
      bootcamp: false,
      addOnOnly: false,
    });
    expect(pay(1500, { plan: "semester" })?.plan).toBe("semester");
    expect(pay(3500, { plan: "annual", bootcamp: "true" })?.bootcamp).toBe(true);
    expect(pay(2500, { plan: "semester", bootcamp: "true" })?.plan).toBe(
      "semester",
    );
  });

  it("reads an unlabelled payment by its amount alone", () => {
    expect(pay(2500)?.plan).toBe("annual");
    expect(pay(1500)?.plan).toBe("semester");
    expect(pay(1000)?.addOnOnly).toBe(true);
  });

  it("accepts the add-on marker only at the add-on price", () => {
    expect(pay(1000, { type: "bootcamp_addon" })?.addOnOnly).toBe(true);
    expect(pay(2500, { type: "bootcamp_addon" })).toBeNull();
  });

  it("treats unreadable metadata as absent", () => {
    expect(
      entitlementForPayment({ amountTotal: 2500, metadata: "{nope" })?.plan,
    ).toBe("annual");
  });
});
