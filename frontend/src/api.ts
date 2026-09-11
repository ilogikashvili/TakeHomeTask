export type Identity = { sub: string; ownerId?: string; role: 'owner' | 'admin' };
export type Lookup = { id: string; name: string; category?: string };
export type Row = { id: string; reference: string; version: number; vendorId: string; vendorName: string; ownerId: string; name: string; category: string; status: string; billingPeriod: string; amount: string; startDate: string; endDate: string; renewalDate: string | null; autoRenew: boolean; description?: string | null };
export type Group = { totalAmount: string; matchingCount: number; category?: string; vendorId?: string; vendorName?: string };
export type Ledger = { items: Row[]; nextCursor: string | null; aggregates: { totalAmount: string; annualizedAmount: string; matchingCount: number; byVendor: Group[]; byCategory: Group[] } };
export class ApiError extends Error { constructor(message: string, public status: number) { super(message); } }
export async function request(path: string, token = '', init: RequestInit = {}) {
  const response = await fetch('/api' + path, { ...init, headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}), ...init.headers } });
  if (!response.ok) {
    if (response.status === 401 && token) window.dispatchEvent(new Event('session-expired'));
    const body = await response.json().catch(() => ({}));
    throw new ApiError(body.error?.details?.join('; ') || body.error?.message || body.message || 'Request failed', response.status);
  }
  return response;
}
export const json = async <T,>(path: string, token = '', init: RequestInit = {}): Promise<T> => (await request(path, token, init)).json();
export function money(value: string) { const [whole, fraction = '00'] = value.split('.'); return whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '.' + fraction.padEnd(2, '0').slice(0, 2); }
export const date = (value: string | null) => value ? value.slice(0, 10) : '—';
