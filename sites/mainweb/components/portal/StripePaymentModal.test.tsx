// @vitest-environment jsdom
import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StripePaymentModal } from "./StripePaymentModal";

Object.assign(globalThis, { React, IS_REACT_ACT_ENVIRONMENT: true });

type Confirmed = { error?: { message: string } };

const stripe = vi.hoisted(() => ({
  confirmPayment: vi.fn<() => Promise<Confirmed>>(),
}));
const elements = vi.hoisted(() => ({
  submit: vi.fn(async () => ({})),
}));

vi.mock("@stripe/stripe-js", () => ({
  loadStripe: vi.fn(() => Promise.resolve({})),
}));
vi.mock("@stripe/react-stripe-js", () => ({
  Elements: ({ children }: { children: React.ReactNode }) => children,
  PaymentElement: () => null,
  useStripe: () => stripe,
  useElements: () => elements,
}));
vi.mock("next-themes", () => ({ useTheme: () => ({ resolvedTheme: "dark" }) }));

let root: Root;
const onClose = vi.fn();

beforeEach(() => {
  onClose.mockClear();
  root = createRoot(document.createElement("div"));
  act(() =>
    root.render(
      React.createElement(StripePaymentModal, {
        clientSecret: "pi_secret",
        publishableKey: "pk_test_123",
        amountCents: 2500,
        onSuccess: vi.fn(),
        onClose,
        onConfirmPayment: vi.fn(async () => {}),
      }),
    ),
  );
});

afterEach(() => {
  act(() => root.unmount());
  vi.clearAllMocks();
});

const pressEscape = () =>
  act(() => {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
  });

describe("StripePaymentModal", () => {
  it("closes on Escape while idle", () => {
    pressEscape();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("refuses to close mid-charge, and closes again once the charge fails", async () => {
    let settle: (value: Confirmed) => void = () => {};
    stripe.confirmPayment.mockReturnValue(
      new Promise<Confirmed>((resolve) => (settle = resolve)),
    );

    const pay = () =>
      document.body.querySelector<HTMLButtonElement>('button[type="submit"]');
    await act(async () => pay()?.click());
    expect(stripe.confirmPayment).toHaveBeenCalledTimes(1);
    expect(pay()?.textContent).toContain("Processing");

    pressEscape();
    expect(onClose).not.toHaveBeenCalled();

    await act(async () => settle({ error: { message: "Card declined" } }));
    expect(document.body.textContent).toContain("Card declined");
    expect(pay()?.textContent).not.toContain("Processing");

    pressEscape();
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
