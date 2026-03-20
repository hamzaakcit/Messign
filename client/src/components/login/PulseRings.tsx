export function PulseRings() {
  return (
    <div
      className="absolute inset-0 flex items-center justify-center pointer-events-none"
      style={{ zIndex: 4 }}
      aria-hidden
    >
      {[...Array(4)].map((_, i) => (
        <div
          key={i}
          className="absolute rounded-full border border-green-500/20 animate-login-pulse-ring"
          style={{
            width: `${400 + i * 100}px`,
            height: `${400 + i * 100}px`,
            animationDelay: `${i * 2.5}s`,
          }}
        />
      ))}
    </div>
  );
}
