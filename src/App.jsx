import { useState } from 'react';
import Register from './components/Register.jsx';
import Setup from './components/Setup.jsx';
import Lobby from './components/Lobby.jsx';
import Meeting from './components/Meeting.jsx';
import Report from './components/Report.jsx';

const STORAGE_KEY = 'ai-interview:last-report';

const loadLastReport = () => {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
  } catch {
    return null;
  }
};

// Launched from the Trainer module's "Attend Mock" button: #mock=<base64url JSON {leadToken, name, title, description}>.
// The Trainer backend already counted this attempt (max 3) and vouched for the student, so registration is skipped.
const readLaunch = () => {
  try {
    const m = /[#&]mock=([^&]+)/.exec(window.location.hash);
    if (!m) return null;
    const b64 = m[1].replace(/-/g, '+').replace(/_/g, '/');
    const d = JSON.parse(decodeURIComponent(escape(atob(b64))));
    if (!d?.leadToken) return null;
    history.replaceState(null, '', window.location.pathname + window.location.search);
    return d;
  } catch {
    return null;
  }
};

const stopStream = (media) => media?.stream?.getTracks().forEach((t) => t.stop());

export default function App() {
  const [launch] = useState(readLaunch);
  const [stage, setStage] = useState(launch ? 'setup' : 'register'); // register | setup | lobby | meeting | report | launched-end
  const [lead, setLead] = useState(launch ? { leadToken: launch.leadToken, name: launch.name, domain: launch.title || '' } : null); // set once the registration form is filled
  const [setup, setSetup] = useState(null);
  const [media, setMedia] = useState(null);
  const [result, setResult] = useState(null);
  const [lastReport, setLastReport] = useState(loadLastReport);

  const leaveMeeting = () => {
    stopStream(media);
    setMedia(null);
    setStage('setup');
  };

  return (
    <>
      {stage === 'register' && (
        <Register
          onDone={(l) => {
            setLead(l);
            setStage('setup');
          }}
        />
      )}

      {stage === 'setup' && lead && (
        <Setup
          lead={lead}
          initial={setup}
          jobPrefill={launch}
          lastReport={lastReport}
          onViewLastReport={() => {
            setResult(lastReport);
            setStage('report');
          }}
          onStart={(cfg) => {
            setSetup({ ...cfg, leadToken: lead.leadToken });
            setStage('lobby');
          }}
        />
      )}

      {stage === 'lobby' && (
        <Lobby
          setup={setup}
          onBack={() => setStage('setup')}
          onJoin={(m) => {
            setMedia(m);
            setStage('meeting');
          }}
        />
      )}

      {stage === 'meeting' && (
        <Meeting
          setup={setup}
          media={media}
          onLeave={leaveMeeting}
          onFinish={(res) => {
            stopStream(media);
            setMedia(null);
            if (!res.insufficient) {
              try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(res));
              } catch {
                /* storage full or blocked */
              }
              setLastReport(res);
            }
            setResult(res);
            setStage('report');
          }}
        />
      )}

      {stage === 'report' && (
        <Report
          result={result}
          onNew={() => {
            if (launch) {
              // Each mock attempt is issued by the Trainer module, so go back there for another one.
              window.close();
              setStage('launched-end');
              return;
            }
            // One registration per candidate: a new attempt means filling the form again.
            setLead(null);
            setSetup(null);
            setStage('register');
          }}
        />
      )}

      {stage === 'launched-end' && (
        <div className="page">
          <div className="container narrow">
            <div className="card" style={{ textAlign: 'center' }}>
              <h2>Mock interview finished</h2>
              <p className="muted">You can close this tab and start another mock from the jobs section of the Trainer module.</p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
