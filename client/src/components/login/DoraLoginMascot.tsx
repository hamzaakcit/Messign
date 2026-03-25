import { useId, useEffect, useState } from 'react';
import { motion, useSpring, useTransform } from 'framer-motion';

export type ActiveField = 'none' | 'email' | 'password';

interface DoraLoginMascotProps {
  mouseX: number;
  mouseY: number;
  activeField: ActiveField;
  size?: number;
}

export function DoraLoginMascot({
  mouseX,
  mouseY,
  activeField,
  size = 350,
}: DoraLoginMascotProps) {
  const uid = useId().replace(/:/g, '');
  const [peekBack, setPeekBack] = useState(false);

  // Smooth spring-based mouse tracking for pupils
  const springConfig = { stiffness: 150, damping: 20, mass: 0.5 };
  const mx = useSpring(0, springConfig);
  const my = useSpring(0, springConfig);

  // Pupil offset (max 3px in viewBox coords)
  const pupilX = useTransform(mx, [-1, 1], [-3, 3]);
  const pupilY = useTransform(my, [-1, 1], [-2, 2]);

  // Body rotation based on state
  const bodyRotation = useSpring(0, { stiffness: 80, damping: 18 });
  const bodyX = useSpring(0, { stiffness: 80, damping: 18 });

  useEffect(() => {
    if (activeField === 'password') {
      // Turn away
      bodyRotation.set(25);
      bodyX.set(15);
      mx.set(1); // eyes look away
      my.set(0);
      setPeekBack(false);
      const timer = setTimeout(() => setPeekBack(true), 2500);
      return () => clearTimeout(timer);
    } else if (activeField === 'email') {
      // Lean toward form (left)
      bodyRotation.set(-5);
      bodyX.set(-8);
      mx.set(-0.8); // eyes look toward input
      my.set(0.4);
    } else {
      // Idle — follow mouse
      bodyRotation.set(0);
      bodyX.set(0);
      mx.set(mouseX);
      my.set(mouseY);
      setPeekBack(false);
    }
  }, [activeField, mouseX, mouseY, bodyRotation, bodyX, mx, my]);

  // Right eye peek-back: partially open after turning away
  const rightEyeScaleY = useSpring(1, { stiffness: 120, damping: 14 });
  useEffect(() => {
    if (activeField === 'password' && peekBack) {
      rightEyeScaleY.set(0.35); // partially open — peeking
    } else if (activeField === 'password') {
      rightEyeScaleY.set(0.05); // closed — turned away
    } else {
      rightEyeScaleY.set(1);
    }
  }, [activeField, peekBack, rightEyeScaleY]);

  // Left eye fully closed when password
  const leftEyeScaleY = useSpring(1, { stiffness: 120, damping: 14 });
  useEffect(() => {
    if (activeField === 'password') {
      leftEyeScaleY.set(0.05);
    } else {
      leftEyeScaleY.set(1);
    }
  }, [activeField, leftEyeScaleY]);

  // Mouth shape
  const smilePath = activeField === 'email'
    ? 'M40 42Q45 47.5 51 42' // bigger smile when curious
    : activeField === 'password'
      ? 'M42 43Q45.5 44 49 43' // small neutral line
      : 'M40 42Q45 46 51 42'; // normal smile

  return (
    <motion.div
      style={{ width: size, height: size }}
      animate={{ y: [0, -8, -3, -10, 0] }}
      transition={{
        duration: 6,
        repeat: Infinity,
        ease: 'easeInOut',
      }}
    >
      <motion.svg
        width={size}
        height={size}
        viewBox="0 0 100 100"
        fill="none"
        style={{
          overflow: 'visible',
          rotateZ: bodyRotation,
          x: bodyX,
          transformOrigin: '50% 50%',
        }}
      >
        <defs>
          <linearGradient id={`pg${uid}`} x1="10" y1="20" x2="80" y2="75" gradientUnits="userSpaceOnUse">
            <stop stopColor="#00D9D5" />
            <stop offset="0.5" stopColor="#3B82F6" />
            <stop offset="1" stopColor="#8B5CF6" />
          </linearGradient>
          <linearGradient id={`pgd${uid}`} x1="10" y1="20" x2="80" y2="75" gradientUnits="userSpaceOnUse">
            <stop stopColor="#0891b2" />
            <stop offset="0.5" stopColor="#2563eb" />
            <stop offset="1" stopColor="#7c3aed" />
          </linearGradient>
          <linearGradient id={`hat${uid}`} x1="30" y1="12" x2="58" y2="30" gradientUnits="userSpaceOnUse">
            <stop stopColor="#1e293b" />
            <stop offset="1" stopColor="#0f172a" />
          </linearGradient>
          <radialGradient id={`lens${uid}`} cx="0.4" cy="0.35" r="0.65">
            <stop stopColor="#67e8f9" stopOpacity="0.9" />
            <stop offset="0.6" stopColor="#06b6d4" stopOpacity="0.7" />
            <stop offset="1" stopColor="#8b5cf6" stopOpacity="0.5" />
          </radialGradient>
          <radialGradient id={`eng${uid}`} cx="0.5" cy="0.5" r="0.5">
            <stop stopColor="#00D9D5" stopOpacity="0.9" />
            <stop offset="1" stopColor="#3B82F6" stopOpacity="0" />
          </radialGradient>
          <linearGradient id={`scarf${uid}`} x1="30" y1="42" x2="55" y2="50">
            <stop stopColor="#ef4444" />
            <stop offset="1" stopColor="#dc2626" />
          </linearGradient>
          {/* Enhanced lens glow for active states */}
          <radialGradient id={`lensGlow${uid}`} cx="0.4" cy="0.35" r="0.65">
            <stop stopColor="#a5f3fc" stopOpacity="0.95" />
            <stop offset="0.5" stopColor="#22d3ee" stopOpacity="0.8" />
            <stop offset="1" stopColor="#a78bfa" stopOpacity="0.6" />
          </radialGradient>
          {/* Shadow for depth */}
          <filter id={`shadow${uid}`} x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="4" stdDeviation="6" floodColor="#3B82F6" floodOpacity="0.25" />
          </filter>
        </defs>

        {/* Engine exhaust — always on, subtle */}
        <g opacity="0.5">
          <circle cx="16" cy="48" r="2.5" fill={`url(#eng${uid})`}
            style={{ animation: 'dp-engine-glow 0.8s ease-in-out infinite' }} />
          <circle cx="14" cy="53" r="2" fill={`url(#eng${uid})`}
            style={{ animation: 'dp-engine-glow 0.8s ease-in-out infinite 0.2s' }} />
        </g>

        {/* Plane body with shadow */}
        <g filter={`url(#shadow${uid})`}>
          <path d="M14 50L78 22L65 50L78 78L14 50Z" fill={`url(#pg${uid})`} />
          <path d="M14 50L65 50" stroke={`url(#pgd${uid})`} strokeWidth="1.4" strokeLinecap="round" />
          {/* Light side (top) */}
          <path d="M17 49L75 23L63 49" fill="rgba(255,255,255,0.22)" />
          {/* Dark side (bottom) */}
          <path d="M17 51L63 51L75 77" fill="rgba(0,0,0,0.08)" />
          {/* Wing creases */}
          <path d="M40 40L65 50" stroke="rgba(255,255,255,0.12)" strokeWidth="0.6" />
          <path d="M40 60L65 50" stroke="rgba(0,0,0,0.06)" strokeWidth="0.6" />
        </g>

        {/* Exhaust ports */}
        <circle cx="16" cy="48" r="1.8" fill="#0f172a" stroke="#334155" strokeWidth="0.5" />
        <circle cx="15" cy="53" r="1.4" fill="#0f172a" stroke="#334155" strokeWidth="0.4" />

        {/* Aviator scarf */}
        <g>
          <path d="M32 45Q38 48 44 46L46 50Q40 53 33 50Z"
            fill={`url(#scarf${uid})`} opacity="0.85" />
          <path d="M33 50Q28 54 24 52Q22 56 18 55"
            stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round" fill="none" opacity="0.7"
            style={{
              transformOrigin: '33px 50px',
              animation: activeField === 'password'
                ? 'wind-ruffle 0.5s ease-in-out infinite'
                : 'wind-ruffle 3s ease-in-out infinite',
            }} />
        </g>

        {/* Aviator hat */}
        <g>
          <ellipse cx="45" cy="28" rx="16" ry="10" fill={`url(#hat${uid})`} />
          <ellipse cx="43" cy="25" rx="10" ry="5" fill="rgba(255,255,255,0.04)" />
          <path d="M28 30Q33 36 45 36Q57 36 62 30"
            stroke="#475569" strokeWidth="3" strokeLinecap="round" fill="none" />
          <path d="M29 30Q34 35.5 45 35.5Q56 35.5 61 30"
            stroke="#334155" strokeWidth="1.5" strokeLinecap="round" fill="none" />
          {/* Stitching */}
          <path d="M36 21Q45 17 54 21" stroke="#475569" strokeWidth="0.6" fill="none" strokeDasharray="2 1.5" />
          {/* Top button */}
          <circle cx="45" cy="19" r="1.8" fill="#334155" stroke="#475569" strokeWidth="0.5" />
          {/* Ear flaps */}
          <path d="M30 30L25 37Q26 40 29 39L31 34" fill="#1e293b" stroke="#334155" strokeWidth="0.5" />
          <path d="M60 30L65 37Q64 40 61 39L59 34" fill="#1e293b" stroke="#334155" strokeWidth="0.5" />
          <path d="M29 38Q37 42 45 42" stroke="#475569" strokeWidth="0.5" fill="none" opacity="0.5" />
        </g>

        {/* Goggles strap */}
        <path d="M29 32Q45 37 61 32" stroke="#94a3b8" strokeWidth="1.8" fill="none" />

        {/* ===== LEFT EYE ===== */}
        <g>
          {/* Goggle frame */}
          <ellipse cx="38" cy="34" rx="7" ry="5.5" fill="#0f172a" stroke="#94a3b8" strokeWidth="1.2" />

          {/* Lens + Pupil (blinks together) */}
          <motion.g style={{
            originX: '38px',
            originY: '34px',
            scaleY: leftEyeScaleY,
          }}>
            {/* Lens fill */}
            <ellipse cx="38" cy="34" rx="5.5" ry="4"
              fill={activeField === 'email' ? `url(#lensGlow${uid})` : `url(#lens${uid})`} />

            {/* Pupil group — tracks mouse */}
            <motion.g style={{ x: pupilX, y: pupilY }}>
              <circle cx="39" cy="34" r="2.4" fill="#0f172a" />
              <circle cx="39" cy="34" r="1.6" fill="#1e293b" />
              {/* Main highlight */}
              <circle cx="40.2" cy="32.8" r="0.8" fill="rgba(255,255,255,0.9)" />
              {/* Secondary highlight */}
              <circle cx="38" cy="35.2" r="0.4" fill="rgba(255,255,255,0.45)" />
            </motion.g>
          </motion.g>

          {/* Blink overlay — CSS animation (only when idle/email) */}
          {activeField === 'none' && (
            <ellipse cx="38" cy="34" rx="5.5" ry="4" fill="#0f172a"
              style={{
                transformOrigin: '38px 34px',
                animation: 'face-blink 4.5s ease-in-out infinite',
                pointerEvents: 'none',
              }} />
          )}

          {/* Lens reflection */}
          <path d="M32 31Q35 29 41 30" stroke="rgba(255,255,255,0.15)" strokeWidth="0.5" fill="none" />
        </g>

        {/* ===== RIGHT EYE ===== */}
        <g>
          {/* Goggle frame */}
          <ellipse cx="53" cy="34" rx="7" ry="5.5" fill="#0f172a" stroke="#94a3b8" strokeWidth="1.2" />

          {/* Lens + Pupil (blinks together) */}
          <motion.g style={{
            originX: '53px',
            originY: '34px',
            scaleY: rightEyeScaleY,
          }}>
            {/* Lens fill */}
            <ellipse cx="53" cy="34" rx="5.5" ry="4"
              fill={activeField === 'email' ? `url(#lensGlow${uid})` : `url(#lens${uid})`} />

            {/* Pupil group — tracks mouse */}
            <motion.g style={{ x: pupilX, y: pupilY }}>
              <circle cx="54" cy="34" r="2.4" fill="#0f172a" />
              <circle cx="54" cy="34" r="1.6" fill="#1e293b" />
              <circle cx="55.2" cy="32.8" r="0.8" fill="rgba(255,255,255,0.9)" />
              <circle cx="53" cy="35.2" r="0.4" fill="rgba(255,255,255,0.45)" />
            </motion.g>
          </motion.g>

          {/* Blink overlay — CSS animation (only when idle) */}
          {activeField === 'none' && (
            <ellipse cx="53" cy="34" rx="5.5" ry="4" fill="#0f172a"
              style={{
                transformOrigin: '53px 34px',
                animation: 'face-blink 4.5s ease-in-out infinite 0.05s',
                pointerEvents: 'none',
              }} />
          )}

          {/* Goggle glint */}
          <rect x="50" y="31" width="2" height="5.5" rx="1"
            fill="rgba(255,255,255,0.8)"
            style={{ animation: 'goggle-glint 5s ease-in-out infinite 2s', transformOrigin: '51px 34px' }}
          />

          {/* Lens reflection */}
          <path d="M47 31Q50 29 56 30" stroke="rgba(255,255,255,0.15)" strokeWidth="0.5" fill="none" />
        </g>

        {/* Nose bridge */}
        <path d="M44 35Q45.5 33 47 35" stroke="#94a3b8" strokeWidth="0.8" fill="none" />

        {/* Eyebrows — express emotion */}
        {activeField === 'email' && (
          <g>
            {/* Raised curious eyebrows */}
            <path d="M33 28Q38 25 43 27" stroke="#475569" strokeWidth="1" fill="none" strokeLinecap="round" />
            <path d="M48 27Q53 25 58 28" stroke="#475569" strokeWidth="1" fill="none" strokeLinecap="round" />
          </g>
        )}
        {activeField === 'password' && (
          <g>
            {/* Slightly furrowed / neutral eyebrows */}
            <path d="M33 29Q38 28 43 29" stroke="#475569" strokeWidth="0.8" fill="none" strokeLinecap="round" />
            <path d="M48 29Q53 28 58 29" stroke="#475569" strokeWidth="0.8" fill="none" strokeLinecap="round" />
          </g>
        )}

        {/* Mouth / Smile */}
        <motion.path
          d={smilePath}
          stroke="#e2e8f0"
          strokeWidth="1.2"
          strokeLinecap="round"
          fill="none"
          initial={false}
          animate={{ d: smilePath }}
          transition={{ duration: 0.4, ease: 'easeInOut' }}
        />

        {/* Blush cheeks */}
        <ellipse cx="34" cy="40" rx="2.8" ry="1.5"
          fill={activeField === 'email' ? 'rgba(244,114,182,0.25)' : 'rgba(244,114,182,0.13)'} />
        <ellipse cx="57" cy="40" rx="2.8" ry="1.5"
          fill={activeField === 'email' ? 'rgba(244,114,182,0.25)' : 'rgba(244,114,182,0.13)'} />
      </motion.svg>
    </motion.div>
  );
}
