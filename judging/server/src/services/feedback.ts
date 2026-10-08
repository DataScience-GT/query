export function feedbackStatus(input: {
  published: boolean;
  tokenMatches: boolean;
}): "ok" | "forbidden" {
  if (!input.published || !input.tokenMatches) return "forbidden";
  return "ok";
}

export function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const upper = sorted[mid] ?? 0;
  if (sorted.length % 2 === 1) return upper;
  const lower = sorted[mid - 1] ?? upper;
  return (lower + upper) / 2;
}
