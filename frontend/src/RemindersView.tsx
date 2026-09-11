import { date, Identity, Lookup, Notification } from './api';

export function RemindersView({
  token,
  user,
  owners,
  ownerId,
  Notifications,
  loading,
  connected,
  onOwnerChange,
  onDismiss,
}: {
  token: string;
  user: Identity;
  owners: Lookup[];
  ownerId: string;
  Notifications: Notification[];
  loading: boolean;
  connected: boolean;
  onOwnerChange: (nextOwnerId: string) => void;
  onDismiss: (notificationId: string) => void;
}) {
  return <section className="page"><header className="page-heading"><div><span className="eyebrow">STAY AHEAD</span><h1>Upcoming renewals</h1><p>Make the next decision before the next billing cycle.</p></div><span className="connection"><span className={connected ? 'live-dot' : 'offline-dot'}/>{connected ? 'Live updates connected' : 'Checking for updates every 30 seconds'}</span></header>{user.role === 'admin' && <label className="owner-select">Owner<select value={ownerId} onChange={event => onOwnerChange(event.target.value)}>{owners.map(owner => <option key={owner.id} value={owner.id}>{owner.name}</option>)}</select></label>}<div className="panel reminders"><div className="panel-heading"><h2>Unread reminders <span className="count">{Notifications.length}</span></h2></div>{loading ? <div className="table-state">Loading reminders…</div> : !Notifications.length ? <div className="empty-state"><span>✓</span><h2>You're all caught up.</h2><p>New renewal reminders will appear here.</p></div> : Notifications.map(item => <article className="reminder" key={item.id}><span className="calendar-icon">◷</span><div><h3>{item.reminder?.lineItem?.name || 'Subscription renewal'}</h3><p>Renews {date(item.reminder?.renewalDate || null)}</p><small>Added {date(item.createdAt)}</small></div><button className="secondary" onClick={() => onDismiss(item.id)}>Dismiss</button></article>)}</div></section>;
}
