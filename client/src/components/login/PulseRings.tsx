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
          className="absolute rounded-full border border-blue-300/30 animate-pulse-ring"
          style={{
            width: `${400 + i * 100}px`,
            height: `${400 + i * 100}px`,
            animationDelay: `${i * 1}s`,
          }}
        />
      ))}
    </div>
  );
}
