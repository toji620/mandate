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
    <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
      <h1 style={{ marginBottom: '2rem' }}>Approval Inbox</h1>

      {approvals.length === 0 && (
        <div style={{
          textAlign: 'center',
          padding: '3rem',
          backgroundColor: '#f9f9f9',
          borderRadius: '8px',
          color: '#666',
        }}>
          <p style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>✅ No pending approvals</p>
          <p style={{ fontSize: '0.875rem' }}>All actions are either approved or within agent autonomy limits.</p>
        </div>
      )}

      {approvals.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {approvals.map((approval) => (
            <ApprovalCard
              key={approval.id}
              approval={approval}
              onApprove={() => handleApproval(approval.id, 'approve')}
              onReject={() => handleApproval(approval.id, 'reject')}
              isProcessing={processing === approval.id}
            />
          ))}
        </div>
      )}
    </div>
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
  const verdictColors = {
    REVIEW: { bg: '#fef3c7', border: '#f59e0b', text: '#92400e' },
    APPROVAL: { bg: '#dbeafe', border: '#3b82f6', text: '#1e40af' },
  };

  const verdict = approval.decision.verdict as 'REVIEW' | 'APPROVAL';
  const colors = verdictColors[verdict];

  return (
    <div style={{
      border: `2px solid ${colors.border}`,
      borderRadius: '8px',
      padding: '1.5rem',
      backgroundColor: 'white',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '1rem' }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
            <span style={{
              padding: '0.25rem 0.75rem',
              borderRadius: '12px',
              fontSize: '0.875rem',
              fontWeight: 'bold',
              backgroundColor: colors.bg,
              color: colors.text,
              border: `1px solid ${colors.border}`,
            }}>
              {verdict}
            </span>
            <span style={{ fontSize: '0.875rem', color: '#666' }}>
              Step {approval.stepNumber} • {approval.agentName}
            </span>
          </div>
          <h3 style={{ fontSize: '1.2rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>
            {approval.proposal.actionType.replace(/_/g, ' ').toUpperCase()}
          </h3>
        </div>
      </div>

      {/* Proposal Details */}
      <div style={{
        padding: '1rem',
        backgroundColor: '#f9f9f9',
        borderRadius: '4px',
        marginBottom: '1rem',
      }}>
        <div style={{ fontSize: '0.875rem', fontWeight: 'bold', marginBottom: '0.5rem', color: '#444' }}>
          Proposed Action Details:
        </div>
        <pre style={{
          fontSize: '0.75rem',
          color: '#666',
          margin: 0,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}>
          {JSON.stringify(approval.proposal.payload, null, 2)}
        </pre>
      </div>

      {/* Decision Explanation */}
      <div style={{
        fontSize: '0.875rem',
        color: '#444',
        marginBottom: '1rem',
        padding: '0.75rem',
        backgroundColor: '#f0f0f0',
        borderRadius: '4px',
      }}>
        <strong>Why this requires approval:</strong>
        <div style={{ marginTop: '0.5rem' }}>
          {approval.decision.explanation}
        </div>
      </div>

      {/* Policy Citation */}
      {approval.decision.sourcePassage && (
        <div style={{
          fontSize: '0.75rem',
          color: '#666',
          fontStyle: 'italic',
          padding: '0.75rem',
          backgroundColor: '#fffbeb',
          borderLeft: '3px solid #f59e0b',
          marginBottom: '1rem',
        }}>
          <strong>📋 Policy Citation:</strong>
          <div style={{ marginTop: '0.25rem' }}>
            {approval.decision.sourcePassage}
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
        <button
          onClick={onReject}
          disabled={isProcessing}
          style={{
            padding: '0.75rem 1.5rem',
            backgroundColor: isProcessing ? '#ccc' : 'white',
            color: isProcessing ? '#666' : '#ef4444',
            border: `2px solid ${isProcessing ? '#ccc' : '#ef4444'}`,
            borderRadius: '4px',
            cursor: isProcessing ? 'not-allowed' : 'pointer',
            fontWeight: 'bold',
            fontSize: '0.875rem',
          }}
        >
          {isProcessing ? 'Processing...' : '✕ Reject'}
        </button>
        <button
          onClick={onApprove}
          disabled={isProcessing}
          style={{
            padding: '0.75rem 1.5rem',
            backgroundColor: isProcessing ? '#ccc' : '#10b981',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: isProcessing ? 'not-allowed' : 'pointer',
            fontWeight: 'bold',
            fontSize: '0.875rem',
          }}
        >
          {isProcessing ? 'Processing...' : '✓ Approve'}
        </button>
      </div>

      {/* Timestamp */}
      <div style={{
        marginTop: '1rem',
        paddingTop: '1rem',
        borderTop: '1px solid #e5e5e5',
        fontSize: '0.75rem',
        color: '#999',
      }}>
        Requested: {new Date(approval.createdAt).toLocaleString()}
      </div>
    </div>
  );
}
