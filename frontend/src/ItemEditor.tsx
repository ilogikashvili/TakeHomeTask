import { useEffect, useRef, useState } from 'react';
import { date, Identity, json, Lookup, Row } from './api';
export function ItemEditor({ row, token, user, vendors, owners, onClose, onSaved }: { row?: Row; token: string; user: Identity; vendors: Lookup[]; owners: Lookup[]; onClose: () => void; onSaved: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const [confirmDelete, setConfirmDelete] = useState(false);
  const [history, setHistory] = useState<Array<{ id: string; action: string; createdAt: string; actor: { name: string } }>>([]);
  const [form, setForm] = useState({ reference: row?.reference || '', name: row?.name || '', vendorId: row?.vendorId || vendors[0]?.id || '', ownerId: row?.ownerId || user.ownerId || owners[0]?.id || '', category: row?.category || 'software', description: row?.description || '', amount: row?.amount || '', billingPeriod: row?.billingPeriod || 'MONTHLY', status: row?.status || 'DRAFT', autoRenew: row?.autoRenew ?? false, startDate: row ? date(row.startDate) : new Date().toISOString().slice(0, 10), endDate: row ? date(row.endDate) : '', renewalDate: row?.renewalDate ? date(row.renewalDate) : '' });
  useEffect(() => { ref.current?.showModal(); }, []);
  useEffect(() => { if (row) json<typeof history>(`/line-items/${row.id}/approvals`, token).then(setHistory).catch(error => setError(error.message)); }, [row?.id]);
  const field = (key: keyof typeof form, label: string, type = 'text', required = true) => <label>{label}<input type={type} value={String(form[key])} onChange={event => setForm({ ...form, [key]: event.target.value })} required={required} step={type === 'number' ? '.01' : undefined} min={type === 'number' ? 0 : undefined}/></label>;
  async function save(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const { vendorId, status, description, ...rest } = form;
      const body = row ? {
        ...Object.fromEntries(Object.entries(rest).filter(([, value]) => value !== '')),
        status,
        autoRenew: form.autoRenew,
        expectedVersion: row.version,
        actorId: user.ownerId,
        renewalDate: form.renewalDate || null,
      } : {
        ...Object.fromEntries(Object.entries({ ...rest, vendorId, ownerId: user.ownerId, description }).filter(([, value]) => value !== '')),
        renewalDate: form.renewalDate || undefined,
      };
      await json('/line-items' + (row ? '/' + row.id : ''), token, { method: row ? 'PATCH' : 'POST', body: JSON.stringify(body) });
      ref.current?.close();
      onClose();
      onSaved();
    } catch (error) { setError((error as Error).message + ' If this item changed, close this panel and refresh the ledger.'); } finally { setBusy(false); }
  }
  async function remove() { setBusy(true); try { await json(`/line-items/${row!.id}?expectedVersion=${row!.version}`, token, { method: 'DELETE' }); ref.current?.close(); onClose(); onSaved(); } catch (error) { setError((error as Error).message); } finally { setBusy(false); } }
  return <dialog ref={ref} className="editor" onCancel={onClose}><div className="panel-heading"><div><span className="eyebrow">SUBSCRIPTION DETAILS</span><h2>{row ? 'Edit subscription' : 'New subscription'}</h2></div><button aria-label="Close editor" className="icon-button" onClick={onClose}>×</button></div><form onSubmit={save}>
    {error && <div role="alert" className="error">{error}</div>}<div className="editor-fields">{field('reference', 'Reference', 'text', false)} {field('name', 'Subscription name')}<label>Vendor<select disabled={!!row} value={form.vendorId} onChange={event => setForm({ ...form, vendorId: event.target.value })}>{vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}</select></label><label>Owner<select disabled={user.role === 'owner'} value={form.ownerId} onChange={event => setForm({ ...form, ownerId: event.target.value })}>{owners.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</select></label><label>Category<select value={form.category} onChange={event => setForm({ ...form, category: event.target.value })}>{['software', 'hardware', 'services', 'facilities', 'travel'].map(category => <option key={category}>{category}</option>)}</select></label>{field('amount', 'Billing amount · GEL', 'number')}<label>Billing period<select value={form.billingPeriod} onChange={event => setForm({ ...form, billingPeriod: event.target.value })}>{['WEEKLY', 'MONTHLY', 'QUARTERLY', 'ANNUAL'].map(period => <option key={period}>{period}</option>)}</select></label>{field('startDate', 'Start date', 'date')}{field('endDate', 'End date', 'date')}{field('renewalDate', 'Renewal date (optional)', 'date', false)}<label><input type="checkbox" checked={form.autoRenew} onChange={event => setForm({ ...form, autoRenew: event.target.checked })}/> Auto-renews</label>{row && <label>Status<select value={form.status} onChange={event => setForm({ ...form, status: event.target.value })}>{['DRAFT', 'PENDING_APPROVAL', 'ACTIVE', 'EXPIRING', 'EXPIRED', 'TERMINATED'].map(s => <option key={s}>{s}</option>)}</select></label>}{!row && field('description', 'Description', 'text', false)}</div>
    <div className="editor-footer">{row && <button type="button" className="danger" onClick={() => setConfirmDelete(true)}>Delete subscription</button>}<button type="button" className="secondary" onClick={onClose}>Cancel</button><button disabled={busy} className="primary">{busy ? 'Saving…' : row ? 'Save changes' : 'Create subscription'}</button></div>
  </form>{confirmDelete && <div className="delete-confirm"><p>Remove this subscription from the ledger? Its history will be retained.</p><button disabled={busy} className="danger" onClick={remove}>Confirm deletion</button><button className="text-button" onClick={() => setConfirmDelete(false)}>Keep subscription</button></div>}
  {!!history.length && <div className="history"><h3>Activity</h3>{history.map(event => <p key={event.id}><strong>{event.action.toLowerCase().replaceAll('_', ' ')}</strong><span>{event.actor.name} · {date(event.createdAt)}</span></p>)}</div>}</dialog>;
}
