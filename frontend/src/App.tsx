import { useCallback, useEffect, useState } from 'react';
import { Identity, json, Lookup, Notification } from './api';
import { LedgerView } from './LedgerView';
import { AssistantView } from './AssistantView';
import { RemindersView } from './RemindersView';
import { DetailView } from './DetailView';
import { motion } from 'framer-motion';
import { io } from 'socket.io-client';

export default function App() {
  const [token, setToken] = useState(sessionStorage.getItem('ledger-token') || '');
  const [user, setUser] = useState<Identity>();
  const [owners, setOwners] = useState<Lookup[]>([]);
  const [vendors, setVendors] = useState<Lookup[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [notificationLoading, setNotificationLoading] = useState(false);
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const [activeOwnerId, setActiveOwnerId] = useState('');
  const [error, setError] = useState('');
  const [location, setLocation] = useState(window.location.pathname + window.location.search);
  const tab = location.startsWith('/ask') || location.startsWith('/assistant') ? 'assistant' : location.startsWith('/reminders') ? 'reminders' : 'ledger';
  const detailMatch = location.match(/^\/ledger\/([0-9a-f-]+)$/i);
  function navigate(path: string) { history.pushState({}, '', path); setLocation(path); }
  function clearSession() { setToken(''); setUser(undefined); sessionStorage.removeItem('ledger-token'); }
  useEffect(() => { const expired = () => { clearSession(); setError('Your session expired. Please sign in again.'); }; window.addEventListener('session-expired', expired); return () => window.removeEventListener('session-expired', expired); }, []);
  useEffect(() => { const listener = () => setLocation(window.location.pathname + window.location.search); window.addEventListener('popstate', listener); return () => window.removeEventListener('popstate', listener); }, []);
  useEffect(() => {
    if (!token) { setUser(undefined); setOwners([]); setVendors([]); setNotifications([]); return; }
    let active = true;
    Promise.all([json<Identity>('/auth/me', token), json<Lookup[]>('/owners', token), json<Lookup[]>('/vendors', token)])
      .then(([identity, people, companies]) => { if (active) { setUser(identity); setOwners(people); setVendors(companies); setError(''); sessionStorage.setItem('ledger-token', token); } })
      .catch(error => { if (active) { setError(error.message); setToken(''); sessionStorage.removeItem('ledger-token'); } });
    return () => { active = false; };
  }, [token]);
  useEffect(() => {
    if (!user) return;
    if (user.role === 'owner' && user.ownerId) {
      setActiveOwnerId(user.ownerId);
      return;
    }
    setActiveOwnerId(current => current || owners[0]?.id || '');
  }, [owners, user]);
  const loadNotifications = useCallback(async (ownerId: string) => {
    if (!token || !ownerId) {
      setNotifications([]);
      return;
    }
    setNotificationLoading(true);
    try {
      const data = await json<Notification[]>(`/reminders/unread?ownerId=${ownerId}`, token);
      setNotifications(data);
    } catch {
      setNotifications([]);
    } finally {
      setNotificationLoading(false);
    }
  }, [token]);
  const dismissNotification = useCallback(async (notificationId: string) => {
    if (!token || !activeOwnerId) return;
    try {
      await json(`/reminders/${notificationId}/dismiss?ownerId=${activeOwnerId}`, token, { method: 'PATCH' });
      setNotifications(current => current.filter(item => item.id !== notificationId));
    } catch {
      // Keep local state unchanged if the dismissal request fails.
    }
  }, [activeOwnerId, token]);
  useEffect(() => {
    if (!token || !activeOwnerId) {
      setNotifications([]);
      return;
    }
    void loadNotifications(activeOwnerId);
  }, [activeOwnerId, loadNotifications, token]);
  useEffect(() => {
    if (!token || !activeOwnerId) return;
    const socket = io({ auth: { token } });
    socket.on('connect', () => {
      setRealtimeConnected(true);
      socket.emit('owner.join', { ownerId: activeOwnerId });
      void loadNotifications(activeOwnerId);
    });
    socket.on('disconnect', () => setRealtimeConnected(false));
    socket.on('connect_error', () => setRealtimeConnected(false));
    socket.on('reminder.created', () => { void loadNotifications(activeOwnerId); });
    socket.on('reminder.dismissed', (event: { notificationId?: string }) => {
      if (!event?.notificationId) return;
      setNotifications(current => current.filter(item => item.id !== event.notificationId));
    });
    return () => {
      socket.disconnect();
    };
  }, [activeOwnerId, loadNotifications, token]);
  if (!user || !token) return <Login onLogin={setToken} error={error} />;
  const ownerName = owners.find(owner => owner.id === user.ownerId)?.name || 'Workspace';
  return <div className="workspace">
    <aside className="sidebar"><a className="brand" href="/ledger" onClick={event => { event.preventDefault(); navigate('/ledger'); }}><span className="brand-icon">L</span>ledger<span className="brand-dot">.</span></a>
      <span className="nav-label">WORKSPACE</span><nav aria-label="Main navigation">{(['ledger', 'assistant', 'reminders'] as const).map((name, index) => { const path = name === 'assistant' ? '/ask' : '/' + name; const isReminders = name === 'reminders'; return <a key={name} className={tab === name ? 'active' : ''} href={path} onClick={event => { event.preventDefault(); navigate(path); }}><span aria-hidden>{['▤', '✧', '◷'][index]}</span>{name[0].toUpperCase() + name.slice(1)}{isReminders && notifications.length > 0 && <span className="badge">{notifications.length}</span>}</a>; })}</nav>
      <div className="sidebar-note"><span className="live-dot"/> Connected workspace<p>One place for your subscriptions, spend, and upcoming renewals.</p></div>
      <div className="profile"><div className="avatar">{ownerName.slice(0, 1)}</div><div><strong>{ownerName}</strong><small>{user.role === 'admin' ? 'Administrator' : 'Owner access'}</small></div><button className="icon-button" title="Sign out" aria-label="Sign out" onClick={() => { void json('/auth/logout', token, { method: 'POST' }).catch(() => setError('Signed out locally; server session revocation could not be confirmed.')).finally(clearSession); }}>↗</button></div>
    </aside>
    <main><div className="topbar"><span>Workspace <span className="slash">/</span> {tab[0].toUpperCase() + tab.slice(1)}</span><span className="currency-label">{notifications.length ? `Unread reminders · ${notifications.length}` : 'GEL · Georgian lari'}</span></div>
      <motion.div key={location} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }}>
      {detailMatch && <DetailView id={detailMatch[1]} token={token} user={user} owners={owners} vendors={vendors} navigate={navigate}/>} 
      {!detailMatch && tab === 'ledger' && <LedgerView key={location} query={location.split('?')[1] || ''} token={token} user={user} owners={owners} vendors={vendors} navigate={navigate}/>} 
      {!detailMatch && tab === 'assistant' && <AssistantView token={token} navigate={navigate}/>} 
      {tab === 'reminders' && <RemindersView token={token} user={user} owners={owners} ownerId={activeOwnerId} Notifications={notifications} loading={notificationLoading} connected={realtimeConnected} onOwnerChange={setActiveOwnerId} onDismiss={dismissNotification}/>}
      </motion.div>
    </main></div>;
}

