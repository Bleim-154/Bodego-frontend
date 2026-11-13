/** PostgreSQL Long IDs must survive JSON/JavaScript conversion without precision loss. */
export function backendIdentifier(value: unknown): number {
  if (
    (typeof value !== 'number' && typeof value !== 'string') ||
    !/^[1-9][0-9]*$/.test(String(value)) ||
    !Number.isSafeInteger(Number(value))
  ) {
    throw new Error('El identificador no es válido para el backend.');
  }
  return Number(value);
}
