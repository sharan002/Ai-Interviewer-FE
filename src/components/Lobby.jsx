import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Loader2, Mic, MicOff, Video, VideoOff, Volume2 } from 'lucide-react';
import { TtsPlayer } from '../lib/speaker.js';
import { DIFFICULTIES, LEVELS, labelOf } from '../constants.js';

export default function Lobby({ setup, onBack, onJoin }) {
  const persona = setup.interviewer;
  const [stream, setStream] = useState(null);
  const [asking, setAsking] = useState(true);
  const [problem, setProblem] = useState('');
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [testing, setTesting] = useState(false);
  const meterRef = useRef(null);
  const joinedRef = useRef(false);
  const streamRef = useRef(null);
  const playerRef = useRef(null);

  // Ask for camera + microphone, degrading gracefully if one is unavailable.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const audio = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
      const attempts = [
        { audio, video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' } },
        { audio, video: false },
      ];
      let got = null;
      for (const c of attempts) {
        try {
          got = await navigator.mediaDevices.getUserMedia(c);
          break;
        } catch (e) {
          if (c === attempts[0]) setProblem(e.name === 'NotAllowedError' ? 'Permission to use the camera/microphone was blocked.' : '');
        }
      }
      if (cancelled) {
        got?.getTracks().forEach((t) => t.stop());
        return;
      }
      if (got) {
        setProblem(got.getVideoTracks().length ? '' : 'No camera found or allowed - you can still join with audio only.');
        streamRef.current = got;
        setStream(got);
        setCamOn(got.getVideoTracks().length > 0);
      } else {
        setProblem('No microphone available. You can still join and type your answers.');
        setMicOn(false);
        setCamOn(false);
      }
      setAsking(false);
    })();

    return () => {
      cancelled = true;
      playerRef.current?.destroy();
      if (!joinedRef.current) streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // Live microphone level meter.
  useEffect(() => {
    if (!stream || !stream.getAudioTracks().length) return undefined;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctx();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    ctx.createMediaStreamSource(new MediaStream(stream.getAudioTracks())).connect(analyser);
    const buf = new Uint8Array(analyser.fftSize);
    let raf;
    const tick = () => {
      analyser.getByteTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) {
        const v = (buf[i] - 128) / 128;
        sum += v * v;
      }
      meterRef.current?.style.setProperty('--lvl', String(Math.min(1, Math.sqrt(sum / buf.length) * 7)));
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => {
      cancelAnimationFrame(raf);
      ctx.close().catch(() => {});
    };
  }, [stream]);

  const toggleMic = () => {
    const next = !micOn;
    setMicOn(next);
    stream?.getAudioTracks().forEach((t) => (t.enabled = next));
  };
  const toggleCam = () => {
    const next = !camOn;
    setCamOn(next);
    stream?.getVideoTracks().forEach((t) => (t.enabled = next));
  };

  async function testVoice() {
    setTesting(true);
    playerRef.current ??= new TtsPlayer();
    playerRef.current.speaker = persona.voice;
    playerRef.current.onFallback = (m) => setProblem(`Sarvam voice isn't available (${m}). The browser's voice will be used instead.`);
    try {
      await playerRef.current.speak(`Hi, I'm ${persona.name.split(' ')[0]}. I'll be your interviewer today. Can you hear me clearly?`);
    } finally {
      setTesting(false);
    }
  }

  function join() {
    joinedRef.current = true;
    onJoin({ stream, micOn: micOn && !!stream?.getAudioTracks().length, camOn: camOn && !!stream?.getVideoTracks().length });
  }

  const hasVideo = (stream?.getVideoTracks().length ?? 0) > 0;

  return (
    <div className="page lobby">
      <div className="lobby-grid">
        <div className="lobby-preview">
          <div className="preview-frame">
            {hasVideo && camOn ? (
              <video
                autoPlay
                playsInline
                muted
                className="self-video"
                ref={(el) => {
                  if (el && el.srcObject !== stream) el.srcObject = stream;
                }}
              />
            ) : (
              <div className="preview-off">{asking ? <Loader2 className="spin" size={28} /> : 'Camera is off'}</div>
            )}
            <div className="preview-controls">
              <button className={`ctl ${!micOn ? 'off' : ''}`} onClick={toggleMic} disabled={!stream?.getAudioTracks().length}>
                {micOn ? <Mic size={20} /> : <MicOff size={20} />}
              </button>
              <button className={`ctl ${!camOn ? 'off' : ''}`} onClick={toggleCam} disabled={!hasVideo}>
                {camOn ? <Video size={20} /> : <VideoOff size={20} />}
              </button>
            </div>
          </div>

          <div className="mic-meter" ref={meterRef}>
            <Mic size={16} />
            <div className="bar"><i /></div>
            <span className="muted small">{micOn ? 'Speak to test your microphone' : 'Microphone is off'}</span>
          </div>
          {problem && <p className="hint-warn">{problem}</p>}
        </div>

        <div className="lobby-side">
          <h2>Ready to join?</h2>
          <p className="muted">
            {persona.name} · {persona.title}
          </p>
          <ul className="summary">
            <li><span>Role</span><b>{setup.role}</b></li>
            <li><span>Level</span><b>{labelOf(LEVELS, setup.level)}</b></li>
            <li><span>Difficulty</span><b>{labelOf(DIFFICULTIES, setup.difficulty)}</b></li>
            <li><span>Questions</span><b>{setup.questionCount}</b></li>
          </ul>
          <ul className="checklist">
            <li>Find a quiet spot, and use headphones if you can.</li>
            <li>Answer out loud as you would in a real interview.</li>
            <li>The interviewer replies after you pause for ~2 seconds.</li>
          </ul>
          <button className="btn ghost" onClick={testVoice} disabled={testing}>
            {testing ? <Loader2 size={16} className="spin" /> : <Volume2 size={16} />} Test interviewer voice
          </button>
          <div className="lobby-actions">
            <button className="btn ghost" onClick={onBack}><ArrowLeft size={16} /> Back</button>
            <button className="btn primary big" onClick={join} disabled={asking}>Join now</button>
          </div>
        </div>
      </div>
    </div>
  );
}
