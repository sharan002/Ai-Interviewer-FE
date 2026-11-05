const BASE = import.meta.env.VITE_API_BASE_URL || 'https://mockinterview.appincoimbatore.com/mockinterviewbe';

async function parse(res) {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err = new Error(body.error || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

const post = (url, body) =>
  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then(parse);

export const api = {
  health: () => fetch(`${BASE}/api/health`).then(parse),

  registerLead: (payload) => post(`${BASE}/api/lead/register`, payload),

  analyzeResume(file) {
    const fd = new FormData();
    fd.append('resume', file);
    return fetch(`${BASE}/api/resume/analyze`, { method: 'POST', body: fd }).then(parse);
  },

  startInterview: (payload) => post(`${BASE}/api/interview/start`, payload),
  answer: (id, payload) => post(`${BASE}/api/interview/${id}/answer`, payload),
  end: (id) => post(`${BASE}/api/interview/${id}/end`, {}),

  async transcribe(wavBlob) {
    const fd = new FormData();
    fd.append('audio', wavBlob, 'speech.wav');
    const { transcript } = await fetch(`${BASE}/api/stt`, { method: 'POST', body: fd }).then(parse);
    return transcript;
  },

  simliConfig: () => fetch(`${BASE}/api/simli/config`).then(parse),
  simliSession: (leadToken, interviewer) => post(`${BASE}/api/simli/session`, { leadToken, interviewer }),

  async tts(text, speaker) {
    const res = await fetch(`${BASE}/api/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, speaker }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `TTS failed (${res.status})`);
    }
    return res.arrayBuffer();
  },
};
