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
  health: () => fetch('/api/health').then(parse),

  registerLead: (payload) => post('/api/lead/register', payload),

  analyzeResume(file) {
    const fd = new FormData();
    fd.append('resume', file);
    return fetch('/api/resume/analyze', { method: 'POST', body: fd }).then(parse);
  },

  startInterview: (payload) => post('/api/interview/start', payload),
  answer: (id, payload) => post(`/api/interview/${id}/answer`, payload),
  end: (id) => post(`/api/interview/${id}/end`, {}),

  async transcribe(wavBlob) {
    const fd = new FormData();
    fd.append('audio', wavBlob, 'speech.wav');
    const { transcript } = await fetch('/api/stt', { method: 'POST', body: fd }).then(parse);
    return transcript;
  },

  simliConfig: () => fetch('/api/simli/config').then(parse),
  simliSession: (leadToken, interviewer) => post('/api/simli/session', { leadToken, interviewer }),

  async tts(text, speaker) {
    const res = await fetch('/api/tts', {
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
