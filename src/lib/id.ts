/**
 * Gera um UUID v4. Usa crypto.randomUUID quando disponível e cai num fallback
 * baseado em crypto.getRandomValues para contextos que não o expõem
 * (navegadores antigos, jsdom sem secure context).
 */
export function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  // Marca a versão (4) e a variante (RFC 4122), como manda a especificação.
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;

  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Instante atual em ISO 8601, para os campos de auditoria. */
export function nowTimestamp(): string {
  return new Date().toISOString();
}
