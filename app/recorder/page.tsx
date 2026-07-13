'use client';

import { useState, useEffect } from 'react';
import type { MissionStep } from '@/src/orchestrator/types';

interface DecisionRecord extends MissionStep {
  missionId: string;
  missionGoal: string;
}

export default function FlightRecorder() {
  const [decisions, setDecisions] = useState<DecisionRecord[]>([]);
  const [selectedDecision, setSelectedDecision] = useState<DecisionRecord | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Mock data for now - will be replaced with API call when persistence is added
    const mockDecisions: DecisionRecord[] = [];
    
    setDecisions(mockDecisions);
    setLoading(false);
  }, []);

  if (loading) {
    return (
      <div style={{ padding: '2rem', maxWidth: '1400px', margin: '0 auto' }}>
        <h1 style={{ marginBottom: '2rem' }}>Flight Recorder</h1>
        <p>Loading decision history...</p>
      </div>
    );
  }

  return (
    <div style={{ padding: '2rem', maxWidth: '1400px', margin: '0 auto' }}>
      <h1 style={{ marginBottom: '1rem' }}>Flight Recorder</h1>
      <p style={{ color: '#666', marginBottom: '2rem', fontSize: '0.95rem' }}>
        Complete history of all decisions across missions. Click any row to view full replay details.
      </p>

      {decisions.length === 0 && (
        <div style={{
          textAlign: 'center',
          padding: '3rem',
          backgroundColor: '#f9f9f9',
          borderRadius: '8px',
          color: '#666',
        }}>
          <p style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>📼 No decisions recorded yet</p>
          <p style={{ fontSize: '0.875rem' }}>Run a mission from Mission Control to see decisions appear here.</p>
        </div>
      )}

      {decisions.length > 0 && !selectedDecision && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{
            width: '100%',
            borderCollapse: 'collapse',
            backgroundColor: 'white',
            border: '1px solid #ddd',
            borderRadius: '8px',
          }}>
            <thead>
              <tr style={{ backgroundColor: '#f9f9f9', borderBottom: '2px solid #ddd' }}>
                <th style={{ padding: '1rem', textAlign: 'left', fontSize: '0.875rem', fontWeight: 'bold' }}>Time</th>
                <th style={{ padding: '1rem', textAlign: 'left', fontSize: '0.875rem', fontWeight: 'bold' }}>Agent</th>
                <th style={{ padding: '1rem', textAlign: 'left', fontSize: '0.875rem', fontWeight: 'bold' }}>Action</th>
                <th style={{ padding: '1rem', textAlign: 'left', fontSize: '0.875rem', fontWeight: 'bold' }}>Verdict</th>
                <th style={{ padding: '1rem', textAlign: 'left', fontSize: '0.875rem', fontWeight: 'bold' }}>Rule</th>
                <th style={{ padding: '1rem', textAlign: 'left', fontSize: '0.875rem', fontWeight: 'bold' }}>Mission</th>
              </tr>
            </thead>
            <tbody>
              {decisions.map((decision, idx) => (
                <DecisionRow
                  key={`${decision.missionId}-${decision.stepNumber}`}
                  decision={decision}
                  onClick={() => setSelectedDecision(decision)}
                  isEven={idx % 2 === 0}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selectedDecision && (
        <DecisionReplay
          decision={selectedDecision}
          onClose={() => setSelectedDecision(null)}
        />
      )}
    </div>
  );
}

function DecisionRow({
  decision,
  onClick,
  isEven,
}: {
  decision: DecisionRecord;
  onClick: () => void;
  isEven: boolean;
}) {
  const verdictColors = {
    ALLOW: { bg: '#d1fae5', text: '#065f46' },
    REVIEW: { bg: '#fef3c7', text: '#92400e' },
    APPROVAL: { bg: '#dbeafe', text: '#1e40af' },
    BLOCK: { bg: '#fee2e2', text: '#991b1b' },
  };

  const colors = verdictColors[decision.decision.verdict];

  return (
    <tr
      onClick={onClick}
      style={{
        backgroundColor: isEven ? 'white' : '#f9f9f9',
        cursor: 'pointer',
        borderBottom: '1px solid #e5e5e5',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = '#f0f0f0';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = isEven ? 'white' : '#f9f9f9';
      }}
    >
      <td style={{ padding: '1rem', fontSize: '0.875rem', color: '#666' }}>
        {new Date(decision.timestamp).toLocaleString()}
      </td>
      <td style={{ padding: '1rem', fontSize: '0.875rem' }}>
        <span style={{ fontWeight: 'bold' }}>{decision.agentRole}</span>
      </td>
      <td style={{ padding: '1rem', fontSize: '0.875rem' }}>
        {decision.proposal.actionType.replace(/_/g, ' ')}
      </td>
      <td style={{ padding: '1rem' }}>
        <span style={{
          padding: '0.25rem 0.75rem',
          borderRadius: '12px',
          fontSize: '0.75rem',
          fontWeight: 'bold',
          backgroundColor: colors.bg,
          color: colors.text,
        }}>
          {decision.decision.verdict}
        </span>
      </td>
      <td style={{ padding: '1rem', fontSize: '0.875rem', color: '#666', maxWidth: '300px' }}>
        {decision.decision.sourcePassage ? (
          <span style={{ 
            display: 'block',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {decision.decision.sourcePassage}
          </span>
        ) : (
          <span style={{ fontStyle: 'italic' }}>No rule cited</span>
        )}
      </td>
      <td style={{ padding: '1rem', fontSize: '0.875rem', color: '#666', maxWidth: '200px' }}>
        <span style={{ 
          display: 'block',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {decision.missionGoal}
        </span>
      </td>
    </tr>
  );
}

function DecisionReplay({
  decision,
  onClose,
}: {
  decision: DecisionRecord;
  onClose: () => void;
}) {
  const verdictColors = {
    ALLOW: { bg: '#d1fae5', border: '#10b981', text: '#065f46' },
    REVIEW: { bg: '#fef3c7', border: '#f59e0b', text: '#92400e' },
    APPROVAL: { bg: '#dbeafe', border: '#3b82f6', text: '#1e40af' },
    BLOCK: { bg: '#fee2e2', border: '#ef4444', text: '#991b1b' },
  };

  const colors = verdictColors[decision.decision.verdict];
  const bandChanged = decision.agentStateBefore.autonomyBand !== decision.agentStateAfter.autonomyBand;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: '2rem',
    }}>
      <div style={{
        backgroundColor: 'white',
        borderRadius: '12px',
        maxWidth: '900px',
        width: '100%',
        maxHeight: '90vh',
        overflow: 'auto',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
      }}>
        {/* Header */}
        <div style={{
          padding: '1.5rem',
          borderBottom: '2px solid #e5e5e5',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          position: 'sticky',
          top: 0,
          backgroundColor: 'white',
          zIndex: 1,
        }}>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>Decision Replay</h2>
          <button
            onClick={onClose}
            style={{
              padding: '0.5rem 1rem',
              backgroundColor: '#f3f4f6',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: 'bold',
              fontSize: '0.875rem',
            }}
          >
            ✕ Close
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: '1.5rem' }}>
          {/* Mission Context */}
          <div style={{ marginBottom: '1.5rem' }}>
            <div style={{ fontSize: '0.875rem', color: '#666', marginBottom: '0.5rem' }}>
              Mission Goal
            </div>
            <div style={{ fontSize: '1rem', fontWeight: 'bold' }}>
              {decision.missionGoal}
            </div>
            <div style={{ fontSize: '0.875rem', color: '#666', marginTop: '0.25rem' }}>
              Step {decision.stepNumber} • {new Date(decision.timestamp).toLocaleString()}
            </div>
          </div>

          {/* Agent & Verdict */}
          <div style={{
            display: 'flex',
            gap: '1rem',
            marginBottom: '1.5rem',
            padding: '1rem',
            backgroundColor: '#f9f9f9',
            borderRadius: '8px',
          }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '0.75rem', color: '#666', marginBottom: '0.25rem' }}>AGENT</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 'bold' }}>{decision.agentRole}</div>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '0.75rem', color: '#666', marginBottom: '0.25rem' }}>VERDICT</div>
              <span style={{
                padding: '0.5rem 1rem',
                borderRadius: '12px',
                fontSize: '0.875rem',
                fontWeight: 'bold',
                backgroundColor: colors.bg,
                color: colors.text,
                border: `2px solid ${colors.border}`,
                display: 'inline-block',
              }}>
                {decision.decision.verdict}
              </span>
            </div>
          </div>

          {/* Band Transition */}
          {bandChanged && (
            <div style={{
              padding: '1rem',
              backgroundColor: '#fef3c7',
              border: '2px solid #f59e0b',
              borderRadius: '8px',
              marginBottom: '1.5rem',
            }}>
              <div style={{ fontSize: '0.875rem', fontWeight: 'bold', color: '#92400e', marginBottom: '0.5rem' }}>
                🔄 AUTONOMY BAND TRANSITION
              </div>
              <div style={{ fontSize: '1rem', color: '#92400e' }}>
                {decision.agentStateBefore.autonomyBand} → {decision.agentStateAfter.autonomyBand}
              </div>
            </div>
          )}

          {/* Proposed Action */}
          <div style={{ marginBottom: '1.5rem' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 'bold', marginBottom: '0.75rem' }}>
              Proposed Action
            </h3>
            <div style={{
              padding: '1rem',
              backgroundColor: '#f9f9f9',
              borderRadius: '8px',
              border: '1px solid #e5e5e5',
            }}>
              <div style={{ fontSize: '0.875rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>
                {decision.proposal.actionType.replace(/_/g, ' ').toUpperCase()}
              </div>
              <pre style={{
                fontSize: '0.75rem',
                color: '#666',
                margin: 0,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                fontFamily: 'monospace',
              }}>
                {JSON.stringify(decision.proposal.payload, null, 2)}
              </pre>
            </div>
          </div>

          {/* Explanation */}
          <div style={{ marginBottom: '1.5rem' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 'bold', marginBottom: '0.75rem' }}>
              Decision Explanation
            </h3>
            <div style={{
              padding: '1rem',
              backgroundColor: colors.bg,
              borderLeft: `4px solid ${colors.border}`,
              borderRadius: '4px',
            }}>
              <p style={{ margin: 0, color: colors.text, lineHeight: '1.6' }}>
                {decision.decision.explanation}
              </p>
            </div>
          </div>

          {/* Policy Citation */}
          {decision.decision.sourcePassage && (
            <div style={{ marginBottom: '1.5rem' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 'bold', marginBottom: '0.75rem' }}>
                Policy Citation
              </h3>
              <div style={{
                padding: '1rem',
                backgroundColor: '#fffbeb',
                borderLeft: '4px solid #f59e0b',
                borderRadius: '4px',
                fontStyle: 'italic',
              }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#92400e', marginBottom: '0.5rem' }}>
                  📋 CITED POLICY
                </div>
                <p style={{ margin: 0, color: '#92400e', lineHeight: '1.6' }}>
                  {decision.decision.sourcePassage}
                </p>
              </div>
            </div>
          )}

          {/* Agent State */}
          <div>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 'bold', marginBottom: '0.75rem' }}>
              Agent State
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div style={{
                padding: '1rem',
                backgroundColor: '#f9f9f9',
                borderRadius: '8px',
                border: '1px solid #e5e5e5',
              }}>
                <div style={{ fontSize: '0.75rem', color: '#666', marginBottom: '0.5rem' }}>BEFORE</div>
                <div style={{ fontSize: '0.875rem' }}>
                  <div><strong>Band:</strong> {decision.agentStateBefore.autonomyBand}</div>
                  <div><strong>Clean Actions:</strong> {decision.agentStateBefore.cleanActionCount}</div>
                  <div><strong>Approved Spends:</strong> {decision.agentStateBefore.approvedSpendCount}</div>
                </div>
              </div>
              <div style={{
                padding: '1rem',
                backgroundColor: '#f9f9f9',
                borderRadius: '8px',
                border: '1px solid #e5e5e5',
              }}>
                <div style={{ fontSize: '0.75rem', color: '#666', marginBottom: '0.5rem' }}>AFTER</div>
                <div style={{ fontSize: '0.875rem' }}>
                  <div><strong>Band:</strong> {decision.agentStateAfter.autonomyBand}</div>
                  <div><strong>Clean Actions:</strong> {decision.agentStateAfter.cleanActionCount}</div>
                  <div><strong>Approved Spends:</strong> {decision.agentStateAfter.approvedSpendCount}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
