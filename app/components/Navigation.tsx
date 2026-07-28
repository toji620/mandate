'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

const navItems = [
  { href: '/mission', label: 'Mission Control' },
  { href: '/approvals', label: 'Approval Inbox' },
  { href: '/policies', label: 'Policy Library' },
  { href: '/recorder', label: 'Flight Recorder' },
];

export default function Navigation() {
  const pathname = usePathname();
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch('/api/approvals');
        const data = await res.json();
        if (!cancelled) setPendingCount((data.approvals ?? []).length);
      } catch {
        // Badge is best-effort.
      }
    };
    poll();
    const interval = setInterval(poll, 3000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return (
    <nav className="nav">
      <div className="nav-inner">
        <Link href="/" className="nav-wordmark">
          <span className="nav-glyph" aria-hidden />
          MANDATE
        </Link>
        <div className="nav-tabs">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`nav-tab${pathname === item.href ? ' active' : ''}`}
            >
              {item.label}
              {item.href === '/approvals' && pendingCount > 0 && (
                <span className="nav-badge" aria-label={`${pendingCount} pending approvals`}>
                  {pendingCount}
                </span>
              )}
            </Link>
          ))}
        </div>
      </div>
    </nav>
  );
}
