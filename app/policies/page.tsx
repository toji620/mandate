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
  sectionRef?: string;
  rules: PolicyRule[];
}

export default function PolicyLibrary() {
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Mock data for now - will be replaced with API call when persistence is added
    const mockPolicies: Policy[] = [
      {
        id: 1,
        title: 'Finance Approval Matrix',
        sourceDocument: 'finance-approval-matrix.json',
        sectionRef: 's2.1',
        rules: [
          {
            id: 1,
            policyId: 1,
            ruleType: 'SPEND_THRESHOLD',
            thresholdValue: 10000,
            currency: 'GBP',
            appliesTo: 'all',
            sourcePassage: 'Finance Approval Matrix s2.1: Expenditures exceeding GBP 10,000 require Finance Director approval',
          },
        ],
      },
      {
        id: 2,
        title: 'Approved Vendor List',
        sourceDocument: 'approved-vendor-list.json',
        rules: [
          {
            id: 2,
            policyId: 2,
            ruleType: 'VENDOR_APPROVAL',
            appliesTo: 'Dell',
            sourcePassage: 'Approved Vendor List: Dell is an approved supplier for IT equipment procurement',
          },
          {
            id: 3,
            policyId: 2,
            ruleType: 'VENDOR_APPROVAL',
            appliesTo: 'HP',
            sourcePassage: 'Approved Vendor List: HP is an approved supplier for IT equipment procurement',
          },
          {
            id: 4,
            policyId: 2,
            ruleType: 'VENDOR_APPROVAL',
            appliesTo: 'Lenovo',
            sourcePassage: 'Approved Vendor List: Lenovo is an approved supplier for IT equipment procurement',
          },
        ],
      },
      {
        id: 3,
        title: 'Procurement Policy',
        sourceDocument: 'procurement-policy.json',
        sectionRef: 's3.2',
        rules: [
          {
            id: 5,
            policyId: 3,
            ruleType: 'VENDOR_APPROVAL',
            appliesTo: 'all',
            sourcePassage: 'Procurement Policy s3.2: All vendors must be on the approved vendor list before purchase orders can be issued',
          },
        ],
      },
      {
        id: 4,
        title: 'Security Requirements',
        sourceDocument: 'security-requirements.json',
        sectionRef: 's1.4',
        rules: [
          {
            id: 6,
            policyId: 4,
            ruleType: 'SECURITY',
            appliesTo: 'IT equipment',
            sourcePassage: 'Security Requirements s1.4: All IT equipment must meet minimum security standards including encryption and secure boot capabilities',
          },
        ],
      },
    ];

    setPolicies(mockPolicies);
    setLoading(false);
  }, []);

  if (loading) {
    return (
      <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
        <h1 style={{ marginBottom: '2rem' }}>Policy Library</h1>
        <p>Loading policies...</p>
      </div>
    );
  }

  return (
    <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
      <h1 style={{ marginBottom: '1rem' }}>Policy Library</h1>
      <p style={{ color: '#666', marginBottom: '2rem', fontSize: '0.95rem' }}>
        Extracted policy rules with thresholds, vendors, and source citations. Documents became structured, cited, human-confirmed controls.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
        {policies.map((policy) => (
          <PolicyCard key={policy.id} policy={policy} />
        ))}
      </div>
    </div>
  );
}

function PolicyCard({ policy }: { policy: Policy }) {
  return (
    <div style={{
      border: '1px solid #ddd',
      borderRadius: '8px',
      padding: '1.5rem',
      backgroundColor: 'white',
    }}>
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
  const ruleTypeColors = {
    SPEND_THRESHOLD: { bg: '#dbeafe', text: '#1e40af', border: '#3b82f6' },
    VENDOR_APPROVAL: { bg: '#d1fae5', text: '#065f46', border: '#10b981' },
    SECURITY: { bg: '#fef3c7', text: '#92400e', border: '#f59e0b' },
  };

  const colors = ruleTypeColors[rule.ruleType as keyof typeof ruleTypeColors] || {
    bg: '#f3f4f6',
    text: '#374151',
    border: '#9ca3af',
  };

  return (
    <div style={{
      padding: '1rem',
      backgroundColor: '#f9f9f9',
      borderRadius: '6px',
      borderLeft: `4px solid ${colors.border}`,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '0.75rem' }}>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{
            padding: '0.25rem 0.75rem',
            borderRadius: '12px',
            fontSize: '0.75rem',
            fontWeight: 'bold',
            backgroundColor: colors.bg,
            color: colors.text,
            border: `1px solid ${colors.border}`,
          }}>
            {rule.ruleType.replace(/_/g, ' ')}
          </span>

          {rule.thresholdValue !== undefined && (
            <span style={{
              fontSize: '0.875rem',
              fontWeight: 'bold',
              color: '#374151',
            }}>
              Threshold: {rule.currency} {rule.thresholdValue.toLocaleString()}
            </span>
          )}

          {rule.appliesTo && rule.appliesTo !== 'all' && (
            <span style={{
              fontSize: '0.875rem',
              color: '#666',
            }}>
              Applies to: <strong>{rule.appliesTo}</strong>
            </span>
          )}
        </div>
      </div>

      <div style={{
        padding: '0.75rem',
        backgroundColor: 'white',
        borderLeft: '3px solid #3b82f6',
        fontStyle: 'italic',
        fontSize: '0.875rem',
        color: '#444',
        lineHeight: '1.6',
      }}>
        <div style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#666', marginBottom: '0.25rem' }}>
          📋 POLICY CITATION
        </div>
        {rule.sourcePassage}
      </div>
    </div>
  );
}
