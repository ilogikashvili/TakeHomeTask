import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { date, Identity, json, Lookup } from './api';
type Notification = { id: string; createdAt: string; reminder: { renewalDate: string; lineItemId: string; lineItem?: { name: string } } | null };
export function RemindersView({ token, user, owners }: { token: string; user: Identity; owners: Lookup[] }) {
  const [ownerId, setOwnerId] = useState(user.ownerId || owners[0]?.id || ''); const [items, setItems] = useState<Notification[]>([]); const [error, setError] = useState(''); const [connected, setConnected] = useState(false); const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    const load = () => json<Notification[]>('/reminders/unread?ownerId=' + ownerId, token).then(data => { if (alive) { setItems(data); setError(''); } }).catch(error => { if (alive) setError(error.message); }).finally(() => { if (alive) setLoading(false); });
    setLoading(true); load();
    const socket = io({ auth: { token } });
    socket.on('connect', () => { setConnected(true); socket.emit('owner.join', { ownerId }); load(); });
    socket.on('disconnect', () => setConnected(false)); socket.on('connect_error', () => setConnected(false)); socket.on('reminder.created', load);
    const refresh = setInterval(load, 30000);
    return () => { alive = false; clearInterval(refresh); socket.disconnect(); };
  }, [ownerId, token]);
  async function dismiss(id: string) { try { await json(`/reminders/${id}/dismiss?ownerId=${ownerId}`, token, { method: 'PATCH' }); setItems(current => current.filter(item => item.id !== id)); } catch (error) { setError((error as Error).message); } }
  return <section className="page"><header className="page-heading"><div><span className="eyebrow">STAY AHEAD</span><h1>Upcoming renewals</h1><p>Make the next decision before the next billing cycle.</p></div><span className="connection"><span className={connected ? 'live-dot' : 'offline-dot'}/>{connected ? 'Live updates connected' : 'Checking for updates every 30 seconds'}</span></header>{user.role === 'admin' && <label className="owner-select">Owner<select value={ownerId} onChange={event => setOwnerId(event.target.value)}>{owners.map(owner => <option key={owner.id} value={owner.id}>{owner.name}</option>)}</select></label>}{error && <div role="alert" className="error">{error}</div>}<div className="panel reminders"><div className="panel-heading"><h2>Unread reminders <span className="count">{items.length}</span></h2></div>{loading ? <div className="table-state">Loading reminders…</div> : !items.length ? <div className="empty-state"><span>✓</span><h2>You're all caught up.</h2><p>New renewal reminders will appear here.</p></div> : items.map(item => <article className="reminder" key={item.id}><span className="calendar-icon">◷</span><div><h3>{item.reminder?.lineItem?.name || 'Subscription renewal'}</h3><p>Renews {date(item.reminder?.renewalDate || null)}</p><small>Added {date(item.createdAt)}</small></div><button className="secondary" onClick={() => dismiss(item.id)}>Dismiss</button></article>)}</div></section>;
}
