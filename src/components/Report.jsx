import { ArrowRight, BookOpen, CheckCircle2, Gauge, Lightbulb, MessageSquare, Printer, Target, TrendingUp } from 'lucide-react';
import { DIFFICULTIES, LEVELS, formatTime, labelOf } from '../constants.js';

const tone = (pct) => (pct >= 75 ? 'good' : pct >= 50 ? 'ok' : 'low');

function ScoreRing({ score }) {
  const r = 54;
  const c = 2 * Math.PI * r;
  return (
    <div className={`ring ${tone(score)}`}>
      <svg viewBox="0 0 130 130">
        <circle cx="65" cy="65" r={r} className="ring-bg" />
        <circle
          cx="65"
          cy="65"
          r={r}
          className="ring-fg"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - score / 100)}
          transform="rotate(-90 65 65)"
        />
      </svg>
      <div className="ring-text">
        <b>{score}</b>
        <span>/ 100</span>
      </div>
    </div>
  );
}

function downloadTranscript(result) {
  const { meta, transcript } = result;
  const lines = [
    `Interview: ${meta.role} (${labelOf(LEVELS, meta.level)}, ${labelOf(DIFFICULTIES, meta.difficulty)})`,
    `Date: ${new Date(meta.date).toLocaleString()}`,
    '',
    ...transcript.map((t) => `${t.who === 'you' ? 'You' : meta.interviewer}: ${t.text}`),
  ];
  const url = URL.createObjectURL(new Blob([lines.join('\n\n')], { type: 'text/plain' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: 'interview-transcript.txt' });
  a.click();
  URL.revokeObjectURL(url);
}

export default function Report({ result, onNew }) {
  if (!result) return null;
  const { meta, metrics, transcript } = result;

  if (result.insufficient) {
    return (
      <div className="page">
        <div className="container narrow">
          <div className="card center-card">
            <h2>No answers to review</h2>
            <p className="muted">
              The interview ended before you answered any questions, so there's nothing to give feedback on yet.
            </p>
            <button className="btn primary big" onClick={onNew}>Start a new interview</button>
          </div>
        </div>
      </div>
    );
  }

  const { report } = result;
  const verdictTone = /No Hire/.test(report.verdict) ? 'low' : /Lean/.test(report.verdict) ? 'ok' : 'good';

  return (
    <div className="page report">
      <div className="container">
        <header className="report-head card">
          <ScoreRing score={report.overallScore} />
          <div className="report-head-text">
            <div className="muted small">Interview feedback</div>
            <h1>{meta.role}</h1>
            <div className="chips">
              <span className="chip">{labelOf(LEVELS, meta.level)}</span>
              <span className="chip">{labelOf(DIFFICULTIES, meta.difficulty)}</span>
              <span className="chip">{formatTime(meta.durationSec)} duration</span>
              <span className="chip">{metrics.answers} answers</span>
              {!meta.completed && <span className="chip warn">Ended early</span>}
            </div>
            <div className={`verdict ${verdictTone}`}>{report.verdict}</div>
          </div>
          <div className="report-actions no-print">
            <button
              className="btn ghost"
              onClick={() => {
                document.querySelectorAll('.qa').forEach((d) => { d.open = true; });
                window.print();
              }}
            ><Printer size={16} /> Print / PDF</button>
            <button className="btn primary" onClick={onNew}>New interview <ArrowRight size={16} /></button>
          </div>
        </header>

        <section className="card">
          <h2><Target size={20} /> Summary</h2>
          <p className="lead">{report.summary}</p>
        </section>

        <section className="card">
          <h2><Gauge size={20} /> Skill breakdown</h2>
          <div className="cats">
            {report.categoryScores.map((c) => (
              <div key={c.name} className="cat">
                <div className="cat-top">
                  <b>{c.name}</b>
                  <span>{c.score}/10</span>
                </div>
                <div className={`bar-track ${tone(c.score * 10)}`}><i style={{ width: `${c.score * 10}%` }} /></div>
                <p className="muted small">{c.comment}</p>
              </div>
            ))}
          </div>
        </section>

        <div className="two-col">
          <section className="card">
            <h2><CheckCircle2 size={20} className="green" /> Strengths</h2>
            <ul className="bullets good">
              {report.strengths.map((s, i) => <li key={i}>{s}</li>)}
            </ul>
          </section>
          <section className="card">
            <h2><TrendingUp size={20} className="amber" /> Areas to improve</h2>
            <div className="improve-list">
              {report.improvements.map((im, i) => (
                <div key={i} className="improve">
                  <b>{im.area}</b>
                  <p>{im.detail}</p>
                  <p className="how"><Lightbulb size={14} /> {im.howToImprove}</p>
                </div>
              ))}
            </div>
          </section>
        </div>

        <section className="card">
          <h2><MessageSquare size={20} /> Communication</h2>
          <div className="stats">
            <div className="stat"><b>{metrics.wordsPerMinute ?? '–'}</b><span>words / min<br /><small>ideal 110–160</small></span></div>
            <div className="stat"><b>{metrics.avgAnswerWords}</b><span>avg words per answer</span></div>
            <div className="stat"><b>{metrics.fillerTotal}</b><span>filler words<br /><small>{metrics.fillerPer100Words} per 100 words</small></span></div>
            <div className="stat"><b>{formatTime(metrics.speakingSeconds)}</b><span>time speaking</span></div>
          </div>
          {report.communication.assessment && <p>{report.communication.assessment}</p>}
          {report.communication.tips.length > 0 && (
            <ul className="bullets">
              {report.communication.tips.map((t, i) => <li key={i}>{t}</li>)}
            </ul>
          )}
        </section>

        <section className="card">
          <h2>Question-by-question review</h2>
          <div className="qa-list">
            {report.questionFeedback.map((q, i) => (
              <details key={i} className="qa" open={i === 0}>
                <summary>
                  <span className="qa-n">Q{i + 1}</span>
                  <span className="qa-q">{q.question}</span>
                  <span className={`score-badge ${tone(q.score * 10)}`}>{q.score}/10</span>
                </summary>
                <div className="qa-body">
                  <div><h4>What you said</h4><p>{q.answerSummary}</p></div>
                  <div className="qa-cols">
                    <div><h4 className="green">What worked</h4><p>{q.whatWorked}</p></div>
                    <div><h4 className="amber">What was missing</h4><p>{q.whatWasMissing}</p></div>
                  </div>
                  <div className="model"><h4>A stronger answer</h4><p>{q.modelAnswer}</p></div>
                </div>
              </details>
            ))}
          </div>
        </section>

        <div className="two-col">
          <section className="card">
            <h2><BookOpen size={20} /> Study plan</h2>
            <div className="improve-list">
              {report.studyPlan.map((s, i) => (
                <div key={i} className="improve">
                  <b>{s.topic}</b>
                  <p>{s.why}</p>
                  <p className="how">{s.suggestion}</p>
                </div>
              ))}
            </div>
          </section>
          <section className="card">
            <h2><ArrowRight size={20} /> Next steps</h2>
            <ol className="steps">
              {report.nextSteps.map((s, i) => <li key={i}>{s}</li>)}
            </ol>
          </section>
        </div>

        <section className="card no-print">
          <details>
            <summary className="transcript-sum">Full transcript</summary>
            <div className="transcript">
              {transcript.map((t, i) => (
                <p key={i} className={t.who}>
                  <b>{t.who === 'you' ? 'You' : meta.interviewer}:</b> {t.text}
                </p>
              ))}
            </div>
            <button className="btn ghost" onClick={() => downloadTranscript(result)}>Download transcript</button>
          </details>
        </section>
      </div>
    </div>
  );
}
