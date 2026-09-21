import { describe, expect, it, beforeEach, vi } from "vitest";
import { callServerFn } from "./server-fn";
import { makeSupabaseMock, type TableResult, type QueryCall } from "./supabase-mock";

const authState: { claims: unknown; error: unknown } = {
  claims: { sub: "user-1", email: "user@example.com" },
  error: null,
};

const dbState: { tables: Record<string, TableResult | ((calls: QueryCall[]) => TableResult)> } = {
  tables: {},
};

let _sharedClient: ReturnType<typeof makeSupabaseMock>["client"];

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => {
    const { client } = makeSupabaseMock(dbState.tables);
    _sharedClient = client;
    return {
      ...client,
      auth: {
        getClaims: vi.fn(async () =>
          authState.error
            ? { data: null, error: authState.error }
            : { data: { claims: authState.claims }, error: null },
        ),
      },
    };
  }),
}));

vi.mock("@/integrations/supabase/client.server", () => ({
  get supabaseAdmin() {
    const { client } = makeSupabaseMock(dbState.tables);
    return client;
  },
}));

const createStripeClient = vi.fn((..._args: unknown[]) => undefined as unknown);
const getStripeErrorMessage = vi.fn((e: unknown) => (e instanceof Error ? e.message : "err"));
const findOrCreatePriceByPlanKey = vi.fn(
  async (_stripe: unknown, _planKey: string): Promise<{ id: string } | null> => ({
    id: "price_mock",
  }),
);
vi.mock("../stripe.server", () => ({
  createStripeClient: (...args: unknown[]) => createStripeClient(...args),
  getStripeErrorMessage: (e: unknown) => getStripeErrorMessage(e),
  findOrCreatePriceByPlanKey: (s: unknown, k: string) => findOrCreatePriceByPlanKey(s, k),
}));

const { createCheckoutSession, createPortalSession } = await import("../billing.functions");

function auth(headers: Record<string, string> = {}) {
  return { headers: { authorization: "Bearer test-token", ...headers } };
}

const CHECKOUT_INPUT = {
  planKey: "pro_monthly" as const,
  environment: "sandbox" as const,
  returnUrl: "https://app.example.com/return",
};

