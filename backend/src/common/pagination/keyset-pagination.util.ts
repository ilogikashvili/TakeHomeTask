export interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
}

export function encodeCursor(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}

export function decodeCursor(value: string): string {
  return Buffer.from(value, 'base64url').toString('utf8');
}
