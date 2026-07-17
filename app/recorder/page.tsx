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
  graniteExplanation: string | null;
  explanationSource: string | null;
  sourcePassage: string | null;
  riskClass: string;
  agentBandBefore: string;
  agentBandAfter: string;
  reputationBefore: number;
  reputationAfter: number;
  timestamp: string;
}

/** "wire_transfer" -> "Wire transfer" */
function sentenceCase(actionType: string): string {
  const words = actionType.replace(/_/g, ' ').toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

function chipClass(verdict: DecisionRecord['verdict']): string {
  return `chip chip-${verdict.toLowerCase()}`;
}

function bandClass(band: string): string {
  return `band band-${band.toLowerCase()}`;
}

function isAmountKey(key: string): boolean {
  return /amount|price|cost|usd|total|budget|limit/i.test(key);
}

function formatPayloadValue(value: unknown): string {
  if (typeof value === 'number') return value.toLocaleString();
  if (typeof value === 'string') return value;
  return JSON.stringify(value) ?? String(value);
}

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
      <main className="page">
        <p className="page-eyebrow">Audit trail</p>
        <h1 className="page-title">Flight Recorder</h1>
        <p className="muted">Loading decision history…</p>
      </main>
    );
  }

  return (
    <main className="page">
      <p className="page-eyebrow">Audit trail</p>
      <h1 className="page-title">Flight Recorder</h1>
      <p className="page-sub">
        Every decision ever made, in order. Click any row to replay it: the agent, what it
        proposed, the verdict, the rule that fired, and the exact policy sentence behind it.
      </p>

      <p className="mono faint">
        {decisions.length} decisions recorded
        {source && (
          <span
            title={
              source === 'database'
                ? 'Replaying from PostgreSQL'
                : 'PostgreSQL is not running; replaying this session from memory'
            }
          >
            {' · '}
            {source === 'database' ? 'postgres' : 'in-memory (postgres down)'}
          </span>
        )}
      </p>

      {decisions.length === 0 && (
        <div className="empty-state">
          <p className="empty-title">No decisions recorded yet</p>
          <p>Run a mission from Mission Control and every decision will land here.</p>
        </div>
      )}

      {decisions.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table className="table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Step</th>
                <th>Agent</th>
                <th>Action</th>
                <th>Verdict</th>
                <th>Rule</th>
                <th>Cited policy</th>
              </tr>
            </thead>
            <tbody>
              {decisions.map((d, idx) => (
                <DecisionRow
                  key={`${d.missionId}-${d.stepNumber}-${idx}`}
                  decision={d}
                  onClick={() => setSelected(d)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected && <DecisionReplay decision={selected} onClose={() => setSelected(null)} />}
    </main>
  );
}

function DecisionRow({
  decision,
  onClick,
}: {
  decision: DecisionRecord;
  onClick: () => void;
}) {
  const bandChanged = decision.agentBandBefore !== decision.agentBandAfter;

  return (
    <tr className="clickable" onClick={onClick}>
      <td className="mono faint">{new Date(decision.timestamp).toLocaleTimeString()}</td>
      <td className="mono faint">{decision.stepNumber}</td>
      <td>
        {decision.agentRole}
        {bandChanged && (
          <div>
            <span className="mono faint">
              {decision.agentBandBefore} → {decision.agentBandAfter}
            </span>
          </div>
        )}
      </td>
      <td>{sentenceCase(decision.actionType)}</td>
      <td>
        <span className={chipClass(decision.verdict)}>{decision.verdict}</span>
      </td>
      <td className="mono faint">{decision.ruleId !== null ? `#${decision.ruleId}` : '·'}</td>
      <td className="faint">
        {decision.sourcePassage ? (
          truncate(decision.sourcePassage, 96)
        ) : (
          <span className="faint">no rule cited</span>
        )}
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
  const bandChanged = decision.agentBandBefore !== decision.agentBandAfter;
  const demoted = bandChanged && decision.verdict === 'BLOCK';
  const payloadEntries = Object.entries(decision.actionPayload);

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(28, 24, 38, 0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '2rem',
      }}
    >
      <div
        className="card card-pad"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '640px', width: '100%', maxHeight: '85vh', overflowY: 'auto' }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: '1rem',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <span className={chipClass(decision.verdict)}>{decision.verdict}</span>
              <strong>{sentenceCase(decision.actionType)}</strong>
            </div>
            <p className="muted" style={{ margin: '0.5rem 0 0.25rem' }}>
              {decision.missionGoal}
            </p>
            <p className="mono faint" style={{ margin: 0 }}>
              Step {decision.stepNumber} · {new Date(decision.timestamp).toLocaleString()}
            </p>
          </div>
          <button className="btn btn-quiet" onClick={onClose}>
            Close
          </button>
        </div>

        {bandChanged && (
          <div className={demoted ? 'ledger-event demotion' : 'ledger-event'}>
            {demoted ? 'DEMOTED' : 'PROMOTED'} · {decision.agentBandBefore} →{' '}
            {decision.agentBandAfter}
            {demoted ? ' · reputation reset to 0' : ''}
          </div>
        )}

        <p className="section-label">Proposal</p>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'max-content 1fr',
            columnGap: '1.25rem',
            rowGap: '0.3rem',
          }}
        >
          <span className="mono faint">agent</span>
          <span className="mono">{decision.agentRole}</span>
          <span className="mono faint">risk class</span>
          <span className="mono">{decision.riskClass}</span>
          {payloadEntries.map(([key, value]) => (
            <span key={key} style={{ display: 'contents' }}>
              <span className="mono faint">{key.replace(/_/g, ' ')}</span>
              <span className={isAmountKey(key) ? 'amount' : 'mono'}>
                {formatPayloadValue(value)}
              </span>
            </span>
          ))}
        </div>

        <p className="section-label">Decision</p>
        <p style={{ margin: '0 0 0.5rem' }}>
          <span className={chipClass(decision.verdict)}>{decision.verdict}</span>
        </p>
        <p style={{ margin: 0 }}>{decision.explanation}</p>
        {decision.graniteExplanation &&
          decision.graniteExplanation !== decision.explanation && (
            <p className="muted" style={{ margin: '0.6rem 0 0' }}>
              {decision.graniteExplanation}{' '}
              <ExplanationSourceChip source={decision.explanationSource} />
            </p>
          )}

        {decision.sourcePassage && (
          <>
            <p className="section-label">Cited policy</p>
            <blockquote className="citation" style={{ margin: 0 }}>
              {decision.sourcePassage}
              <span className="citation-ref">
                Policy document
                {decision.ruleId !== null ? ` · rule #${decision.ruleId}` : ''}
              </span>
            </blockquote>
          </>
        )}

        <p className="section-label">Authority</p>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'max-content 1fr',
            columnGap: '1.25rem',
            rowGap: '0.45rem',
            alignItems: 'center',
          }}
        >
          <span className="mono faint">band</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span className={bandClass(decision.agentBandBefore)}>
              {decision.agentBandBefore}
            </span>
            <span className="mono faint">→</span>
            <span className={bandClass(decision.agentBandAfter)}>
              {decision.agentBandAfter}
            </span>
          </span>
          <span className="mono faint">reputation</span>
          <span className="mono">
            {decision.reputationBefore} → {decision.reputationAfter}
          </span>
        </div>
      </div>
    </div>
  );
}

/** Labels where the explanation came from: Granite (live) or a canned fixture. */
function ExplanationSourceChip({ source }: { source: string | null }) {
  const isGranite = source === 'granite';
  return (
    <span
      className="mono faint"
      title={
        isGranite
          ? 'Generated live by IBM Granite via watsonx.ai'
          : 'Canned fixture explanation: no watsonx key configured, so this is not live Granite output'
      }
    >
      {isGranite ? '[IBM Granite]' : '[fixture, no key]'}
    </span>
  );
}
