/**
 * Sort model providers so the Flare provider ("flare", case-insensitive)
 * appears first in any list. Flare is the platform's own model family
 * (Flare X, Aeon, etc.) and we want it pinned at the top of every
 * picker so users reach the in-house models first.
 *
 * Other providers keep their relative order (stable sort).
 */
export const sortProvidersFlareFirst = <T extends { provider: string }>(
  providers: readonly T[] | undefined,
): T[] => {
  if (!providers || providers.length === 0) return [];
  const flare: T[] = [];
  const rest: T[] = [];
  for (const p of providers) {
    if (p.provider && p.provider.toLowerCase() === "flare") {
      flare.push(p);
    } else {
      rest.push(p);
    }
  }
  return [...flare, ...rest];
};
