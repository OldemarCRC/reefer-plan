/**
 * Builds a MongoDB query fragment that filters documents by serviceCode.
 * An empty serviceFilter means global access — returns {} (no filter applied).
 */
export function buildServiceFilter(serviceFilter: string[]): Record<string, unknown> {
  if (!serviceFilter || serviceFilter.length === 0) return {};
  return { serviceCode: { $in: serviceFilter } };
}
