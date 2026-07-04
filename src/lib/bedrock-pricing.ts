// Approximate on-demand Bedrock pricing (USD per 1K tokens).
// Source: AWS Bedrock pricing page (us-west-2 / us-east-1 on-demand, 2025 rates).
// These are estimates — final billing comes from AWS. Update as needed.

type Price = { input: number; output: number };

const PRICES: Record<string, Price> = {
  // Anthropic Claude — exact IDs
  "anthropic.claude-opus-4-6-v1": { input: 0.015, output: 0.075 },
  "anthropic.claude-opus-4-5-20251101-v1:0": { input: 0.015, output: 0.075 },
  "anthropic.claude-opus-4-20250514-v1:0": { input: 0.015, output: 0.075 },
  "anthropic.claude-sonnet-4-6": { input: 0.003, output: 0.015 },
  "anthropic.claude-sonnet-4-5-20250929-v1:0": { input: 0.003, output: 0.015 },
  "anthropic.claude-sonnet-4-20250514-v1:0": { input: 0.003, output: 0.015 },
  "anthropic.claude-haiku-4-5-20251001-v1:0": { input: 0.001, output: 0.005 },
  "anthropic.claude-3-7-sonnet-20250219-v1:0": { input: 0.003, output: 0.015 },
  "anthropic.claude-3-5-sonnet-20241022-v2:0": { input: 0.003, output: 0.015 },
  "anthropic.claude-3-5-sonnet-20240620-v1:0": { input: 0.003, output: 0.015 },
  "anthropic.claude-3-5-haiku-20241022-v1:0": { input: 0.0008, output: 0.004 },
  "anthropic.claude-3-haiku-20240307-v1:0": { input: 0.00025, output: 0.00125 },
  "anthropic.claude-3-opus-20240229-v1:0": { input: 0.015, output: 0.075 },
  // Meta Llama
  "meta.llama3-1-70b-instruct-v1:0": { input: 0.00072, output: 0.00072 },
  "meta.llama3-1-8b-instruct-v1:0": { input: 0.00022, output: 0.00022 },
  // Amazon Nova
  "amazon.nova-pro-v1:0": { input: 0.0008, output: 0.0032 },
  "amazon.nova-lite-v1:0": { input: 0.00006, output: 0.00024 },
  "amazon.nova-micro-v1:0": { input: 0.000035, output: 0.00014 },
};

// Fallback family prices — matched by substring when the exact ID isn't in the
// table above. Keeps totals accurate as AWS ships new dated versions.
const FAMILY_PRICES: Array<{ match: RegExp; price: Price }> = [
  { match: /claude-opus/, price: { input: 0.015, output: 0.075 } },
  {
    match: /claude-sonnet|claude-3-7-sonnet|claude-3-5-sonnet/,
    price: { input: 0.003, output: 0.015 },
  },
  { match: /claude-haiku-4|claude-3-5-haiku/, price: { input: 0.001, output: 0.005 } },
  { match: /claude-3-haiku/, price: { input: 0.00025, output: 0.00125 } },
  { match: /nova-pro/, price: { input: 0.0008, output: 0.0032 } },
  { match: /nova-lite/, price: { input: 0.00006, output: 0.00024 } },
  { match: /nova-micro/, price: { input: 0.000035, output: 0.00014 } },
  { match: /llama3.*70b/, price: { input: 0.00072, output: 0.00072 } },
  { match: /llama3.*8b/, price: { input: 0.00022, output: 0.00022 } },
];

function stripPrefix(modelId: string): string {
  // Handle ARNs and cross-region inference profile IDs like:
  //   arn:aws:bedrock:us-west-2:123:inference-profile/us.anthropic.claude-...
  //   us.anthropic.claude-...      (2-char geo)
  //   apac.anthropic.claude-...    (4-char geo)
  //   global.anthropic.claude-...  (6-char geo — new cross-region profiles)
  let id = modelId;
  if (id.startsWith("arn:")) {
    const slash = id.lastIndexOf("/");
    if (slash >= 0) id = id.slice(slash + 1);
  }
  // Strip any leading geo/region prefix before the first vendor namespace
  // (anthropic./meta./amazon./ai21./cohere./mistral./stability.).
  const vendorMatch = /(?:anthropic|meta|amazon|ai21|cohere|mistral|stability)\..+/.exec(id);
  if (vendorMatch) id = vendorMatch[0];
  return id;
}

function lookupPrice(modelId: string): Price | null {
  const key = stripPrefix(modelId);
  if (PRICES[key]) return PRICES[key];
  for (const { match, price } of FAMILY_PRICES) {
    if (match.test(key)) return price;
  }
  return null;
}

export function estimateCost(modelId: string, inputTokens: number, outputTokens: number): number {
  const p = lookupPrice(modelId);
  if (!p) return 0;
  return (inputTokens / 1000) * p.input + (outputTokens / 1000) * p.output;
}

export function knownModel(modelId: string): boolean {
  return lookupPrice(modelId) !== null;
}
