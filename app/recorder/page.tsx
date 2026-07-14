'use client';

import { useState, useEffect } from 'react';

interface DecisionRecord {
  missionId: string;
  missionGoal: string;
  stepNumber: number;
  agentRole: string;
  actionType: string;
  actionPayload: Record<string, unknown>;
  verdict: 'ALLOW' | 'REVIEW' | 'APPROVAL' | 'BLOCK';
  ruleId: number | null;
  explanation: string;
  sourcePassage: string | null;
  riskClass: string;
  agentBandBefore: string;
  agentBandAfter: string;
  reputationBefore: number;
  reputationAfter: number;
  timestamp: string;
}

const VERDICT_COLORS = {
  ALLOW: { bg: '#d1fae5', border: '#10b981', text: '#065f46' },
  REVIEW: { bg: '#fef3c7', border: '#f59e0b', text: '#92400e' },
  APPROVAL: { bg: '#dbeafe', border: '#3b82f6', text: '#1e40af' },
  BLOCK: { bg: '#fee2e2', border: '#ef4444', text: '#991b1b' },
};

export default function FlightRecorder() {
  const [decisions, setDecisions] = useState<DecisionRecord[]>([]);
  const [selected, setSelected] = useState<DecisionRecord | null>(null);
  const [source, setSource] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDecisions = async () => {
      try {
        const res = await fetch('/api/decisions');
        const data = await res.json();
        setDecisions(data.decisions ?? []);
        setSource(data.source ?? '');
      } catch (error) {
        console.error('Error fetching decisions:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchDecisions();
    const interval = setInterval(fetchDecisions, 2000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div style={{ padding: '2rem', maxWidth: '1400px', margin: '0 auto' }}>
        <h1 style={{ marginBottom: '2rem' }}>Flight Recorder</h1>
        <p>Loading decision history…</p>
      </div>
    );
  }

  return (
    <div style={{ padding: '2rem', maxWidth: '1400px', margin: '0 auto' }}>
      <h1 style={{ marginBottom: '1rem' }}>Flight Recorder</h1>
      <p style={{ color: '#666', marginBottom: '1rem', fontSize: '0.95rem' }}>
        Every decision ever made, in order. Click any row to replay it: the agent, what it
        proposed, the verdict, the rule that fired, and the exact policy sentence behind it.
      </p>

      <div
        style={{
          display: 'flex',
          gap: '1rem',
          alignItems: 'center',
          marginBottom: '2rem',
          fontSize: '0.8rem',
          color: '#666',
        }}
      >
        <span>
          <strong>{decisions.length}</strong> decisions recorded
        </span>
        {source && (
          <span
            style={{
              padding: '0.2rem 0.6rem',
              borderRadius: '10px',
              fontSize: '0.7rem',
              fontWeight: 'bold',
              backgroundColor: source === 'database' ? '#d1fae5' : '#fef3c7',
              color: source === 'database' ? '#065f46' : '#92400e',
            }}
            title={
              source === 'database'
                ? 'Replaying from PostgreSQL'
                : 'PostgreSQL is not running — replaying this session from memory'
            }
          >
            {source === 'database' ? 'postgres' : 'in-memory (postgres down)'}
          </span>
        )}
      </div>

      {decisions.length === 0 && (
        <div
          style={{
            textAlign: 'center',
            padding: '3rem',
            backgroundColor: '#f9f9f9',
            borderRadius: '8px',
            color: '#666',
          }}
        >
          <p style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>📼 No decisions recorded yet</p>
          <p style={{ fontSize: '0.875rem' }}>
            Run a mission from Mission Control and every decision will land here.
          </p>
        </div>
      )}

      {decisions.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              backgroundColor: 'white',
              border: '1px solid #ddd',
            }}
          >
            <thead>
              <tr style={{ backgroundColor: '#f9f9f9', borderBottom: '2px solid #ddd' }}>
                {['Time', 'Step', 'Agent', 'Action', 'Verdict', 'Rule', 'Cited policy'].map((h) => (
                  <th
                    key={h}
                    style={{
                      padding: '0.9rem 1rem',
                      textAlign: 'left',
                      fontSize: '0.75rem',
                      fontWeight: 'bold',
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                      color: '#666',
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {decisions.map((d, idx) => (
                <DecisionRow
                  key={`${d.missionId}-${d.stepNumber}-${idx}`}
                  decision={d}
                  isEven={idx % 2 === 0}
                  onClick={() => setSelected(d)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected && <DecisionReplay decision={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function DecisionRow({
  decision,
  isEven,
  onClick,
}: {
  decision: DecisionRecord;
  isEven: boolean;
  onClick: () => void;
}) {
  const colors = VERDICT_COLORS[decision.verdict];
  const bandChanged = decision.agentBandBefore !== decision.agentBandAfter;

  return (
    <tr
      onClick={onClick}
      style={{
        backgroundColor: isEven ? 'white' : '#fcfcfc',
        cursor: 'pointer',
        borderBottom: '1px solid #eee',
      }}
    >
      <td style={{ padding: '0.9rem 1rem', fontSize: '0.8rem', color: '#666' }}>
        {new Date(decision.timestamp).toLocaleTimeString()}
      </td>
      <td style={{ padding: '0.9rem 1rem', fontSize: '0.8rem', color: '#666' }}>
        {decision.stepNumber}
      </td>
      <td style={{ padding: '0.9rem 1rem', fontSize: '0.85rem', fontWeight: 600 }}>
        {decision.agentRole}
        {bandChanged && (
          <div style={{ fontSize: '0.7rem', color: '#92400e', fontWeight: 'normal' }}>
            {decision.agentBandBefore} → {decision.agentBandAfter}
          </div>
        )}
      </td>
      <td style={{ padding: '0.9rem 1rem', fontSize: '0.85rem' }}>
        {decision.actionType.replace(/_/g, ' ')}
      </td>
      <td style={{ padding: '0.9rem 1rem' }}>
        <span
          style={{
            padding: '0.25rem 0.7rem',
            borderRadius: '12px',
            fontSize: '0.7rem',
            fontWeight: 'bold',
            backgroundColor: colors.bg,
            color: colors.text,
          }}
        >
          {decision.verdict}
        </span>
      </td>
      <td
        style={{
          padding: '0.9rem 1rem',
          fontSize: '0.75rem',
          color: '#666',
          fontFamily: 'monospace',
        }}
      >
        {decision.ruleId !== null ? `#${decision.ruleId}` : '—'}
      </td>
      <td
        style={{
          padding: '0.9rem 1rem',
          fontSize: '0.8rem',
          color: '#666',
          maxWidth: '340px',
        }}
      >
        <span
          style={{
            display: 'block',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {decision.sourcePassage ?? <em style={{ color: '#bbb' }}>no rule cited</em>}
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
  const colors = VERDICT_COLORS[decision.verdict];
  const bandChanged = decision.agentBandBefore !== decision.agentBandAfter;
  const demoted = bandChanged && decision.verdict === 'BLOCK';

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '2rem',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: 'white',
          borderRadius: '12px',
          maxWidth: '900px',
          width: '100%',
          maxHeight: '90vh',
          overflow: 'auto',
        }}
      >
        <div
          style={{
            padding: '1.5rem',
            borderBottom: '2px solid #eee',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            position: 'sticky',
            top: 0,
            backgroundColor: 'white',
          }}
        >
          <h2 style={{ fontSize: '1.4rem', fontWeight: 'bold' }}>Decision Replay</h2>
          <button
            onClick={onClose}
            style={{
              padding: '0.5rem 1rem',
              backgroundColor: '#f3f4f6',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: 'bold',
              fontSize: '0.85rem',
            }}
          >
            ✕ Close
          </button>
        </div>

        <div style={{ padding: '1.5rem' }}>
          <div style={{ marginBottom: '1.5rem' }}>
            <div style={{ fontSize: '0.75rem', color: '#666', marginBottom: '0.25rem' }}>
              MISSION
            </div>
            <div style={{ fontWeight: 'bold' }}>{decision.missionGoal}</div>
            <div style={{ fontSize: '0.8rem', color: '#666', marginTop: '0.25rem' }}>
              Step {decision.stepNumber} · {new Date(decision.timestamp).toLocaleString()}
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              gap: '1rem',
              marginBottom: '1.5rem',
              padding: '1rem',
              backgroundColor: '#f9f9f9',
              borderRadius: '8px',
            }}
          >
            <Field label="AGENT" value={decision.agentRole} />
            <Field label="RISK" value={decision.riskClass} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '0.7rem', color: '#666', marginBottom: '0.35rem' }}>
                VERDICT
              </div>
              <span
                style={{
                  padding: '0.4rem 0.9rem',
                  borderRadius: '12px',
                  fontSize: '0.85rem',
                  fontWeight: 'bold',
                  backgroundColor: colors.bg,
                  color: colors.text,
                  border: `2px solid ${colors.border}`,
                }}
              >
                {decision.verdict}
              </span>
            </div>
          </div>

          {bandChanged && (
            <div
              style={{
                padding: '1rem',
                backgroundColor: demoted ? '#fee2e2' : '#d1fae5',
                border: `2px solid ${demoted ? '#ef4444' : '#10b981'}`,
                borderRadius: '8px',
                marginBottom: '1.5rem',
              }}
            >
              <div
                style={{
                  fontSize: '0.8rem',
                  fontWeight: 'bold',
                  color: demoted ? '#991b1b' : '#065f46',
                  marginBottom: '0.4rem',
                }}
              >
                {demoted ? '⬇️ DEMOTED' : '⬆️ PROMOTED'}
              </div>
              <div style={{ color: demoted ? '#991b1b' : '#065f46' }}>
                {decision.agentBandBefore} → {decision.agentBandAfter}
                {demoted && ' · reputation reset to 0'}
              </div>
            </div>
          )}

          <Section title="Proposed action">
            <div style={{ fontWeight: 'bold', marginBottom: '0.5rem', fontSize: '0.9rem' }}>
              {decision.actionType.replace(/_/g, ' ').toUpperCase()}
            </div>
            <pre
              style={{
                fontSize: '0.75rem',
                color: '#666',
                margin: 0,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                fontFamily: 'monospace',
              }}
            >
              {JSON.stringify(decision.actionPayload, null, 2)}
            </pre>
          </Section>

          <div style={{ marginBottom: '1.5rem' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 'bold', marginBottom: '0.6rem' }}>
              Why
            </h3>
            <div
              style={{
                padding: '1rem',
                backgroundColor: colors.bg,
                borderLeft: `4px solid ${colors.border}`,
                borderRadius: '4px',
                color: colors.text,
                lineHeight: 1.6,
              }}
            >
              {decision.explanation}
            </div>
          </div>

          {decision.sourcePassage && (
            <div style={{ marginBottom: '1.5rem' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 'bold', marginBottom: '0.6rem' }}>
                Cited policy{' '}
                {decision.ruleId !== null && (
                  <span
                    style={{
                      fontSize: '0.75rem',
                      color: '#9ca3af',
                      fontFamily: 'monospace',
                      fontWeight: 'normal',
                    }}
                  >
                    rule #{decision.ruleId}
                  </span>
                )}
              </h3>
              <div
                style={{
                  padding: '1rem',
                  backgroundColor: '#fffbeb',
                  borderLeft: '4px solid #f59e0b',
                  borderRadius: '4px',
                  color: '#92400e',
                  fontStyle: 'italic',
                  lineHeight: 1.6,
                }}
              >
                “{decision.sourcePassage}”
              </div>
            </div>
          )}

          <Section title="Agent standing">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <StateBox
                label="BEFORE"
                band={decision.agentBandBefore}
                reputation={decision.reputationBefore}
              />
              <StateBox
                label="AFTER"
                band={decision.agentBandAfter}
                reputation={decision.reputationAfter}
              />
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: '0.7rem', color: '#666', marginBottom: '0.35rem' }}>{label}</div>
      <div style={{ fontSize: '1rem', fontWeight: 'bold' }}>{value}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '1.5rem' }}>
      <h3 style={{ fontSize: '1rem', fontWeight: 'bold', marginBottom: '0.6rem' }}>{title}</h3>
      <div
        style={{
          padding: '1rem',
          backgroundColor: '#f9f9f9',
          borderRadius: '8px',
          border: '1px solid #eee',
        }}
      >
        {children}
      </div>
    </div>
  );
}

function StateBox({
  label,
  band,
  reputation,
}: {
  label: string;
  band: string;
  reputation: number;
}) {
  return (
    <div
      style={{
        padding: '1rem',
        backgroundColor: 'white',
        borderRadius: '6px',
        border: '1px solid #eee',
      }}
    >
      <div style={{ fontSize: '0.7rem', color: '#666', marginBottom: '0.5rem' }}>{label}</div>
      <div style={{ fontSize: '0.85rem', lineHeight: 1.8 }}>
        <div>
          <strong>Band:</strong> {band}
        </div>
        <div>
          <strong>Reputation:</strong> {reputation}
        </div>
      </div>
    </div>
  );
}
