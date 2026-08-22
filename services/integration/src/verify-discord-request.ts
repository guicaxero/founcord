const MAX_TIMESTAMP_DRIFT_MS = 5 * 60 * 1_000;

export async function verifyDiscordRequest(
  body: string,
  signatureHex: string | null,
  timestamp: string | null,
  publicKeyHex: string,
  now = Date.now(),
): Promise<boolean> {
  if (!signatureHex || !timestamp || !publicKeyHex) return false;
  const timestampMs = Number(timestamp) * 1_000;
  if (!Number.isFinite(timestampMs) || Math.abs(now - timestampMs) > MAX_TIMESTAMP_DRIFT_MS) {
    return false;
  }

  try {
    const key = await crypto.subtle.importKey(
      "raw",
      hexToBytes(publicKeyHex),
      { name: "Ed25519" },
      false,
      ["verify"],
    );
    return crypto.subtle.verify(
      { name: "Ed25519" },
      key,
      hexToBytes(signatureHex),
      new TextEncoder().encode(timestamp + body),
    );
  } catch {
    return false;
  }
}

export function hexToBytes(value: string): Uint8Array<ArrayBuffer> {
  if (value.length === 0 || value.length % 2 !== 0 || !/^[0-9a-f]+$/i.test(value)) {
    throw new Error("Invalid hexadecimal value");
  }
  const bytes = new Uint8Array(value.length / 2);
  for (let index = 0; index < value.length; index += 2) {
    bytes[index / 2] = Number.parseInt(value.slice(index, index + 2), 16);
  }
  return bytes;
}