function Login({ onLogin, error }: { onLogin: (token: string) => void; error: string }) {
  const [owners, setOwners] = useState<Lookup[]>([]); const [ownerId, setOwnerId] = useState('');
  const [role, setRole] = useState('owner'); const [value, setValue] = useState(''); const [message, setMessage] = useState(error); const [busy, setBusy] = useState(false);
  useEffect(() => { json<Lookup[]>('/auth/demo/owners').then(data => { setOwners(data); setOwnerId(data[0]?.id || ''); }).catch(() => {}); }, []);
  return <div className="login"><div className="login-art"><div className="brand">ledger.</div><span className="eyebrow">THE SUBSCRIPTION WORKSPACE</span><h1>A clearer view<br/>of every commitment.</h1><p>Understand your spend.<br/>Stay ahead of renewals.</p><div className="login-grid" aria-hidden>◌</div></div><div className="login-form"><span className="eyebrow">WELCOME BACK</span><h2>Open your workspace</h2><p className="muted">Sign in with your workspace access token.</p>
    {(message || error) && <div role="alert" className="error">{message || error}</div>}
    <form onSubmit={event => { event.preventDefault(); onLogin(value.trim()); }}><label>Access token<input type="password" value={value} onChange={event => setValue(event.target.value)} required autoComplete="off"/></label><button className="primary wide">Continue →</button></form>
    {!!owners.length && <form className="demo-form" onSubmit={async event => { event.preventDefault(); setBusy(true); try { const response = await json<{ token: string }>('/auth/demo', '', { method: 'POST', body: JSON.stringify({ ownerId, role }) }); onLogin(response.token); } catch (error) { setMessage((error as Error).message); } finally { setBusy(false); } }}><span className="eyebrow">EXPLORE THE DEMO</span><label>Workspace owner<select value={ownerId} onChange={event => setOwnerId(event.target.value)}>{owners.map(owner => <option key={owner.id} value={owner.id}>{owner.name}</option>)}</select></label><label>Access<select value={role} onChange={event => setRole(event.target.value)}><option value="owner">Owner</option><option value="admin">Administrator</option></select></label><button disabled={busy} className="secondary wide">{busy ? 'Opening…' : 'Open demo workspace'}</button></form>}
    </div></div>;
}