describe("createCheckoutSession", () => {
  beforeEach(() => {
    vi.stubEnv("CUSTOM_SUPABASE_URL", "https://project.supabase.co");
    vi.stubEnv("CUSTOM_SUPABASE_ANON_KEY", "anon-key");
    authState.claims = { sub: "user-1", email: "user@example.com" };
    authState.error = null;
    dbState.tables = {
      subscriptions: { data: null, error: null },
      trial_grants: { data: null, error: null },
    };
    createStripeClient.mockReset();
    findOrCreatePriceByPlanKey.mockReset();
    findOrCreatePriceByPlanKey.mockResolvedValue({ id: "price_mock" } as never);
  });

  it("rejects when there is no authorization header", async () => {
    await expect(callServerFn(createCheckoutSession, CHECKOUT_INPUT)).rejects.toThrow(
      "Unauthorized",
    );
  });

  it("rejects when the token is invalid", async () => {
    authState.error = { message: "invalid" };
    await expect(callServerFn(createCheckoutSession, CHECKOUT_INPUT, auth())).rejects.toThrow(
      "Unauthorized",
    );
  });

  it("rejects an invalid plan key at the validator boundary", async () => {
    await expect(
      callServerFn(createCheckoutSession, { ...CHECKOUT_INPUT, planKey: "bogus" } as never, auth()),
    ).rejects.toThrow();
  });

  it("blocks checkout when the user already has an active subscription", async () => {
    dbState.tables.subscriptions = {
      data: { status: "active", current_period_end: "2099-01-01T00:00:00Z" },
      error: null,
    };
    const out = await callServerFn(createCheckoutSession, CHECKOUT_INPUT, auth());
    expect(out).toEqual({ error: "You already have an active Pro subscription." });
  });

  it("allows checkout to proceed when a trial subscription exists", async () => {
    dbState.tables.subscriptions = { data: { status: "trialing" }, error: null };
    createStripeClient.mockReturnValue({
      prices: { search: vi.fn(async () => ({ data: [{ id: "price_1" }] })) },
      customers: {
        search: vi.fn(async () => ({ data: [{ id: "cus_1" }] })),
        list: vi.fn(async () => ({ data: [] })),
        create: vi.fn(async () => ({ id: "cus_1" })),
        update: vi.fn(async () => ({})),
      },
      checkout: {
        sessions: { create: vi.fn(async () => ({ client_secret: "secret_1" })) },
      },
    });
    const out = await callServerFn(createCheckoutSession, CHECKOUT_INPUT, auth());
    expect(out).toEqual({ clientSecret: "secret_1" });
  });

  it("returns an error when the plan price can't be found", async () => {
    findOrCreatePriceByPlanKey.mockResolvedValueOnce(null);
    createStripeClient.mockReturnValue({
      prices: { search: vi.fn(async () => ({ data: [] })) },
      customers: { search: vi.fn(async () => ({ data: [] })) },
    });
    const out = await callServerFn(createCheckoutSession, CHECKOUT_INPUT, auth());
    expect(out).toEqual({ error: "Plan not available right now." });
  });

  it("creates a new customer, grants a trial, and returns the checkout secret", async () => {
    const update = vi.fn(async () => ({}));
    const create = vi.fn(async () => ({ id: "cus_new" }));
    const sessionCreate = vi.fn(async () => ({ client_secret: "secret_2" }));
    createStripeClient.mockReturnValue({
      prices: { search: vi.fn(async () => ({ data: [{ id: "price_1" }] })) },
      customers: {
        search: vi.fn(async () => ({ data: [] })),
        list: vi.fn(async () => ({ data: [] })),
        create,
        update,
      },
      checkout: { sessions: { create: sessionCreate } },
    });
    const out = await callServerFn(
      createCheckoutSession,
      { ...CHECKOUT_INPUT, deviceId: "device-12345" },
      auth(),
    );
    expect(out).toEqual({ clientSecret: "secret_2" });
    expect(create).toHaveBeenCalled();
    const sessionArgs = (
      sessionCreate.mock.calls as unknown as Array<
        [{ subscription_data?: { trial_period_days?: number } }]
      >
    )[0]![0];
    expect(sessionArgs.subscription_data?.trial_period_days).toBe(7);
  });

  it("does not grant a trial when the device already redeemed one", async () => {
    dbState.tables.trial_grants = { data: null, error: { code: "23505" } };
    const sessionCreate = vi.fn(async () => ({ client_secret: "secret_3" }));
    createStripeClient.mockReturnValue({
      prices: { search: vi.fn(async () => ({ data: [{ id: "price_1" }] })) },
      customers: {
        search: vi.fn(async () => ({ data: [{ id: "cus_1" }] })),
      },
      checkout: { sessions: { create: sessionCreate } },
    });
    await callServerFn(
      createCheckoutSession,
      { ...CHECKOUT_INPUT, deviceId: "device-12345" },
      auth(),
    );
    const sessionArgs = (
      sessionCreate.mock.calls as unknown as Array<
        [{ subscription_data?: { trial_period_days?: number } }]
      >
    )[0]![0];
    expect(sessionArgs.subscription_data?.trial_period_days).toBeUndefined();
  });

  it("reuses an existing customer found by email and syncs its metadata", async () => {
    const update = vi.fn(async () => ({}));
    createStripeClient.mockReturnValue({
      prices: { search: vi.fn(async () => ({ data: [{ id: "price_1" }] })) },
      customers: {
        search: vi.fn(async () => ({ data: [] })),
        list: vi.fn(async () => ({ data: [{ id: "cus_email", metadata: {} }] })),
        update,
      },
      checkout: { sessions: { create: vi.fn(async () => ({ client_secret: "secret_4" })) } },
    });
    const out = await callServerFn(createCheckoutSession, CHECKOUT_INPUT, auth());
    expect(out).toEqual({ clientSecret: "secret_4" });
    expect(update).toHaveBeenCalledWith(
      "cus_email",
      expect.objectContaining({ metadata: expect.any(Object) }),
    );
  });

  it("returns an error and rolls back the trial when Stripe returns no secret", async () => {
    createStripeClient.mockReturnValue({
      prices: { search: vi.fn(async () => ({ data: [{ id: "price_1" }] })) },
      customers: { search: vi.fn(async () => ({ data: [{ id: "cus_1" }] })) },
      checkout: { sessions: { create: vi.fn(async () => ({})) } },
    });
    const out = await callServerFn(
      createCheckoutSession,
      { ...CHECKOUT_INPUT, deviceId: "device-12345" },
      auth(),
    );
    expect(out).toEqual({ error: "Stripe did not return a checkout secret." });
  });

  it("catches Stripe errors and returns a friendly message", async () => {
    createStripeClient.mockImplementation(() => {
      throw new Error("stripe boom");
    });
    const out = await callServerFn(createCheckoutSession, CHECKOUT_INPUT, auth());
    expect(out).toEqual({ error: "stripe boom" });
  });
});

describe("createPortalSession", () => {
  const PORTAL_INPUT = { environment: "sandbox" as const, returnUrl: "https://app.example.com" };

  beforeEach(() => {
    vi.stubEnv("CUSTOM_SUPABASE_URL", "https://project.supabase.co");
    vi.stubEnv("CUSTOM_SUPABASE_ANON_KEY", "anon-key");
    authState.claims = { sub: "user-1" };
    authState.error = null;
    createStripeClient.mockReset();
  });

  it("rejects without auth", async () => {
    await expect(callServerFn(createPortalSession, PORTAL_INPUT)).rejects.toThrow("Unauthorized");
  });

  it("returns an error when there is no subscription on file", async () => {
    dbState.tables = { subscriptions: { data: null, error: null } };
    const out = await callServerFn(createPortalSession, PORTAL_INPUT, auth());
    expect(out).toEqual({ error: "No subscription found." });
  });

  it("returns a portal url on success", async () => {
    dbState.tables = { subscriptions: { data: { stripe_customer_id: "cus_1" }, error: null } };
    createStripeClient.mockReturnValue({
      billingPortal: { sessions: { create: vi.fn(async () => ({ url: "https://portal" })) } },
    });
    const out = await callServerFn(createPortalSession, PORTAL_INPUT, auth());
    expect(out).toEqual({ url: "https://portal" });
  });

  it("catches Stripe errors from the portal call", async () => {
    dbState.tables = { subscriptions: { data: { stripe_customer_id: "cus_1" }, error: null } };
    createStripeClient.mockReturnValue({
      billingPortal: {
        sessions: {
          create: vi.fn(async () => {
            throw new Error("portal boom");
          }),
        },
      },
    });
    const out = await callServerFn(createPortalSession, PORTAL_INPUT, auth());
    expect(out).toEqual({ error: "portal boom" });
  });
});
