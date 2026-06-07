export function Sparkle({ size = 56 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: "block" }}
    >
      <defs>
        <linearGradient id="sp" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ff5b6e" />
          <stop offset="33%" stopColor="#ffb84a" />
          <stop offset="66%" stopColor="#4ade80" />
          <stop offset="100%" stopColor="#4f8cff" />
        </linearGradient>
      </defs>
      <path
        d="M32 2 C34 22 42 30 62 32 C42 34 34 42 32 62 C30 42 22 34 2 32 C22 30 30 22 32 2 Z"
        fill="url(#sp)"
      />
    </svg>
  );
}
