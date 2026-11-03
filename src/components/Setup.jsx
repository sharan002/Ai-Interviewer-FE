import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, ArrowRight, Briefcase, FileText, Loader2, Sparkles, UploadCloud } from 'lucide-react';
import Avatar from './Avatar.jsx';
import { api } from '../api.js';
import { DIFFICULTIES, INTERVIEWERS, LENGTHS, LEVELS, TYPES } from '../constants.js';

export default function Setup({ initial, lastReport, onStart, onViewLastReport }) {
  const [health, setHealth] = useState(null);
  const [file, setFile] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [analysis, setAnalysis] = useState(initial ? { profile: initial.profile, resumeToken: initial.resumeToken } : null);

  const [role, setRole] = useState(initial?.role ?? '');
  const [customRole, setCustomRole] = useState('');
  const [level, setLevel] = useState(initial?.level ?? 'mid');
  const [difficulty, setDifficulty] = useState(initial?.difficulty ?? 'medium');
  const [type, setType] = useState(initial?.type ?? 'mixed');
  const [count, setCount] = useState(initial?.questionCount ?? 8);
  const [interviewerId, setInterviewerId] = useState(initial?.interviewer?.id ?? INTERVIEWERS[0].id);

  const inputRef = useRef(null);

  useEffect(() => {
    api.health().then(setHealth).catch(() => setHealth({ ok: false }));
  }, []);

  async function handleFile(f) {
    if (!f) return;
    setFile(f);
    setError('');
    setAnalyzing(true);
    setAnalysis(null);
    try {
      const res = await api.analyzeResume(f);
      setAnalysis(res);
      setRole(res.profile.roles[0]?.title ?? '');
      setCustomRole('');
      setLevel(res.profile.experienceLevel);
    } catch (e) {
      setError(e.message);
    } finally {
      setAnalyzing(false);
    }
  }

  const finalRole = (customRole.trim() || role).trim();
  const canStart = analysis && finalRole && !analyzing;

  function start() {
    onStart({
      profile: analysis.profile,
      resumeToken: analysis.resumeToken,
      role: finalRole,
      level,
      difficulty,
      type,
      questionCount: count,
      interviewer: INTERVIEWERS.find((i) => i.id === interviewerId),
    });
  }

  const profile = analysis?.profile;

  return (
    <div className="page">
      <div className="container">
        <header className="hero">
          <div className="logo"><Sparkles size={22} /></div>
          <h1>AI Interview Room</h1>
          <p>Upload your resume, choose a role, and have a realistic voice interview on a video call, then get detailed feedback.</p>
        </header>

        {health && (!health.ok || !health.openaiConfigured || !health.sarvamConfigured) && (
          <div className="banner warn">
            <AlertTriangle size={18} />
            <div>
              {!health.ok && <div>Can't reach the backend. Start it with <code>npm run dev</code> inside <code>backend/</code>.</div>}
              {health.ok && !health.openaiConfigured && <div><b>OPENAI_API_KEY</b> is missing in <code>backend/.env</code>. Interviews won't work without it.</div>}
              {health.ok && !health.sarvamConfigured && <div><b>SARVAM_API_KEY</b> is missing in <code>backend/.env</code>. Voice will fall back to your browser, and you'll need to type answers.</div>}
            </div>
          </div>
        )}

        {lastReport && (
          <button className="link-card" onClick={onViewLastReport}>
            <FileText size={18} />
            <span>View your last report: <b>{lastReport.meta.role}</b> · {lastReport.report.overallScore}/100</span>
            <ArrowRight size={16} />
          </button>
        )}

        {/* 1. Resume */}
        <section className="card">
          <div className="step"><span>1</span> Upload your resume</div>
          <div
            className={`dropzone ${dragOver ? 'over' : ''} ${analyzing ? 'busy' : ''}`}
            onClick={() => !analyzing && inputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); if (!analyzing) handleFile(e.dataTransfer.files?.[0]); }}
          >
            <input ref={inputRef} type="file" accept=".pdf,.docx,.txt,.md" hidden onChange={(e) => handleFile(e.target.files?.[0])} />
            {analyzing ? (
              <>
                <Loader2 className="spin blue" size={30} />
                <b>Reading your resume…</b>
                <span className="muted">Finding your skills and the roles you fit best</span>
              </>
            ) : (
              <>
                <UploadCloud size={30} className="blue" />
                <b>{file ? file.name : 'Drop your resume here or click to browse'}</b>
                <span className="muted">{file ? 'Click to upload a different file' : 'PDF, DOCX or TXT · up to 8 MB'}</span>
              </>
            )}
          </div>
          {error && <div className="banner error"><AlertTriangle size={18} /><div>{error}</div></div>}

          {profile && (
            <div className="profile">
              <div className="profile-head">
                <h3>{profile.candidateName}</h3>
                <span className="muted">{profile.headline}</span>
              </div>
              <p>{profile.summary}</p>
              <div className="chips">
                {profile.skills.map((s) => <span key={s} className="chip">{s}</span>)}
              </div>
            </div>
          )}
        </section>

        {profile && (
          <>
            {/* 2. Role */}
            <section className="card">
              <div className="step"><span>2</span> Choose the role to practise for</div>
              <div className="role-grid">
                {profile.roles.map((r) => (
                  <button
                    key={r.title}
                    className={`role-card ${!customRole.trim() && role === r.title ? 'selected' : ''}`}
                    onClick={() => { setRole(r.title); setCustomRole(''); }}
                  >
                    <div className="role-top">
                      <Briefcase size={16} />
                      <b>{r.title}</b>
                      <span className="fit">{r.fitScore}% fit</span>
                    </div>
                    <p>{r.reason}</p>
                    <div className="chips small">
                      {r.focusAreas.map((f) => <span key={f} className="chip">{f}</span>)}
                    </div>
                  </button>
                ))}
              </div>
              <label className="field">
                <span>Or type a different role</span>
                <input value={customRole} onChange={(e) => setCustomRole(e.target.value)} placeholder="e.g. Data Analyst at a fintech startup" maxLength={120} />
              </label>
            </section>

            {/* 3. Level, difficulty */}
            <section className="card">
              <div className="step"><span>3</span> Set up the interview</div>

              <div className="field">
                <span>Experience level <em className="muted">(detected from your resume: {profile.yearsOfExperience} yrs)</em></span>
                <div className="seg">
                  {LEVELS.map((l) => (
                    <button key={l.id} className={level === l.id ? 'on' : ''} onClick={() => setLevel(l.id)}>
                      {l.label}<small>{l.hint}</small>
                    </button>
                  ))}
                </div>
              </div>

              <div className="field">
                <span>Difficulty</span>
                <div className="seg">
                  {DIFFICULTIES.map((d) => (
                    <button key={d.id} className={`${difficulty === d.id ? 'on' : ''} diff-${d.id}`} onClick={() => setDifficulty(d.id)}>
                      {d.label}<small>{d.hint}</small>
                    </button>
                  ))}
                </div>
              </div>

              <div className="two">
                <div className="field">
                  <span>Focus</span>
                  <div className="seg">
                    {TYPES.map((t) => (
                      <button key={t.id} className={type === t.id ? 'on' : ''} onClick={() => setType(t.id)}>{t.label}</button>
                    ))}
                  </div>
                </div>
                <div className="field">
                  <span>Length</span>
                  <div className="seg">
                    {LENGTHS.map((l) => (
                      <button key={l.count} className={count === l.count ? 'on' : ''} onClick={() => setCount(l.count)}>
                        {l.label}<small>{l.hint}</small>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </section>

            {/* 4. Interviewer */}
            <section className="card">
              <div className="step"><span>4</span> Pick your interviewer</div>
              <div className="interviewer-grid">
                {INTERVIEWERS.map((p) => (
                  <button key={p.id} className={`interviewer ${interviewerId === p.id ? 'selected' : ''}`} onClick={() => setInterviewerId(p.id)}>
                    <div className="mini-avatar"><Avatar persona={p} animated={false} state="idle" /></div>
                    <b>{p.name}</b>
                    <span className="muted">{p.title}</span>
                  </button>
                ))}
              </div>
            </section>

            <div className="cta-bar">
              <div className="muted">
                {finalRole ? <>Interview for <b>{finalRole}</b></> : 'Choose a role to continue'}
              </div>
              <button className="btn primary big" disabled={!canStart} onClick={start}>
                Continue <ArrowRight size={18} />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
