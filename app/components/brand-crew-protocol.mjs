export const CREW_CHANNEL = "brandora.brand-crew";

/**
 * Accept only the current same-origin landing document and the three public UI
 * actions. A ready handshake is not authentication and carries no credentials.
 * @param {{origin: string, source: unknown, data: unknown}} event
 * @param {unknown} expectedSource
 * @param {string} expectedOrigin
 * @returns {"ready" | "login" | "demo" | null}
 */
export function readCrewAction(event, expectedSource, expectedOrigin) {
  if (
    !expectedSource ||
    event.source !== expectedSource ||
    event.origin !== expectedOrigin
  )
    return null;
  const data = event.data;
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  if (
    Object.keys(data).length !== 3 ||
    data.channel !== CREW_CHANNEL ||
    data.version !== 1
  )
    return null;
  return data.type === "ready" || data.type === "login" || data.type === "demo"
    ? data.type
    : null;
}
