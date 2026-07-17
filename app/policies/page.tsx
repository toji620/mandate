'use client';

import { useState, useEffect, Fragment } from 'react';

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
      <main className="page">
        <p className="page-eyebrow">Source of truth</p>
        <h1 className="page-title">Policy Library</h1>
        <p className="page-sub">Loading policies…</p>
      </main>
    );
  }

  return (
    <main className="page">
      <p className="page-eyebrow">Source of truth</p>
      <h1 className="page-title">Policy Library</h1>
      <p className="page-sub">
        Policy documents, parsed offline and human-reviewed, become structured rules with a
        citation attached to every one. These are the rules the evaluator enforces: the same
        objects, not a copy.
      </p>

      {error && (
        <div className="card card-pad">
          <p className="muted">Could not load the policy library: {error}</p>
        </div>
      )}

      {!error && (
        <p className="mono faint">
          {policies.length} documents · {ruleCount} rules{source && ' · '}
          <SourceChip source={source} />
        </p>
      )}

      {policies.map((policy) => (
        <PolicyCard key={policy.id} policy={policy} />
      ))}
    </main>
  );
}

/** Says out loud where the rules came from, rather than quietly pretending. */
function SourceChip({ source }: { source: string }) {
  if (!source) return null;

  const isDb = source === 'database';

  return (
    <span
      className="mono faint"
      title={
        isDb
          ? 'Loaded from PostgreSQL'
          : 'PostgreSQL is not running; loaded from the committed seed documents in data/seed/'
      }
    >
      {isDb ? 'postgres' : 'seed files (postgres down)'}
    </span>
  );
}

function PolicyCard({ policy }: { policy: Policy }) {
  return (
    <section>
      <p className="section-label">
        Policy document · {policy.rules.length} {policy.rules.length === 1 ? 'rule' : 'rules'}
      </p>
      <div className="card">
        <div className="card-pad">
          <h2>{policy.title}</h2>
          <p className="mono faint">
            {policy.sourceDocument}
            {policy.sectionRef && ` · ${policy.sectionRef}`}
          </p>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>Rule</th>
              <th>Type</th>
              <th>Applies to</th>
              <th>Threshold</th>
            </tr>
          </thead>
          <tbody>
            {policy.rules.map((rule) => (
              <Fragment key={rule.id}>
                <tr>
                  <td className="mono">#{rule.id}</td>
                  <td className="mono faint">{rule.ruleType}</td>
                  <td>
                    {rule.appliesTo === 'all' ? (
                      <span className="faint">all</span>
                    ) : (
                      rule.appliesTo
                    )}
                  </td>
                  <td>
                    {rule.thresholdValue !== undefined && (
                      <span className="amount">
                        {rule.currency} {rule.thresholdValue.toLocaleString()}
                      </span>
                    )}
                  </td>
                </tr>
                <tr>
                  <td colSpan={4}>
                    <blockquote className="citation">
                      {rule.sourcePassage}
                      <span className="citation-ref">
                        {policy.title}
                        {policy.sectionRef && ` · ${policy.sectionRef}`}
                      </span>
                    </blockquote>
                  </td>
                </tr>
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
