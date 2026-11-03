import { useEffect, useRef } from 'react';

const mouthPath = (o) => {
  const x1 = 84 + o * 3;
  const x2 = 116 - o * 3;
  const y = 122;
  return `M${x1} ${y} Q100 ${y + 5 - 5 * o} ${x2} ${y} Q100 ${y + 7 + 22 * o} ${x1} ${y} Z`;
};

const HAIR_FRONT =
  'M51 88 C46 40 78 26 100 26 C126 26 154 42 149 88 C142 66 126 56 100 56 C74 56 58 66 51 88 Z';
const HAIR_LONG_BACK =
  'M50 90 C36 140 42 192 62 206 L138 206 C158 192 164 140 150 90 Z';

/**
 * A simple SVG interviewer. Mouth, head movement, eyes and brows are driven from a
 * requestAnimationFrame loop that reads `levelRef.current` (0..1 speech loudness),
 * so React never re-renders while it talks.
 *
 * state: 'idle' | 'speaking' | 'listening' | 'thinking'
 */
export default function Avatar({ persona, levelRef, state = 'idle', animated = true }) {
  const mouthRef = useRef(null);
  const headRef = useRef(null);
  const pupilsRef = useRef(null);
  const browsRef = useRef(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    if (!animated) return undefined;
    let raf;
    let lvl = 0;
    const t0 = performance.now();
    const tick = (now) => {
      const t = (now - t0) / 1000;
      const target = levelRef?.current ?? 0;
      lvl += (target - lvl) * 0.45;
      const open = Math.min(1, lvl * 1.7);
      const s = stateRef.current;

      mouthRef.current?.setAttribute('d', mouthPath(open));

      const nod = s === 'listening' ? Math.sin(t * 1.6) * 0.9 : 0;
      const sway = Math.sin(t * 0.6) * 0.7;
      const bob = Math.sin(t * 1.1) * 0.7 + open * 1.4;
      if (headRef.current) {
        headRef.current.style.transform = `translate(${sway}px, ${bob + nod}px) rotate(${sway * 0.6 + (s === 'speaking' ? Math.sin(t * 3) * 0.5 : 0)}deg)`;
      }

      // Eyes drift up-and-aside while "thinking", settle on the candidate otherwise.
      const px = s === 'thinking' ? 2.5 : Math.sin(t * 0.4) * 0.8;
      const py = s === 'thinking' ? -2.2 : 0;
      if (pupilsRef.current) pupilsRef.current.style.transform = `translate(${px}px, ${py}px)`;

      const brow = s === 'thinking' ? -3 : s === 'listening' ? -1.2 : -open * 1.2;
      if (browsRef.current) browsRef.current.style.transform = `translateY(${brow}px)`;

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [animated, levelRef]);

  const { skin, hair, shirt, hairStyle, glasses } = persona;
  const blinkDelay = `${(persona.id.charCodeAt(0) % 5) * 0.7}s`;

  return (
    <svg viewBox="0 0 200 220" className="avatar-svg" role="img" aria-label={`${persona.name}, interviewer`}>
      {hairStyle === 'long' && <path d={HAIR_LONG_BACK} fill={hair} />}
      {hairStyle === 'bun' && <circle cx="100" cy="26" r="19" fill={hair} />}

      {/* neck + shoulders */}
      <rect x="86" y="126" width="28" height="44" rx="10" fill={skin} />
      <rect x="86" y="126" width="28" height="44" rx="10" fill="#000" opacity="0.12" />
      <path d="M14 224 C16 178 58 160 100 160 C142 160 184 178 186 224 Z" fill={shirt} />
      <path d="M80 161 L100 190 L120 161 Z" fill={skin} />
      <path d="M80 161 L100 190 L120 161" fill="none" stroke="#000" strokeOpacity="0.15" strokeWidth="2" />

      <g ref={headRef} style={{ transformOrigin: '100px 150px' }}>
        <ellipse cx="52" cy="96" rx="7" ry="12" fill={skin} />
        <ellipse cx="148" cy="96" rx="7" ry="12" fill={skin} />
        <ellipse cx="100" cy="92" rx="48" ry="56" fill={skin} />
        <circle cx="72" cy="110" r="9" fill="#e5707a" opacity="0.16" />
        <circle cx="128" cy="110" r="9" fill="#e5707a" opacity="0.16" />

        {/* eyes */}
        <g>
          <g className="av-eye" style={{ animationDelay: blinkDelay }}>
            <ellipse cx="80" cy="90" rx="9.5" ry="6.5" fill="#fff" />
          </g>
          <g className="av-eye" style={{ animationDelay: blinkDelay }}>
            <ellipse cx="120" cy="90" rx="9.5" ry="6.5" fill="#fff" />
          </g>
          <g ref={pupilsRef}>
            <circle cx="80" cy="90" r="3.8" fill="#2a1d17" />
            <circle cx="120" cy="90" r="3.8" fill="#2a1d17" />
            <circle cx="81.4" cy="88.6" r="1.1" fill="#fff" />
            <circle cx="121.4" cy="88.6" r="1.1" fill="#fff" />
          </g>
        </g>

        <g ref={browsRef} fill="none" stroke={hair} strokeWidth="3.6" strokeLinecap="round">
          <path d="M67 76 Q80 69 93 75" />
          <path d="M107 75 Q120 69 133 76" />
        </g>

        <path d="M100 96 Q95 110 99 113 Q104 114 106 110" fill="none" stroke="#000" strokeOpacity="0.22" strokeWidth="2" strokeLinecap="round" />

        <path
          ref={mouthRef}
          d={mouthPath(0)}
          fill="#6e2a33"
          stroke="#a24a52"
          strokeWidth="2.2"
          strokeLinejoin="round"
        />

        {glasses && (
          <g fill="rgba(255,255,255,0.08)" stroke="#1f2328" strokeWidth="2.6">
            <rect x="64" y="78" width="32" height="24" rx="10" />
            <rect x="104" y="78" width="32" height="24" rx="10" />
            <path d="M96 88 H104" fill="none" />
          </g>
        )}

        <path d={HAIR_FRONT} fill={hair} />
        {hairStyle === 'long' && (
          <>
            <path d="M51 88 C44 110 46 134 54 150 C56 124 54 106 58 92 Z" fill={hair} />
            <path d="M149 88 C156 110 154 134 146 150 C144 124 146 106 142 92 Z" fill={hair} />
          </>
        )}
      </g>
    </svg>
  );
}
