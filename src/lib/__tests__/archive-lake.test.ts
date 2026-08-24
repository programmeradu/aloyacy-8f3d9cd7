import { describe, it, expect, vi, beforeEach } from "vitest";
import { archiveTable } from "../../routes/api/public/hooks/archive-lake";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// Mock supabase admin
vi.mock("@/integrations/supabase/client.server", () => {
  return {
    supabaseAdmin: {
      from: vi.fn(),
    },
  };
});

describe("archive-lake pipeline", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("skips gracefully if the bucket binding is missing", async () => {
    const total = await archiveTable("rt_snapshots", 7, null);
    expect(total).toBe(0);
    expect(supabaseAdmin.from).not.toHaveBeenCalled();
  });

  it("fetches, paginates, uploads to R2, and deletes from Supabase", async () => {
    const mockBucket = {
      put: vi.fn().mockResolvedValue(undefined),
    };

    const mockData = [
      { id: "1", snapshot: "abc" },
      { id: "2", snapshot: "def" },
    ];
    
    const limitMock = vi.fn()
      .mockResolvedValueOnce({ data: mockData, error: null })
      .mockResolvedValueOnce({ data: [], error: null });

    const ltMock = vi.fn().mockReturnValue({ limit: limitMock });
    const selectMock = vi.fn().mockReturnValue({ lt: ltMock });
    
    const inMock = vi.fn().mockResolvedValue({ error: null });
    const deleteMock = vi.fn().mockReturnValue({ in: inMock });

    vi.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
      return {
        select: selectMock,
        delete: deleteMock,
      } as any;
    });

    const total = await archiveTable("rt_snapshots", 7, mockBucket);
    
    expect(total).toBe(2);
    expect(mockBucket.put).toHaveBeenCalledTimes(1);
    
    const putCallArgs = mockBucket.put.mock.calls[0];
    expect(putCallArgs[0]).toMatch(/^rt_snapshots\/\d{4}-\d{2}-\d{2}\/\d+\.jsonl$/);
    expect(putCallArgs[1]).toContain("{\"id\":\"1\",\"snapshot\":\"abc\"}\n{\"id\":\"2\",\"snapshot\":\"def\"}");

    expect(deleteMock).toHaveBeenCalledTimes(1);
    expect(inMock).toHaveBeenCalledWith("id", ["1", "2"]);
  });
});
