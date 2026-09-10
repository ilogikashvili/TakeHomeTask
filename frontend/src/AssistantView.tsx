import { useState } from 'react';
import { Lookup, request } from './api';
type Answer = { status: string; answer?: string; question?: string; ledgerUrl?: string; conversationId?: string; candidates?: Lookup[] };
type Message = { role: 'user' | 'assistant'; text: string; answer?: Answer; original?: string };
export function AssistantView({ token, navigate }: { token: string; navigate: (path: string) => void }) {
  const [messages, setMessages] = useState<Message[]>([]); const [question, setQuestion] = useState(''); const [busy, setBusy] = useState(false);
  const [conversation, setConversation] = useState<string>(); const [progress, setProgress] = useState('');
  async function ask(text: string, selectedVendorId?: string) {
    if (!text.trim() || busy) return;
    setMessages(current => [...current, { role: 'user', text }]); setQuestion(''); setBusy(true); setProgress('Understanding your question…');
    try {
      const query = new URLSearchParams({ question: text }); if (conversation) query.set('conversationId', conversation); if (selectedVendorId) query.set('selectedVendorId', selectedVendorId);
      const response = await request('/assistant/stream?' + query, token);
      const reader = response.body!.getReader(); const decoder = new TextDecoder(); let pending = ''; let answered = false;
      while (true) {
        const { value, done } = await reader.read(); pending += decoder.decode(value, { stream: !done });
        const parts = pending.split(/\r?\n\r?\n/); pending = parts.pop() || '';
        for (const part of parts) {
          const dataLine = part.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).trim()).join('\n'); if (!dataLine) continue;
          const data = JSON.parse(dataLine);
          if (part.includes('event: error')) throw new Error(data.message);
          if (part.includes('event: progress')) setProgress('Checking your ledger…');
          if (part.includes('event: result')) { const answer = data as Answer; answered = true; if (answer.conversationId) setConversation(answer.conversationId); setMessages(current => [...current, { role: 'assistant', text: answer.answer || answer.question || 'Please rephrase your question.', answer, original: text }]); }
        }
        if (done) break;
      }
      if (!answered) throw new Error('The response was interrupted. Please try again.');
    } catch (error) { setMessages(current => [...current, { role: 'assistant', text: (error as Error).message }]); } finally { setBusy(false); setProgress(''); }
  }
  return <section className="page assistant-page"><header className="page-heading"><div><span className="eyebrow">ASK YOUR WORKSPACE</span><h1>A little clarity, on demand.</h1><p>Explore your subscriptions in plain language.</p></div><button className="secondary" disabled={busy} onClick={() => { setConversation(undefined); setMessages([]); }}>New conversation</button></header>
    <div className="chat panel">{!messages.length && <div className="chat-empty"><span className="assistant-mark">✧</span><h2>What would you like to know?</h2><p>Ask about recurring spend, vendors, or upcoming renewals.<br/>Every answer connects back to your ledger.</p><div className="suggestions">{['How much do we spend?', 'What is our annualized spend?', 'Which subscriptions renew next month?'].map(text => <button className="secondary" key={text} onClick={() => ask(text)}>{text} ↗</button>)}</div></div>}
      <div className="messages" aria-live="polite">{messages.map((message, index) => <article key={index} className={'message ' + message.role}><span className="message-author">{message.role === 'user' ? 'You' : '✧ Ledger assistant'}</span><p>{message.text}</p>{message.answer?.ledgerUrl && <a href={message.answer.ledgerUrl} onClick={event => { event.preventDefault(); navigate(message.answer!.ledgerUrl!); }}>View matching subscriptions →</a>}{message.answer?.candidates?.map(candidate => <button className="secondary" disabled={busy} key={candidate.id} onClick={() => ask(message.original!, candidate.id)}>{candidate.name}</button>)}</article>)}{busy && <div role="status" className="thinking">✧ {progress}</div>}</div>
      <form className="composer" onSubmit={event => { event.preventDefault(); ask(question); }}><label className="sr-only" htmlFor="question">Ask a question</label><input id="question" placeholder="Ask about your subscriptions…" maxLength={2000} value={question} onChange={event => setQuestion(event.target.value)} disabled={busy}/><button className="primary" disabled={busy || !question.trim()}>Send ↑</button></form><p className="chat-note">Read-only answers · GEL amounts · Your authorized subscriptions</p>
    </div></section>;
}
