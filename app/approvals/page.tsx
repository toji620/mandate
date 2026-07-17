'use client';

import { useState, useEffect } from 'react';
import type { PendingApproval } from '@/src/orchestrator/types';

export default function ApprovalInbox() {
  const [approvals, setApprovals] = useState<PendingApproval[]>([]);
  const [processing, setProcessing] = useState<string | null>(null);

  // Poll for pending approvals
  useEffect(() => {
    const fetchApprovals = async () => {
      try {
        const response = await fetch('/api/approvals');
        const data = await response.json();
        setApprovals(data.approvals || []);
      } catch (error) {
        console.error('Error fetching approvals:', error);
      }
    };

    fetchApprovals();
    const interval = setInterval(fetchApprovals, 1000); // Poll every second

    return () => clearInterval(interval);
  }, []);

  const handleApproval = async (approvalId: string, action: 'approve' | 'reject') => {
    setProcessing(approvalId);
    try {
      const response = await fetch(`/api/approvals/${approvalId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          approvedBy: 'Demo User', // In real app, would be from auth
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to process approval');
      }

      // Remove from local state immediately for better UX
      setApprovals(prev => prev.filter(a => a.id !== approvalId));
    } catch (error) {
      console.error('Error processing approval:', error);
      alert(`Failed to ${action} action`);
    } finally {
      setProcessing(null);
    }
  };

  return (
    <main className="page">
      <p className="page-eyebrow">Human authority</p>
      <h1 className="page-title">Approval Inbox</h1>
      <p className="page-sub">
        Proposals the evaluator would not clear on its own. Each one waits here
        until a human approves or rejects it.
      </p>

      {approvals.length === 0 && (
        <div className="card">
          <div className="empty-state">
            <p className="empty-title">Nothing waiting on you</p>
            <p>Approvals appear here when an agent&apos;s proposal needs human sign-off.</p>
          </div>
        </div>
      )}

      {approvals.length > 0 && (
        <>
          <p className="section-label">
            Pending · {approvals.length}
          </p>
          {approvals.map((approval) => (
            <ApprovalCard
              key={approval.id}
              approval={approval}
              onApprove={() => handleApproval(approval.id, 'approve')}
              onReject={() => handleApproval(approval.id, 'reject')}
              isProcessing={processing === approval.id}
            />
          ))}
        </>
      )}
    </main>
  );
}

/** "ISSUE_PURCHASE_ORDER" -> "Issue purchase order" */
function toSentenceCase(actionType: string): string {
  const words = actionType.replace(/_/g, ' ').trim().toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function formatAmount(value: number, currency?: string): string {
  return `${currency || 'GBP'} ${value.toLocaleString('en-GB')}`;
}

/**
 * Render the payload as a compact line of facts rather than a JSON dump.
 * Amounts get the mono .amount treatment; the currency key is folded into
 * the amount instead of shown on its own.
 */
function PayloadFacts({ payload }: { payload: Record<string, unknown> }) {
  const currency = typeof payload.currency === 'string' ? payload.currency : undefined;
  const entries = Object.entries(payload).filter(
    ([key, value]) =>
      key !== 'currency' &&
      (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')
  );

  if (entries.length === 0) return null;

  return (
    <p className="mono muted">
      {entries.map(([key, value], index) => {
        const isAmount =
          typeof value === 'number' && /amount|price|cost|total|spend/i.test(key);
        return (
          <span key={key}>
            {index > 0 && <span className="faint">{' · '}</span>}
            <span className="faint">{key} </span>
            {isAmount ? (
              <span className="amount">{formatAmount(value as number, currency)}</span>
            ) : (
              String(value)
            )}
          </span>
        );
      })}
    </p>
  );
}

function ApprovalCard({
  approval,
  onApprove,
  onReject,
  isProcessing,
}: {
  approval: PendingApproval;
  onApprove: () => void;
  onReject: () => void;
  isProcessing: boolean;
}) {
  const verdict = approval.decision.verdict as 'REVIEW' | 'APPROVAL';
  const chipClass = verdict === 'APPROVAL' ? 'chip chip-approval' : 'chip chip-review';

  return (
    <>
      <div className="card card-pad">
        <p className="mono faint">
          <span className={chipClass}>{verdict}</span>{' '}
          {approval.agentName} · step {approval.stepNumber}
        </p>

        <h3>{toSentenceCase(approval.proposal.actionType)}</h3>

        <PayloadFacts payload={approval.proposal.payload} />

        <p className="muted">{approval.decision.explanation}</p>

        {approval.decision.sourcePassage && (
          <blockquote className="citation">
            {approval.decision.sourcePassage}
            {approval.decision.ruleId !== undefined && (
              <span className="citation-ref">Rule {approval.decision.ruleId}</span>
            )}
          </blockquote>
        )}

        <p>
          <button className="btn btn-approve" onClick={onApprove} disabled={isProcessing}>
            Approve
          </button>{' '}
          <button className="btn btn-reject" onClick={onReject} disabled={isProcessing}>
            Reject
          </button>
        </p>
      </div>

      <p className="mono faint">
        requested {new Date(approval.createdAt).toLocaleString('en-GB')}
      </p>
    </>
  );
}
