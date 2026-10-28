// Decorative campus skyline (a graceful, lightweight fallback until licensed campus photography is added).
export default function CampusIllustration({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 800 260" className={className} aria-hidden="true" preserveAspectRatio="xMidYMax slice">
      <defs>
        <linearGradient id="bldg" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.16" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0.04" />
        </linearGradient>
      </defs>
      <g fill="url(#bldg)">
        <rect x="20" y="130" width="120" height="130" rx="4" />
        <rect x="150" y="90" width="90" height="170" rx="4" />
        <path d="M300 120 L400 60 L500 120 Z" />
        <rect x="300" y="120" width="200" height="140" />
        <rect x="520" y="110" width="110" height="150" rx="4" />
        <rect x="640" y="150" width="140" height="110" rx="4" />
        <rect x="385" y="20" width="30" height="45" />
      </g>
      <g fill="#C9A227" fillOpacity="0.55">
        {Array.from({ length: 6 }, (_, i) => (
          <rect key={`c${i}`} x={320 + i * 30} y={140} width="10" height="100" rx="2" />
        ))}
        <circle cx="400" cy="95" r="10" />
      </g>
      <g fill="#ffffff" fillOpacity="0.22">
        {Array.from({ length: 15 }, (_, i) => (
          <rect key={`w${i}`} x={35 + (i % 3) * 35} y={145 + Math.floor(i / 3) * 22} width="18" height="12" rx="2" />
        ))}
        {Array.from({ length: 12 }, (_, i) => (
          <rect key={`v${i}`} x={535 + (i % 3) * 32} y={125 + Math.floor(i / 3) * 30} width="18" height="16" rx="2" />
        ))}
      </g>
    </svg>
  );
}
