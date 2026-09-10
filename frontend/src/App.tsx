import { useEffect, useState } from 'react';
import { Identity, json, Lookup } from './api';
import { LedgerView } from './LedgerView';
import { AssistantView } from './AssistantView';
import { RemindersView } from './RemindersView';

export default function App() {
  const [token, setToken] = useState(sessionStorage.getItem('ledger-token') || '');
  const [user, setUser] = useState<Identity>();
  const [owners, setOwners] = useState<Lookup[]>([]);
  const [vendors, setVendors] = useState<Lookup[]>([]);
  const [error, setError] = useState('');
  const [location, setLocation] = useState(window.location.pathname + window.location.search);
  const tab = location.startsWith('/assistant') ? 'assistant' : location.startsWith('/reminders') ? 'reminders' : 'ledger';
  function navigate(path: string) { history.pushState({}, '', path); setLocation(path); }
  function clearSession() { setToken(''); setUser(undefined); sessionStorage.removeItem('ledger-token'); }
  useEffect(() => { const expired = () => { clearSession(); setError('Your session expired. Please sign in again.'); }; window.addEventListener('session-expired', expired); return () => window.removeEventListener('session-expired', expired); }, []);
  useEffect(() => { const listener = () => setLocation(window.location.pathname + window.location.search); window.addEventListener('popstate', listener); return () => window.removeEventListener('popstate', listener); }, []);
  useEffect(() => {
    if (!token) { setUser(undefined); return; }
    let active = true;
    Promise.all([json<Identity>('/auth/me', token), json<Lookup[]>('/owners', token), json<Lookup[]>('/vendors', token)])
      .then(([identity, people, companies]) => { if (active) { setUser(identity); setOwners(people); setVendors(companies); setError(''); sessionStorage.setItem('ledger-token', token); } })
      .catch(error => { if (active) { setError(error.message); setToken(''); sessionStorage.removeItem('ledger-token'); } });
    return () => { active = false; };
  }, [token]);
  if (!user || !token) return <Login onLogin={setToken} error={error} />;
  const ownerName = owners.find(owner => owner.id === user.ownerId)?.name || 'Workspace';
  return <div className="workspace">
    <aside className="sidebar"><a className="brand" href="/ledger" onClick={event => { event.preventDefault(); navigate('/ledger'); }}><span className="brand-icon">L</span>ledger<span className="brand-dot">.</span></a>
      <span className="nav-label">WORKSPACE</span><nav aria-label="Main navigation">{(['ledger', 'assistant', 'reminders'] as const).map((name, index) => <a key={name} className={tab === name ? 'active' : ''} href={'/' + name} onClick={event => { event.preventDefault(); navigate('/' + name); }}><span aria-hidden>{['▤', '✧', '◷'][index]}</span>{name[0].toUpperCase() + name.slice(1)}</a>)}</nav>
      <div className="sidebar-note"><span className="live-dot"/> Connected workspace<p>One place for your subscriptions, spend, and upcoming renewals.</p></div>
      <div className="profile"><div className="avatar">{ownerName.slice(0, 1)}</div><div><strong>{ownerName}</strong><small>{user.role === 'admin' ? 'Administrator' : 'Owner access'}</small></div><button className="icon-button" title="Sign out" aria-label="Sign out" onClick={() => { void json('/auth/logout', token, { method: 'POST' }).catch(() => setError('Signed out locally; server session revocation could not be confirmed.')).finally(clearSession); }}>↗</button></div>
    </aside>
    <main><div className="topbar"><span>Workspace <span className="slash">/</span> {tab[0].toUpperCase() + tab.slice(1)}</span><span className="currency-label">GEL · Georgian lari</span></div>
      {tab === 'ledger' && <LedgerView key={location} query={location.split('?')[1] || ''} token={token} user={user} owners={owners} vendors={vendors} navigate={navigate}/>}
      {tab === 'assistant' && <AssistantView token={token} navigate={navigate}/>}
      {tab === 'reminders' && <RemindersView token={token} user={user} owners={owners}/>}
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
