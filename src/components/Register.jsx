import { useState } from 'react';
import { AlertTriangle, ArrowRight, Loader2, Sparkles } from 'lucide-react';
import { api } from '../api.js';

export default function Register({ onDone }) {
  const [form, setForm] = useState({ name: '', mobile: '', email: '', domain: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [blocked, setBlocked] = useState(false);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const digits = form.mobile.replace(/\D/g, '');
  const valid =
    form.name.trim() && digits.length === 10 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()) && form.domain.trim();

  async function submit(e) {
    e.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    setError('');
    setBlocked(false);
    try {
      const res = await api.registerLead({ ...form, mobile: digits });
      onDone({ leadToken: res.leadToken, name: res.name, domain: form.domain.trim() });
    } catch (err) {
      setError(err.message);
      setBlocked(err.status === 409);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <div className="container narrow">
        <header className="hero">
          <div className="logo"><Sparkles size={22} /></div>
          <h1>AI Interview Room</h1>
          <p>Fill in your details to get started. This is required before you can attend the interview.</p>
        </header>

        <form className="card" onSubmit={submit}>
          <label className="field">
            <span>Name</span>
            <input value={form.name} onChange={set('name')} maxLength={80} autoComplete="name" required />
          </label>
          <label className="field">
            <span>Mobile number</span>
            <input value={form.mobile} onChange={set('mobile')} inputMode="numeric" placeholder="10-digit mobile number" maxLength={14} autoComplete="tel" required />
          </label>
          <label className="field">
            <span>Email</span>
            <input type="email" value={form.email} onChange={set('email')} maxLength={120} autoComplete="email" required />
          </label>
          <label className="field">
            <span>Interview domain</span>
            <input value={form.domain} onChange={set('domain')} placeholder="e.g. Full Stack Development, Data Science" maxLength={120} required />
          </label>

          {error && (
            <div className={`banner ${blocked ? 'warn' : 'error'}`} style={{ marginTop: 18 }}>
              <AlertTriangle size={18} /><div>{error}</div>
            </div>
          )}

          <div className="cta-bar" style={{ marginTop: 18, position: 'static' }}>
            <span />
            <button className="btn primary big" type="submit" disabled={!valid || busy}>
              {busy ? <Loader2 className="spin" size={18} /> : <>Continue <ArrowRight size={18} /></>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
