import { useEffect, useRef, useState } from 'react';
import {
  Captions, Clock, Info, Loader2, MessageSquare, Mic, MicOff, PhoneOff, Send, SkipForward, Video, VideoOff, AlertTriangle, Check,
} from 'lucide-react';
import Avatar from './Avatar.jsx';
import { api } from '../api.js';
import { TtsPlayer } from '../lib/speaker.js';
import { VoiceListener } from '../lib/listener.js';
import { DIFFICULTIES, LEVELS, formatTime, labelOf } from '../constants.js';

const NUDGES = [
  "Take your time. Let me know if you'd like me to repeat the question.",
  "Whenever you're ready. I can also rephrase the question if that helps.",
];

export default function Meeting({ setup, media, onFinish, onLeave }) {
  const persona = setup.interviewer;

  const [status, setStatus] = useState('connecting'); // connecting|thinking|speaking|listening|transcribing|wrapping
  const [messages, setMessages] = useState([]);
  const [caption, setCaption] = useState('');
  const [live, setLive] = useState('');
  const [micOn, setMicOn] = useState(media.micOn);
  const [camOn, setCamOn] = useState(media.camOn);
  const [ccOn, setCcOn] = useState(true);
  const [panel, setPanel] = useState(null); // null | 'chat' | 'info'
  const [elapsed, setElapsed] = useState(0);
  const [progress, setProgress] = useState({ asked: 0, total: setup.questionCount });
  const [toast, setToast] = useState('');
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [fatal, setFatal] = useState(null); // { message, retry }
  const [draft, setDraft] = useState('');

  // Everything the audio/IO callbacks touch lives in refs so they never go stale.
  const statusRef = useRef('connecting');
  const playerRef = useRef(null);
  const listenerRef = useRef(null);
  const sessionIdRef = useRef(null);
  const turnRef = useRef(0);
  const partsRef = useRef([]);
  const pendingRef = useRef([]);
  const speechSecRef = useRef(0);
  const nudgesRef = useRef(0);
  const sttErrorRef = useRef('');
  const lastAnswerRef = useRef(null);
  const finishingRef = useRef(false);
  const mountedRef = useRef(true);
  const micOnRef = useRef(media.micOn);
  const selfTileRef = useRef(null);
  const chatEndRef = useRef(null);
  const toastTimer = useRef(null);

  const hasVideo = (media.stream?.getVideoTracks().length ?? 0) > 0;
  const hasMic = (media.stream?.getAudioTracks().length ?? 0) > 0;

  const setStatusBoth = (s) => {
    statusRef.current = s;
    setStatus(s);
  };

  const notify = (msg) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 7000);
  };

  const addMessage = (who, text) => setMessages((m) => [...m, { who, text }]);

  const active = () => mountedRef.current && !finishingRef.current;

  // ---- interview flow -----------------------------------------------------------------

  async function begin() {
    setFatal(null);
    setStatusBoth('connecting');
    try {
      const r = await api.startInterview({
        leadToken: setup.leadToken,
        resumeToken: setup.resumeToken,
        profile: setup.profile,
        role: setup.role,
        jobDescription: setup.jobDescription,
        level: setup.level,
        difficulty: setup.difficulty,
        type: setup.type,
        questionCount: setup.questionCount,
        interviewerName: persona.name,
      });
      sessionIdRef.current = r.sessionId;
      await deliver(r);
    } catch (e) {
      if (active()) setFatal({ message: e.message, retry: begin });
    }
  }

  async function deliver(r) {
    if (!active()) return;
    addMessage('interviewer', r.spoken);
    setProgress(r.progress);
    setCaption(r.spoken);
    nudgesRef.current = 0;
    setStatusBoth('speaking');
    await playerRef.current.speak(r.spoken);
    if (!active()) return;
    if (r.done) {
      await finish();
      return;
    }
    startListening();
  }

  function startListening() {
    const l = listenerRef.current;
    turnRef.current += 1;
    partsRef.current = [];
    pendingRef.current = [];
    speechSecRef.current = 0;
    setLive('');
    setStatusBoth('listening');

    if (!l || sttErrorRef.current) return; // typing-only mode
    // Give the room a moment to settle after the interviewer's voice stops.
    setTimeout(() => {
      if (active() && statusRef.current === 'listening') l.start();
    }, 350);
  }

  async function sayLocal(text) {
    if (!active()) return;
    setCaption(text);
    addMessage('interviewer', text);
    setStatusBoth('speaking');
    await playerRef.current.speak(text);
    if (active()) startListening();
  }

  function onSegment({ blob, seconds }) {
    const turn = turnRef.current;
    const idx = partsRef.current.length;
    partsRef.current.push('');
    speechSecRef.current += seconds;

    const p = api
      .transcribe(blob)
      .then((t) => {
        if (turn !== turnRef.current) return;
        sttErrorRef.current = '';
        partsRef.current[idx] = t;
        setLive(partsRef.current.join(' ').trim());
      })
      .catch((e) => {
        if (turn !== turnRef.current) return;
        sttErrorRef.current = e.message;
      });
    pendingRef.current.push(p);
  }

  async function handleTurnEnd() {
    if (statusRef.current !== 'listening') return;
    const turn = turnRef.current;
    listenerRef.current?.stop();
    setStatusBoth('transcribing');
    await Promise.all(pendingRef.current);
    if (turn !== turnRef.current || !active()) return;

    const text = partsRef.current.join(' ').replace(/\s+/g, ' ').trim();
    if (text) {
      await sendAnswer(text, speechSecRef.current);
      return;
    }
    if (sttErrorRef.current) {
      notify(`Speech recognition isn't working (${sttErrorRef.current}). Type your answer in the chat panel instead.`);
      setPanel('chat');
      startListening(); // typing-only mode, because sttErrorRef is set
      return;
    }
    await sayLocal("Sorry, I didn't quite catch that. Could you say it again?");
  }

  async function sendAnswer(text, durationSec, { echo = true } = {}) {
    listenerRef.current?.stop();
    turnRef.current += 1;
    lastAnswerRef.current = { text, durationSec };
    if (echo) addMessage('you', text);
    setLive('');
    setCaption('');
    setStatusBoth('thinking');
    try {
      const r = await api.answer(sessionIdRef.current, { text, durationSec });
      await deliver(r);
    } catch (e) {
      if (active()) {
        setFatal({
          message: e.message,
          retry: () => {
            setFatal(null);
            const { text: t, durationSec: d } = lastAnswerRef.current;
            return sendAnswer(t, d, { echo: false });
          },
        });
      }
    }
  }

  async function finish() {
    if (finishingRef.current) return;
    finishingRef.current = true;
    setConfirmEnd(false);
    playerRef.current?.stop();
    listenerRef.current?.stop();
    turnRef.current += 1;
    setStatusBoth('wrapping');
    if (!sessionIdRef.current) {
      onLeave();
      return;
    }
    try {
      onFinish(await api.end(sessionIdRef.current));
    } catch (e) {
      finishingRef.current = false;
      if (mountedRef.current) setFatal({ message: e.message, retry: () => { setFatal(null); return finish(); } });
    }
  }

  // ---- lifecycle ----------------------------------------------------------------------

  useEffect(() => {
    mountedRef.current = true;
    const player = new TtsPlayer();
    player.speaker = persona.voice;
    player.onFallback = (m) => notify(`Sarvam voice unavailable (${m}). Using your browser's voice instead.`);
    playerRef.current = player;

    (async () => {
      await player.unlock();
      if (hasMic) {
        try {
          const l = new VoiceListener(media.stream, {
            onLevel: (rms) => {
              const el = selfTileRef.current;
              if (!el) return;
              el.style.setProperty('--lvl', String(Math.min(1, rms * 9)));
              el.classList.toggle('talking', micOnRef.current && rms > 0.03);
            },
            onSegment,
            onTurnEnd: handleTurnEnd,
          });
          await l.init();
          listenerRef.current = l;
        } catch (e) {
          notify(`Couldn't start microphone processing (${e.message}). Type your answers in the chat panel.`);
          sttErrorRef.current = 'microphone processing unavailable';
        }
      } else {
        sttErrorRef.current = 'no microphone';
        setPanel('chat');
      }
      if (mountedRef.current) begin();
    })();

    const timer = setInterval(() => setElapsed((s) => s + 1), 1000);
    const warn = (e) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', warn);

    return () => {
      mountedRef.current = false;
      clearInterval(timer);
      clearTimeout(toastTimer.current);
      window.removeEventListener('beforeunload', warn);
      player.destroy();
      listenerRef.current?.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Gentle nudge if the candidate stays silent for a long time.
  useEffect(() => {
    const id = setInterval(() => {
      const l = listenerRef.current;
      if (!l || statusRef.current !== 'listening' || !l.active || !micOnRef.current) return;
      if (l.speaking || partsRef.current.length > 0 || nudgesRef.current >= NUDGES.length) return;
      if (l.silentMs > 22000) {
        const line = NUDGES[nudgesRef.current];
        nudgesRef.current += 1;
        l.stop();
        sayLocal(line);
      }
    }, 1500);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, panel]);

  // ---- controls -----------------------------------------------------------------------

  const toggleMic = () => {
    const next = !micOn;
    setMicOn(next);
    micOnRef.current = next;
    media.stream?.getAudioTracks().forEach((t) => (t.enabled = next));
  };

  const toggleCam = () => {
    const next = !camOn;
    setCamOn(next);
    media.stream?.getVideoTracks().forEach((t) => (t.enabled = next));
  };

  const sendNow = () => {
    const l = listenerRef.current;
    if (!l || (!l.speaking && partsRef.current.length === 0)) {
      notify("I haven't heard your answer yet - start speaking, or type it in the chat.");
      return;
    }
    l.finish();
  };

  const skipSpeech = () => playerRef.current?.stop();

  const submitDraft = (e) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text || status !== 'listening') return;
    setDraft('');
    sendAnswer(text, null);
  };

  const statusLabel = {
    connecting: 'Connecting…',
    thinking: 'Thinking…',
    speaking: 'Speaking',
    listening: !hasMic || sttErrorRef.current ? 'Waiting for your typed answer' : micOn ? 'Listening to you…' : "You're muted",
    transcribing: 'Processing your answer…',
    wrapping: 'Preparing your feedback…',
  }[status];

  const interviewerState = status === 'speaking' ? 'speaking' : status === 'thinking' || status === 'transcribing' ? 'thinking' : status === 'listening' ? 'listening' : 'idle';
  const initials = (setup.profile?.candidateName || 'You').split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  const showLive = (status === 'listening' || status === 'transcribing') && live;

  return (
    <div className="meet">
      <header className="meet-top">
        <div className="meet-title">
          <span className="rec-dot" />
          <strong>{setup.role}</strong>
          <span className="muted"> · {labelOf(LEVELS, setup.level)} · {labelOf(DIFFICULTIES, setup.difficulty)}</span>
        </div>
        <div className="meet-top-right">
          <span className="pill">
            Question {Math.min(progress.asked, progress.total)} / {progress.total}
          </span>
          <span className="pill">
            <Clock size={14} /> {formatTime(elapsed)}
          </span>
        </div>
      </header>

      <div className="meet-body">
        <main className="stage">
          <div className="tiles">
            <div className={`tile tile-ai ${status === 'speaking' ? 'is-speaking' : ''}`}>
              <div className="tile-avatar">
                <Avatar persona={persona} levelRef={playerRef.current?.level} state={interviewerState} />
              </div>
              <div className="tile-status">
                {(status === 'connecting' || status === 'thinking' || status === 'transcribing' || status === 'wrapping') && <Loader2 size={14} className="spin" />}
                {status === 'speaking' && <span className="eq"><i /><i /><i /></span>}
                {statusLabel}
              </div>
              <div className="tile-name">
                {persona.name} <span className="muted">· {persona.title}</span>
              </div>
            </div>

            <div className="tile tile-self" ref={selfTileRef}>
              {hasVideo && camOn ? (
                <video
                  className="self-video"
                  autoPlay
                  playsInline
                  muted
                  ref={(el) => {
                    if (el && el.srcObject !== media.stream) el.srcObject = media.stream;
                  }}
                />
              ) : (
                <div className="self-initial">{initials}</div>
              )}
              <div className="tile-name">
                You {!micOn && <MicOff size={14} className="red" />}
              </div>
              <div className="self-ring" />
            </div>
          </div>

          {ccOn && (showLive || caption) && (
            <div className="captions">
              <b>{showLive ? 'You' : persona.name.split(' ')[0]}</b>
              <span>{showLive ? live : caption}</span>
            </div>
          )}
        </main>

        {panel && (
          <aside className="panel">
            <div className="panel-tabs">
              <button className={panel === 'chat' ? 'on' : ''} onClick={() => setPanel('chat')}>Transcript & chat</button>
              <button className={panel === 'info' ? 'on' : ''} onClick={() => setPanel('info')}>Details</button>
              <button className="panel-close" onClick={() => setPanel(null)} aria-label="Close panel">×</button>
            </div>

            {panel === 'chat' ? (
              <>
                <div className="chat-list">
                  {messages.length === 0 && <p className="muted small">The conversation will appear here.</p>}
                  {messages.map((m, i) => (
                    <div key={i} className={`msg ${m.who}`}>
                      <div className="msg-who">{m.who === 'you' ? 'You' : persona.name.split(' ')[0]}</div>
                      <div className="msg-text">{m.text}</div>
                    </div>
                  ))}
                  <div ref={chatEndRef} />
                </div>
                <form className="chat-form" onSubmit={submitDraft}>
                  <input
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder={status === 'listening' ? 'Type your answer instead of speaking…' : 'Wait for your turn…'}
                    disabled={status !== 'listening'}
                  />
                  <button type="submit" disabled={status !== 'listening' || !draft.trim()} aria-label="Send answer">
                    <Send size={18} />
                  </button>
                </form>
              </>
            ) : (
              <div className="info-list">
                <dl>
                  <dt>Role</dt><dd>{setup.role}</dd>
                  <dt>Level</dt><dd>{labelOf(LEVELS, setup.level)}</dd>
                  <dt>Difficulty</dt><dd>{labelOf(DIFFICULTIES, setup.difficulty)}</dd>
                  <dt>Interviewer</dt><dd>{persona.name}</dd>
                </dl>
                <h4>Tips</h4>
                <ul>
                  <li>Speak naturally, then pause - the interviewer replies after ~2 seconds of silence.</li>
                  <li>Press <b>Send answer</b> to submit immediately.</li>
                  <li>Ask the interviewer to repeat or clarify any question.</li>
                  <li>Use headphones to avoid echo.</li>
                  <li>Mic not working? Type answers in the chat tab.</li>
                </ul>
              </div>
            )}
          </aside>
        )}
      </div>

      <footer className="controls">
        <div className="controls-left">
          <span className="muted">{persona.name}'s interview room</span>
        </div>

        <div className="controls-center">
          <button className={`ctl ${!micOn ? 'off' : ''}`} onClick={toggleMic} disabled={!hasMic} title={micOn ? 'Mute microphone' : 'Unmute microphone'}>
            {micOn ? <Mic size={20} /> : <MicOff size={20} />}
          </button>
          <button className={`ctl ${!camOn ? 'off' : ''}`} onClick={toggleCam} disabled={!hasVideo} title={camOn ? 'Turn off camera' : 'Turn on camera'}>
            {camOn ? <Video size={20} /> : <VideoOff size={20} />}
          </button>
          <button className={`ctl ${ccOn ? 'active' : ''}`} onClick={() => setCcOn(!ccOn)} title="Captions">
            <Captions size={20} />
          </button>

          {status === 'speaking' && (
            <button className="ctl pillbtn" onClick={skipSpeech} title="Skip the rest of the interviewer's speech">
              <SkipForward size={18} /> Skip
            </button>
          )}
          {status === 'listening' && hasMic && !sttErrorRef.current && (
            <button className="ctl pillbtn primary" onClick={sendNow} title="Submit your answer now">
              <Check size={18} /> Send answer
            </button>
          )}

          <button className="ctl end" onClick={() => setConfirmEnd(true)} title="End interview">
            <PhoneOff size={20} />
          </button>
        </div>

        <div className="controls-right">
          <button className={`ctl ${panel === 'info' ? 'active' : ''}`} onClick={() => setPanel(panel === 'info' ? null : 'info')} title="Details">
            <Info size={20} />
          </button>
          <button className={`ctl ${panel === 'chat' ? 'active' : ''}`} onClick={() => setPanel(panel === 'chat' ? null : 'chat')} title="Transcript & chat">
            <MessageSquare size={20} />
          </button>
        </div>
      </footer>

      {toast && <div className="toast" role="status">{toast}</div>}

      {confirmEnd && (
        <div className="modal-backdrop">
          <div className="modal">
            <h3>End the interview?</h3>
            <p>
              You'll get detailed feedback based on what you've answered so far
              {progress.asked < progress.total ? ` (${progress.asked} of ${progress.total} questions asked).` : '.'}
            </p>
            <div className="modal-actions">
              <button className="btn ghost" onClick={() => setConfirmEnd(false)}>Keep going</button>
              <button className="btn danger" onClick={finish}>End & get feedback</button>
            </div>
          </div>
        </div>
      )}

      {fatal && (
        <div className="modal-backdrop">
          <div className="modal">
            <h3><AlertTriangle size={20} className="red" /> Something went wrong</h3>
            <p>{fatal.message}</p>
            <div className="modal-actions">
              <button className="btn ghost" onClick={onLeave}>Leave</button>
              <button className="btn primary" onClick={fatal.retry}>Try again</button>
            </div>
          </div>
        </div>
      )}

      {status === 'wrapping' && !fatal && (
        <div className="modal-backdrop">
          <div className="modal center">
            <Loader2 size={36} className="spin blue" />
            <h3>Analysing your interview…</h3>
            <p className="muted">Writing detailed feedback. This usually takes 10–30 seconds.</p>
          </div>
        </div>
      )}
    </div>
  );
}
