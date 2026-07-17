'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import AuthorityField from './components/AuthorityField';

type LoopEntry =
  | {
      kind: 'step';
      step: number;
      agent: string;
      action: string;
      verdict: 'ALLOW' | 'REVIEW' | 'APPROVAL' | 'BLOCK';
      band: 'PROBATION' | 'SUPERVISED' | 'TRUSTED';
    }
  | { kind: 'event'; text: string; demotion?: boolean };

const LOOP: LoopEntry[] = [
  { kind: 'step', step: 1, agent: 'sourcing', action: 'Gather requirements', verdict: 'ALLOW', band: 'PROBATION' },
  { kind: 'step', step: 2, agent: 'sourcing', action: 'Request quotations', verdict: 'ALLOW', band: 'PROBATION' },
  { kind: 'event', text: 'SOURCING PROMOTED · PROBATION → SUPERVISED' },
  { kind: 'step', step: 3, agent: 'sourcing', action: 'Compare approved vendors', verdict: 'ALLOW', band: 'SUPERVISED' },
  { kind: 'step', step: 4, agent: 'sourcing', action: 'Select supplier', verdict: 'REVIEW', band: 'SUPERVISED' },
  { kind: 'step', step: 5, agent: 'procurement', action: 'Commit GBP 22,400', verdict: 'APPROVAL', band: 'SUPERVISED' },
  { kind: 'step', step: 6, agent: 'sourcing', action: 'Use cheaper unapproved supplier', verdict: 'BLOCK', band: 'SUPERVISED' },
  { kind: 'event', text: 'SOURCING DEMOTED · SUPERVISED → PROBATION', demotion: true },
  { kind: 'step', step: 7, agent: 'procurement', action: 'Issue purchase order', verdict: 'ALLOW', band: 'PROBATION' },
];

const TICK_MS = 1100;
const HOLD_TICKS = 4;

function LoopRow({
  entry,
  instant,
  cycle,
}: {
  entry: Extract<LoopEntry, { kind: 'step' }>;
  instant: boolean;
  cycle: number;
}) {
  const [chars, setChars] = useState(instant ? entry.action.length : 0);
  const done = chars >= entry.action.length;

  useEffect(() => {
    if (instant) {
      setChars(entry.action.length);
      return;
    }
    setChars(0);
    const id = setInterval(() => {
      setChars((c) => {
        if (c >= entry.action.length) {
          clearInterval(id);
          return c;
        }
        return c + 1;
      });
    }, 22);
    return () => clearInterval(id);
  }, [instant, entry.action, cycle]);

  return (
    <div className="loop-row">
      <span className="loop-step">
        {String(entry.step).padStart(2, '0')} · {entry.agent}
      </span>
      <span className="loop-action">
        {entry.action.slice(0, chars)}
        {!done && <span className="loop-caret" aria-hidden />}
      </span>
      <span className={`loop-chips${done ? ' on' : ''}`}>
        <span className={`band band-${entry.band.toLowerCase()}`}>{entry.band}</span>
        <span className={`chip chip-${entry.verdict.toLowerCase()}`}>{entry.verdict}</span>
      </span>
    </div>
  );
}

function AuthorityLoop() {
  const [tick, setTick] = useState(1);
  const [cycle, setCycle] = useState(0);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setReduced(true);
      setTick(LOOP.length);
      return;
    }
    const id = setInterval(() => {
      setTick((t) => {
        if (t >= LOOP.length + HOLD_TICKS) {
          setCycle((c) => c + 1);
          return 1;
        }
        return t + 1;
      });
    }, TICK_MS);
    return () => clearInterval(id);
  }, []);

  const visible = LOOP.slice(0, Math.min(tick, LOOP.length));

  return (
    <div className="card loop-panel rise rise-5">
      <div className="loop-head">
        <span className="loop-title">Golden-path replay · 20 laptops · under GBP 25,000</span>
        <span className="loop-live">running</span>
      </div>
      <div className="loop-body">
        {visible.map((entry, i) =>
          entry.kind === 'event' ? (
            <div key={`${cycle}-${i}`} className={`ledger-event${entry.demotion ? ' demotion' : ''}`}>
              {entry.text}
            </div>
          ) : (
            <LoopRow key={`${cycle}-${i}`} entry={entry} instant={reduced} cycle={cycle} />
          )
        )}
      </div>
    </div>
  );
}

const SCREENS = [
  {
    href: '/mission',
    eyebrow: 'Live authority feed',
    title: 'Mission Control',
    blurb: 'Watch agents propose and the evaluator decide, step by step.',
  },
  {
    href: '/approvals',
    eyebrow: 'Human authority',
    title: 'Approval Inbox',
    blurb: 'Approvals that unblock paused missions, with the rule cited.',
  },
  {
    href: '/policies',
    eyebrow: 'Source of truth',
    title: 'Policy Library',
    blurb: 'Documents parsed into enforceable rules, every one with its source sentence.',
  },
  {
    href: '/recorder',
    eyebrow: 'Audit trail',
    title: 'Flight Recorder',
    blurb: 'Every decision replayable: proposal, verdict, rule, approver, passage.',
  },
];

export default function Home() {
  return (
    <main>
      <section className="hero">
        <AuthorityField />
        <p className="hero-eyebrow rise">Earned autonomy for AI co-workers</p>
        <h1 className="hero-title rise rise-2">
          A mandate, <em>not a blank cheque</em>
        </h1>
        <p className="hero-sub rise rise-3">
          AI agents propose. A deterministic evaluator authorises every action against
          your policies, with the exact sentence cited. Autonomy expands only as it is
          earned, and shrinks the moment it is abused.
        </p>
        <div className="hero-ctas rise rise-4">
          <Link href="/mission" className="btn btn-primary">
            Open Mission Control
          </Link>
          <Link href="/recorder" className="btn btn-quiet">
            Inspect the audit trail
          </Link>
        </div>
        <AuthorityLoop />
        <div className="loop-strip rise rise-5">
          <span className="ls-node ai">GRANITE PROPOSES</span>
          <span className="ls-arrow">→</span>
          <span className="ls-node">EVALUATOR AUTHORISES</span>
          <span className="ls-arrow">→</span>
          <span className="ls-node ai">GRANITE EXPLAINS</span>
          <span className="ls-arrow">→</span>
          <span className="ls-node">LEDGER REMEMBERS</span>
        </div>
      </section>

      <section className="page" style={{ paddingTop: 0 }}>
        <div className="home-grid">
          {SCREENS.map((s) => (
            <Link key={s.href} href={s.href} className="card home-card">
              <p className="hc-eyebrow">{s.eyebrow}</p>
              <h3>{s.title}</h3>
              <p>{s.blurb}</p>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
