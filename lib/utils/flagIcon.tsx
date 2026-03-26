// Cross-browser flag icon using the flag-icons CSS library (SVG sprites).
// Replaces Unicode regional indicator emoji which don't render on Windows Chrome/Edge.
//
// Usage: <FlagIcon code="CL" />  (ISO 3166-1 alpha-2 code, case-insensitive)

interface FlagIconProps {
  code: string;
  className?: string;
}

export function FlagIcon({ code, className }: FlagIconProps) {
  if (!code || code.length !== 2) return null;
  const lower = code.toLowerCase();
  const cls = ['fi', `fi-${lower}`, className].filter(Boolean).join(' ');
  return <span className={cls} aria-label={code.toUpperCase()} />;
}
