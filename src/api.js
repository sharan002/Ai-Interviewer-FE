async function parse(res) {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed (${res.status})`);
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
