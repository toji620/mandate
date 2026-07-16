'use client';

import { useState, useEffect } from 'react';

interface PolicyRule {
  id: number;
  policyId: number;
  ruleType: string;
  thresholdValue?: number;
  currency?: string;
  appliesTo?: string;
  sourcePassage: string;
}

interface Policy {
  id: number;
  title: string;
  sourceDocument: string;
  sectionRef: string | null;
  rules: PolicyRule[];
}

export default function PolicyLibrary() {
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [source, setSource] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/policies')
      .then((res) => res.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setPolicies(data.policies ?? []);
        setSource(data.source ?? '');
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const ruleCount = policies.reduce((n, p) => n + p.rules.length, 0);

  if (loading) {
    return (
      <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
        <h1 style={{ marginBottom: '2rem' }}>Policy Library</h1>
        <p>Loading policies…</p>
      </div>
    );
  }

  return (
    <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
      <h1 style={{ marginBottom: '1rem' }}>Policy Library</h1>
      <p style={{ color: '#666', marginBottom: '1rem', fontSize: '0.95rem' }}>
        Policy documents, parsed offline and human-reviewed, become structured rules with a
        citation attached to every one. These are the rules the evaluator enforces — the same
        objects, not a copy.
      </p>

      {error && (
        <div
          style={{
            padding: '1rem',
            backgroundColor: '#fee2e2',
            border: '1px solid #ef4444',
            borderRadius: '6px',
            color: '#991b1b',
            marginBottom: '1.5rem',
          }}
        >
          Could not load the policy library: {error}
        </div>
      )}

      {!error && (
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
            <strong>{policies.length}</strong> documents · <strong>{ruleCount}</strong> rules
          </span>
          <SourceChip source={source} />
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
        {policies.map((policy) => (
          <PolicyCard key={policy.id} policy={policy} />
        ))}
      </div>
    </div>
  );
}

/** Says out loud where the rules came from, rather than quietly pretending. */
function SourceChip({ source }: { source: string }) {
  if (!source) return null;

  const isDb = source === 'database';

  return (
    <span
      style={{
        padding: '0.2rem 0.6rem',
        borderRadius: '10px',
        fontSize: '0.7rem',
        fontWeight: 'bold',
        backgroundColor: isDb ? '#d1fae5' : '#fef3c7',
        color: isDb ? '#065f46' : '#92400e',
      }}
      title={
        isDb
          ? 'Loaded from PostgreSQL'
          : 'PostgreSQL is not running — loaded from the committed seed documents in data/seed/'
      }
    >
      {isDb ? 'postgres' : 'seed files (postgres down)'}
    </span>
  );
}

function PolicyCard({ policy }: { policy: Policy }) {
  return (
    <div
      style={{
        border: '1px solid #ddd',
        borderRadius: '8px',
        padding: '1.5rem',
        backgroundColor: 'white',
      }}
    >
      <div style={{ marginBottom: '1rem' }}>
        <h2 style={{ fontSize: '1.3rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>
          {policy.title}
        </h2>
        <div style={{ display: 'flex', gap: '1rem', fontSize: '0.875rem', color: '#666' }}>
          <span>📄 {policy.sourceDocument}</span>
          {policy.sectionRef && <span>§ {policy.sectionRef}</span>}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {policy.rules.map((rule) => (
          <RuleCard key={rule.id} rule={rule} />
        ))}
      </div>
    </div>
  );
}

function RuleCard({ rule }: { rule: PolicyRule }) {
  const ruleTypeColors: Record<string, { bg: string; text: string; border: string }> = {
    SPEND_THRESHOLD: { bg: '#dbeafe', text: '#1e40af', border: '#3b82f6' },
    VENDOR_APPROVAL: { bg: '#d1fae5', text: '#065f46', border: '#10b981' },
    SECURITY_REQUIREMENT: { bg: '#fef3c7', text: '#92400e', border: '#f59e0b' },
  };

  const colors = ruleTypeColors[rule.ruleType] ?? {
    bg: '#f3f4f6',
    text: '#374151',
    border: '#9ca3af',
  };

  return (
    <div
      style={{
        padding: '1rem',
        backgroundColor: '#f9f9f9',
        borderRadius: '6px',
        borderLeft: `4px solid ${colors.border}`,
      }}
    >
      <div
        style={{
          display: 'flex',
          gap: '0.75rem',
          alignItems: 'center',
          flexWrap: 'wrap',
          marginBottom: '0.75rem',
        }}
      >
        <span
          style={{
            padding: '0.25rem 0.75rem',
            borderRadius: '12px',
            fontSize: '0.75rem',
            fontWeight: 'bold',
            backgroundColor: colors.bg,
            color: colors.text,
            border: `1px solid ${colors.border}`,
          }}
        >
          {rule.ruleType.replace(/_/g, ' ')}
        </span>

        <span style={{ fontSize: '0.7rem', color: '#9ca3af', fontFamily: 'monospace' }}>
          rule #{rule.id}
        </span>

        {rule.thresholdValue !== undefined && (
          <span style={{ fontSize: '0.875rem', fontWeight: 'bold', color: '#374151' }}>
            Threshold: {rule.currency} {rule.thresholdValue.toLocaleString()}
          </span>
        )}

        {rule.appliesTo && rule.appliesTo !== 'all' && (
          <span style={{ fontSize: '0.875rem', color: '#666' }}>
            Applies to: <strong>{rule.appliesTo}</strong>
          </span>
        )}
      </div>

      <div
        style={{
          padding: '0.75rem',
          backgroundColor: 'white',
          borderLeft: '3px solid #3b82f6',
          fontStyle: 'italic',
          fontSize: '0.875rem',
          color: '#444',
          lineHeight: '1.6',
        }}
      >
        <div
          style={{
            fontSize: '0.75rem',
            fontWeight: 'bold',
            color: '#666',
            marginBottom: '0.25rem',
            fontStyle: 'normal',
          }}
        >
          📋 POLICY CITATION
        </div>
        {rule.sourcePassage}
      </div>
    </div>
  );
}
