export const LEVELS = [
  { id: 'fresher', label: 'Fresher', hint: '0–1 yrs' },
  { id: 'junior', label: 'Junior', hint: '1–3 yrs' },
  { id: 'mid', label: 'Mid-level', hint: '3–6 yrs' },
  { id: 'senior', label: 'Senior', hint: '6–10 yrs' },
  { id: 'lead', label: 'Lead', hint: '10+ yrs' },
];

export const DIFFICULTIES = [
  { id: 'easy', label: 'Easy', hint: 'Friendly, foundational questions' },
  { id: 'medium', label: 'Medium', hint: 'Standard industry interview' },
  { id: 'hard', label: 'Hard', hint: 'Deep, probing, no hints' },
];

export const TYPES = [
  { id: 'mixed', label: 'Mixed' },
  { id: 'technical', label: 'Technical' },
  { id: 'behavioral', label: 'Behavioral' },
];

export const LENGTHS = [
  { count: 5, label: 'Quick', hint: '5 questions · ~10 min' },
  { count: 8, label: 'Standard', hint: '8 questions · ~20 min' },
  { count: 12, label: 'Deep dive', hint: '12 questions · ~30 min' },
];

// `voice` is a Sarvam bulbul:v3 speaker; the rest styles the SVG avatar.
export const INTERVIEWERS = [
  { id: 'priya', name: 'Priya Sharma', title: 'Engineering Manager', voice: 'priya', skin: '#e0ac86', hair: '#241513', hairStyle: 'long', shirt: '#3c6e9e', glasses: false },
  { id: 'rahul', name: 'Rahul Verma', title: 'Principal Engineer', voice: 'rahul', skin: '#c68b62', hair: '#15110f', hairStyle: 'short', shirt: '#2f3c4f', glasses: true },
  { id: 'kavya', name: 'Kavya Nair', title: 'Senior Recruiter', voice: 'kavya', skin: '#b87a52', hair: '#2b1b14', hairStyle: 'bun', shirt: '#9b4d6a', glasses: false },
  { id: 'rohan', name: 'Rohan Mehta', title: 'Tech Lead', voice: 'rohan', skin: '#eac2a0', hair: '#4b3426', hairStyle: 'short', shirt: '#4d7a5c', glasses: false },
];

export const labelOf = (list, id) => list.find((x) => x.id === id)?.label ?? id;

export function formatTime(totalSec) {
  const s = Math.max(0, Math.floor(totalSec));
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
