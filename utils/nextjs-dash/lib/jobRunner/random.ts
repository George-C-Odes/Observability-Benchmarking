export function getCryptoRandom(): number {
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const buffer = new Uint32Array(1);
    crypto.getRandomValues(buffer);
    return buffer[0] / (0xffffffff + 1);
  }
  return 0.5;
}

export function computeReconnectDelay(reconnectAttempt: number): number {
  const base = Math.min(2000, 250 * Math.pow(2, Math.min(3, reconnectAttempt - 1)));
  const jitter = Math.floor(getCryptoRandom() * 150);
  return base + jitter;
}
