import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { date, Identity, json, Lookup, Row } from './api';
import { ItemEditor } from './ItemEditor';

type Detail = Row & { description?: string; vendor: Lookup; owner: Lookup; approvals: Array<{ id: string; action: string; createdAt: string; note?: string | null; actor: Lookup }> };

export function DetailView({ id, token, user, owners, vendors, navigate }: { id: string; token: string; user: Identity; owners: Lookup[]; vendors: Lookup[]; navigate: (path: string) => void }) {
  const [item, setItem] = useState<Detail>();
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  useEffect(() => { json<Detail>(`/line-items/${id}`, token).then(setItem).catch(value => setError(value.message)); }, [id, token]);
  if (error) return <section className="page"><div role="alert" className="error">{error}</div></section>;
  if (!item) return <section className="page"><div role="status">Loading subscription…</div></section>;
  return <motion.section className="page" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
    <button className="text-button" onClick={() => navigate('/ledger')}>← Back to ledger</button>
    <header className="page-heading"><div><span className="eyebrow">CONTRACT DETAIL</span><h1>{item.name}</h1><p>{item.vendor.name} · {item.reference}</p></div><button className="primary" onClick={() => setEditing(true)}>Edit subscription</button></header>
    <div className="metrics"><article><span>Amount</span><strong>{item.amount} <small>GEL</small></strong><p>{item.billingPeriod.toLowerCase()}</p></article><article><span>Status</span><strong>{item.status.toLowerCase().replaceAll('_', ' ')}</strong><p>{item.autoRenew ? 'Auto-renews' : 'Does not auto-renew'}</p></article><article><span>Renewal</span><strong>{date(item.renewalDate)}</strong><p>{date(item.startDate)} to {date(item.endDate)}</p></article></div>
    <div className="panel"><div className="panel-heading"><h2>Approval history</h2></div>{item.approvals.map(event => <p key={event.id}><strong>{event.action.toLowerCase().replaceAll('_', ' ')}</strong> · {event.actor.name} · {date(event.createdAt)}{event.note ? ` · ${event.note}` : ''}</p>)}</div>
    {editing && <ItemEditor row={item} token={token} user={user} vendors={vendors} owners={owners} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); void json<Detail>(`/line-items/${id}`, token).then(setItem); }}/>} 
  </motion.section>;
}