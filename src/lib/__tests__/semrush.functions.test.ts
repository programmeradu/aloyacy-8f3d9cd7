import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { callServerFn } from "./server-fn";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

const { getSeoPanel } = await import("../semrush.functions");

function tableResponse(columnNames: string[], rows: unknown[][]) {
  return { ok: true, text: async () => JSON.stringify({ data: { columnNames, rows } }) };
}

describe("getSeoPanel", () => {
  const originalLk = process.env.LOVABLE_API_KEY;
  const originalSk = process.env.SEMRUSH_API_KEY;

  beforeEach(() => {
    fetchMock.mockReset();
    process.env.LOVABLE_API_KEY = "lk";
    process.env.SEMRUSH_API_KEY = "sk";
  });

  afterEach(() => {
    process.env.LOVABLE_API_KEY = originalLk;
    process.env.SEMRUSH_API_KEY = originalSk;
  });

  it("throws when the connector keys are not configured", async () => {
    delete process.env.LOVABLE_API_KEY;
    await expect(callServerFn(getSeoPanel, undefined)).rejects.toThrow(
      "Semrush connector not configured",
    );
  });

  it("signs requests with the gateway auth headers and parses table rows", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes("domain_ranks")) {
        return tableResponse(["Db", "Dn", "Rk"], [["cy", "app.aloya.cy", "1000"]]);
      }
      if (url.includes("domain_organic")) {
        return tableResponse(["Ph", "Po"], [["bus tickets", "3"]]);
      }
      if (url.includes("domain_adwords")) {
        return tableResponse(["Ph", "Po"], [["bus tickets", "2"]]);
      }
      if (url.includes("backlinks_overview")) {
        return tableResponse(["ascore", "total"], [["50", "100"]]);
      }
      if (url.includes("backlinks_refdomains")) {
        return tableResponse(["domain", "backlinks_num"], [["example.com", "5"]]);
      }
      return tableResponse([], []);
    });

    const out = await callServerFn(getSeoPanel, undefined);

    // Auth headers present on every call
    for (const [, init] of fetchMock.mock.calls) {
      expect(init.headers.Authorization).toBe("Bearer lk");
      expect(init.headers["X-Connection-Api-Key"]).toBe("sk");
    }

    expect(out.matrix).toHaveLength(9); // 3 domains x 3 markets
    expect(out.matrix.every((m) => m.ok)).toBe(true);
    expect(out.matrix[0]?.row).toEqual({ Db: "cy", Dn: "app.aloya.cy", Rk: "1000" });
    expect(out.incumbentOrganic).toEqual([{ Ph: "bus tickets", Po: "3" }]);
    expect(out.incumbentPaid).toEqual([{ Ph: "bus tickets", Po: "2" }]);
    expect(out.aloyaOrganic).toEqual([{ Ph: "bus tickets", Po: "3" }]);
    expect(out.backlinks).toHaveLength(3);
    expect(out.backlinks[0]?.row).toEqual({ ascore: "50", total: "100" });
    expect(out.incumbentRefDomains).toEqual([{ domain: "example.com", backlinks_num: "5" }]);
    expect(out.aloyaRefDomains).toEqual([{ domain: "example.com", backlinks_num: "5" }]);
  });

  it("captures per-domain errors in the matrix/backlinks without failing the whole panel", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes("domain_ranks") && url.includes("domain=intercity-buses.com")) {
        return { ok: false, status: 500, text: async () => "server error" };
      }
      if (url.includes("backlinks_overview") && url.includes("target=intercity-buses.com")) {
        return { ok: false, status: 500, text: async () => "server error" };
      }
      return tableResponse([], []);
    });

    const out = await callServerFn(getSeoPanel, undefined);
    const failedMatrixEntry = out.matrix.find(
      (m) => m.domain === "intercity-buses.com",
    );
    expect(failedMatrixEntry?.ok).toBe(false);
    const failedBacklink = out.backlinks.find((b) => b.domain === "intercity-buses.com");
    expect(failedBacklink?.ok).toBe(false);
    // Optional sections swallow errors and default to empty arrays
    expect(out.incumbentOrganic).toEqual([]);
    expect(out.incumbentPaid).toEqual([]);
  });

  it("throws a descriptive error when the gateway body is not JSON", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 502, text: async () => "<html>bad gateway</html>" });
    // domain_ranks failures are swallowed per-entry, but the underlying error message
    // should still reflect the raw non-JSON body via the `call` helper.
    const out = await callServerFn(getSeoPanel, undefined);
    expect(out.matrix[0]?.ok).toBe(false);
    expect(out.matrix[0]?.error).toContain("Semrush 502");
  });

  it("surfaces an explicit error field from the gateway as a thrown message", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ error: "rate limited" }),
    });
    const out = await callServerFn(getSeoPanel, undefined);
    expect(out.matrix[0]?.ok).toBe(false);
    expect(out.matrix[0]?.error).toBe("rate limited");
  });
});
