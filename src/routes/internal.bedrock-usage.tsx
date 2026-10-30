import { createFileRoute } from "@tanstack/react-router";
import { ProxyUsagePanel } from "@/components/bedrock/ProxyUsagePanel";
import { CloudwatchPanel } from "@/components/bedrock/CloudwatchPanel";
import { CostExplorerPanel } from "@/components/bedrock/CostExplorerPanel";
import { assertAdminPage } from "@/lib/admin.functions";

export const Route = createFileRoute("/internal/bedrock-usage")({
  // Internal surface: 404 for anyone who is not an admin (see src/lib/admin.functions.ts).
  beforeLoad: () => assertAdminPage(),
  head: () => ({
    meta: [
      { title: "Bedrock usage · Aloya internal metering" },
      { name: "robots", content: "noindex,nofollow" },
      {
        name: "description",
        content:
          "Internal Aloya dashboard for AWS Bedrock token usage, estimated proxy cost, CloudWatch activity and Cost Explorer billed spend.",
      },
    ],
  }),
  component: BedrockUsagePage,
});

function BedrockUsagePage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-6xl px-6 py-10 space-y-8">
        <header className="space-y-2">
          <div className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
            Internal · BYOK metering
          </div>
          <h1 className="font-display text-4xl font-bold">Bedrock usage</h1>
          <p className="text-sm text-muted-foreground max-w-2xl">
            Every call routed through <span className="font-mono">/api/public/bedrock-test</span> is
            logged with model, token counts, latency, and estimated cost. Prices are approximate
            on-demand Bedrock rates, treat as a running estimate, not a bill.
          </p>
        </header>

        {/* Proxy log — our own metering, exact token counts */}
        <ProxyUsagePanel />

        {/* CloudWatch — account-wide, near real time */}
        <CloudwatchPanel />

        {/* Cost Explorer — real billed $, delayed ~8-24h */}
        <CostExplorerPanel />

        <p className="text-xs text-muted-foreground">
          Proxy log auto-refreshes every 15s. Costs are calculated from Bedrock Converse{" "}
          <span className="font-mono">usage</span> field × on-demand list price per model. Unknown
          models log 0, add pricing in <span className="font-mono">src/lib/bedrock-pricing.ts</span>
          .
        </p>
      </div>
    </div>
  );
}
