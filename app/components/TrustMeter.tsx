'use client';

type Band = 'PROBATION' | 'SUPERVISED' | 'TRUSTED';

const FILL_COUNT: Record<Band, number> = {
  PROBATION: 1,
  SUPERVISED: 2,
  TRUSTED: 3,
};

export default function TrustMeter({ band }: { band: Band }) {
  const filled = FILL_COUNT[band];

  return (
    <span
      className="tmeter"
      role="img"
      aria-label={`trust band: ${band} (${filled} of 3)`}
    >
      {[0, 1, 2].map((i) => (
        <span key={i} className={i < filled ? 'seg fill' : 'seg'} aria-hidden="true" />
      ))}
    </span>
  );
}
