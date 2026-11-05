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

const stopStream = (media) => media?.stream?.getTracks().forEach((t) => t.stop());

export default function App() {
  const [stage, setStage] = useState('register'); // register | setup | lobby | meeting | report
  const [lead, setLead] = useState(null); // set once the registration form is filled
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
            // One registration per candidate: a new attempt means filling the form again.
            setLead(null);
            setSetup(null);
            setStage('register');
          }}
        />
      )}
    </>
  );
}
