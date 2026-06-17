// Approximate on-demand Bedrock pricing (USD per 1K tokens).
// Source: AWS Bedrock pricing page (us-west-2 / us-east-1 on-demand, 2025 rates).
// These are estimates — final billing comes from AWS. Update as needed.

type Price = { input: number; output: number };

const PRICES: Record<string, Price> = {
  // Anthropic Claude
  "anthropic.claude-sonnet-4-5-20250929-v1:0": { input: 0.003, output: 0.015 },
  "anthropic.claude-sonnet-4-20250514-v1:0": { input: 0.003, output: 0.015 },
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

function stripPrefix(modelId: string): string {
  // Handle cross-region inference profile IDs like "us.anthropic.claude-..."
  // and ARNs like "arn:aws:bedrock:us-west-2:123:inference-profile/us.anthropic..."
  let id = modelId;
  if (id.startsWith("arn:")) {
    const slash = id.lastIndexOf("/");
    if (slash >= 0) id = id.slice(slash + 1);
  }
  if (/^[a-z]{2,3}\./.test(id)) id = id.slice(id.indexOf(".") + 1);
  return id;
}

export function estimateCost(
  modelId: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const key = stripPrefix(modelId);
  const p = PRICES[key];
  if (!p) return 0;
  return (inputTokens / 1000) * p.input + (outputTokens / 1000) * p.output;
}

export function knownModel(modelId: string): boolean {
  return Boolean(PRICES[stripPrefix(modelId)]);
}
