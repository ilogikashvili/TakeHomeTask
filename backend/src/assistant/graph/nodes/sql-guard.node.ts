export function isSafeSelect(sql: string): boolean {
  const normalized = sql.trim().toLowerCase();
  return normalized.startsWith('select') && !/[;]|\b(drop|delete|update|insert|alter|truncate)\b/.test(normalized);
}
