'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function Navigation() {
  const pathname = usePathname();

  const navItems = [
    { href: '/mission', label: 'Mission Control', icon: '🎯' },
    { href: '/approvals', label: 'Approval Inbox', icon: '✓' },
    { href: '/policies', label: 'Policy Library', icon: '📋' },
    { href: '/recorder', label: 'Flight Recorder', icon: '📼' },
  ];

  return (
    <nav style={{
      backgroundColor: '#1e293b',
      padding: '1rem 2rem',
      marginBottom: '0',
      boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
    }}>
      <div style={{
        maxWidth: '1400px',
        margin: '0 auto',
        display: 'flex',
        alignItems: 'center',
        gap: '2rem',
      }}>
        <Link
          href="/"
          style={{
            fontSize: '1.5rem',
            fontWeight: 'bold',
            color: 'white',
            textDecoration: 'none',
            marginRight: '1rem',
          }}
        >
          MANDATE
        </Link>

        <div style={{ display: 'flex', gap: '0.5rem', flex: 1 }}>
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                style={{
                  padding: '0.5rem 1rem',
                  borderRadius: '6px',
                  textDecoration: 'none',
                  fontSize: '0.875rem',
                  fontWeight: isActive ? 'bold' : 'normal',
                  backgroundColor: isActive ? '#3b82f6' : 'transparent',
                  color: 'white',
                  transition: 'background-color 0.2s',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                }}
                onMouseEnter={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.backgroundColor = '#334155';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }
                }}
              >
                <span>{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
