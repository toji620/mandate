'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const navItems = [
  { href: '/mission', label: 'Mission Control' },
  { href: '/approvals', label: 'Approval Inbox' },
  { href: '/policies', label: 'Policy Library' },
  { href: '/recorder', label: 'Flight Recorder' },
];

export default function Navigation() {
  const pathname = usePathname();

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
            </Link>
          ))}
        </div>
      </div>
    </nav>
  );
}
