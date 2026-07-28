'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { ToastStack, type ToastItem } from './Toast';

/**
 * Global notifications, polled from the same APIs the screens use:
 * - a new pending approval pops a clickable toast that opens the inbox
 * - a paused mission resuming (or completing) announces itself
 *
 * First poll is a silent baseline so a page load never replays history.
 */

function sentenceCase(actionType: string): string {
  const words = actionType.replace(/_/g, ' ').toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

interface PendingApprovalWire {
  id: string;
  stepNumber: number;
  proposal: { actionType: string; payload: { vendor?: string; amount?: number } };
}

interface MissionWire {
  id: string;
  status: string;
  currentStep: number;
}

export default function NotificationCenter() {
  const pathname = usePathname();
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const seenApprovals = useRef<Set<string> | null>(null);
  const missionStatuses = useRef<Map<string, string> | null>(null);
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;

  useEffect(() => {
    let cancelled = false;

    const push = (toast: Omit<ToastItem, 'id'>) => {
      setToasts((t) => [...t, { ...toast, id: nextId.current++ }]);
    };

    const poll = async () => {
      try {
        const [approvalsRes, missionsRes] = await Promise.all([
          fetch('/api/approvals'),
          fetch('/api/missions'),
        ]);
        if (cancelled) return;

        const approvals: PendingApprovalWire[] = (await approvalsRes.json()).approvals ?? [];
        const missions: MissionWire[] = (await missionsRes.json()).missions ?? [];

        if (seenApprovals.current === null) {
          // Baseline: never notify for what was already pending on page load.
          seenApprovals.current = new Set(approvals.map((a) => a.id));
        } else {
          for (const a of approvals) {
            if (seenApprovals.current.has(a.id)) continue;
            seenApprovals.current.add(a.id);
            // The inbox page already shows the item in front of the user.
            if (pathnameRef.current !== '/approvals') {
              const amount = a.proposal.payload.amount;
              const facts = [
                sentenceCase(a.proposal.actionType),
                a.proposal.payload.vendor,
                typeof amount === 'number' ? `GBP ${amount.toLocaleString('en-GB')}` : undefined,
              ]
                .filter(Boolean)
                .join(' · ');
              push({
                kicker: 'APPROVAL NEEDED',
                message: `${facts} — open inbox`,
                href: '/approvals',
              });
            }
          }
        }

        if (missionStatuses.current === null) {
          missionStatuses.current = new Map(missions.map((m) => [m.id, m.status]));
        } else {
          for (const m of missions) {
            const prev = missionStatuses.current.get(m.id);
            missionStatuses.current.set(m.id, m.status);
            if (prev === 'paused' && m.status === 'running') {
              push({ kicker: 'MISSION RESUMED', message: `Step ${m.currentStep} continuing` });
            }
            if (prev && prev !== 'completed' && m.status === 'completed') {
              push({ kicker: 'MISSION COMPLETED', message: 'Full audit trail in the Flight Recorder' });
            }
            if (prev && prev !== 'failed' && m.status === 'failed') {
              push({
                kicker: 'MISSION FAILED',
                message: 'Likely the shared free-tier Granite pool is full — try again in a minute',
              });
            }
          }
        }
      } catch {
        // Polling is best-effort; the screens surface their own errors.
      }
    };

    poll();
    const interval = setInterval(poll, 2000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return (
    <ToastStack toasts={toasts} onDismiss={(id) => setToasts((t) => t.filter((x) => x.id !== id))} />
  );
}
