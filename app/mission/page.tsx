'use client';

import { useState, useEffect } from 'react';
import type { MissionStatus, MissionStep } from '@/src/orchestrator/types';

export default function MissionControl() {
  const [missions, setMissions] = useState<MissionStatus[]>([]);
  const [selectedMission, setSelectedMission] = useState<string | null>(null);
  const [mode, setMode] = useState<'live' | 'replay'>('replay');
  const [isStarting, setIsStarting] = useState(false);

  // Poll for mission updates
  useEffect(() => {
    const fetchMissions = async () => {
      try {
        const response = await fetch('/api/missions');
        const data = await response.json();
        setMissions(data.missions || []);
      } catch (error) {
        console.error('Error fetching missions:', error);
      }
    };

    fetchMissions();
    const interval = setInterval(fetchMissions, 1000); // Poll every second

    return () => clearInterval(interval);
  }, []);

  const startMission = async () => {
    setIsStarting(true);
    try {
      const response = await fetch('/api/missions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          goal: 'Purchase 20 developer laptops for under GBP 25,000, delivered by Friday',
          mode,
        }),
      });

      const data = await response.json();
      if (data.missionId) {
        setSelectedMission(data.missionId);
      }
    } catch (error) {
      console.error('Error starting mission:', error);
      alert('Failed to start mission');
    } finally {
      setIsStarting(false);
    }
  };

  const currentMission = selectedMission
    ? missions.find(m => m.id === selectedMission)
    : missions[missions.length - 1];

  return (
    <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
      <h1 style={{ marginBottom: '2rem' }}>Mission Control</h1>

      {/* Start Mission Controls */}
      <div style={{ 
        marginBottom: '2rem', 
        padding: '1.5rem', 
        border: '1px solid #ddd', 
        borderRadius: '8px',
        backgroundColor: '#f9f9f9'
      }}>
        <h2 style={{ marginBottom: '1rem', fontSize: '1.2rem' }}>Start New Mission</h2>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <input
              type="radio"
              value="replay"
              checked={mode === 'replay'}
              onChange={(e) => setMode(e.target.value as 'replay')}
            />
            Replay Mode (Fixtures)
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <input
              type="radio"
              value="live"
              checked={mode === 'live'}
              onChange={(e) => setMode(e.target.value as 'live')}
            />
            Live Mode (Granite)
          </label>
          <button
            onClick={startMission}
            disabled={isStarting}
            style={{
              padding: '0.5rem 1.5rem',
              backgroundColor: isStarting ? '#ccc' : '#0070f3',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: isStarting ? 'not-allowed' : 'pointer',
              fontWeight: 'bold',
            }}
          >
            {isStarting ? 'Starting...' : 'Start Mission'}
          </button>
        </div>
      </div>

      {/* Mission Status */}
      {currentMission && (
        <div style={{ marginBottom: '2rem' }}>
          <div style={{ 
            padding: '1rem', 
            backgroundColor: '#f0f0f0', 
            borderRadius: '4px',
            marginBottom: '1rem'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <strong>Mission:</strong> {currentMission.goal}
              </div>
              <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                <span style={{
                  padding: '0.25rem 0.75rem',
                  borderRadius: '12px',
                  fontSize: '0.875rem',
                  fontWeight: 'bold',
                  backgroundColor: currentMission.mode === 'live' ? '#10b981' : '#3b82f6',
                  color: 'white',
                }}>
                  {currentMission.mode.toUpperCase()}
                </span>
                <StatusChip status={currentMission.status} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Decision Feed */}
      {currentMission && currentMission.steps.length > 0 && (
        <div>
          <h2 style={{ marginBottom: '1rem', fontSize: '1.2rem' }}>Decision Feed</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {currentMission.steps.map((step) => (
              <StepCard key={step.stepNumber} step={step} />
            ))}
          </div>
        </div>
      )}

      {currentMission && currentMission.steps.length === 0 && (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#666' }}>
          <p>Mission started. Waiting for first decision...</p>
        </div>
      )}

      {!currentMission && (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#666' }}>
          <p>No active mission. Start a new mission above.</p>
        </div>
      )}
    </div>
  );
}

function StatusChip({ status }: { status: string }) {
  const colors = {
    running: { bg: '#10b981', text: 'white' },
    paused: { bg: '#f59e0b', text: 'white' },
    completed: { bg: '#6366f1', text: 'white' },
    failed: { bg: '#ef4444', text: 'white' },
  };

  const color = colors[status as keyof typeof colors] || colors.running;

  return (
    <span style={{
      padding: '0.25rem 0.75rem',
      borderRadius: '12px',
      fontSize: '0.875rem',
      fontWeight: 'bold',
      backgroundColor: color.bg,
      color: color.text,
    }}>
      {status.toUpperCase()}
    </span>
  );
}

function StepCard({ step }: { step: MissionStep }) {
  const verdictColors = {
    ALLOW: { bg: '#d1fae5', border: '#10b981', text: '#065f46' },
    REVIEW: { bg: '#fef3c7', border: '#f59e0b', text: '#92400e' },
    APPROVAL: { bg: '#dbeafe', border: '#3b82f6', text: '#1e40af' },
    BLOCK: { bg: '#fee2e2', border: '#ef4444', text: '#991b1b' },
  };

  const verdict = step.decision.verdict;
  const colors = verdictColors[verdict];

  const bandChanged = step.agentStateBefore.autonomyBand !== step.agentStateAfter.autonomyBand;

  return (
    <div style={{
      border: `2px solid ${colors.border}`,
      borderRadius: '8px',
      padding: '1rem',
      backgroundColor: 'white',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '0.75rem' }}>
        <div>
          <div style={{ fontSize: '0.875rem', color: '#666', marginBottom: '0.25rem' }}>
            Step {step.stepNumber} • {step.agentRole}
          </div>
          <div style={{ fontSize: '1.1rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>
            {step.proposal.actionType.replace(/_/g, ' ').toUpperCase()}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <BandChip band={step.agentStateAfter.autonomyBand} />
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
        </div>
      </div>

      {bandChanged && (
        <div style={{
          padding: '0.5rem',
          backgroundColor: '#fef3c7',
          border: '1px solid #f59e0b',
          borderRadius: '4px',
          marginBottom: '0.75rem',
          fontSize: '0.875rem',
          fontWeight: 'bold',
          color: '#92400e',
        }}>
          🔄 Band Transition: {step.agentStateBefore.autonomyBand} → {step.agentStateAfter.autonomyBand}
        </div>
      )}

      <div style={{ fontSize: '0.875rem', color: '#444', marginBottom: '0.5rem' }}>
        {step.decision.explanation}
      </div>

      {step.decision.sourcePassage && (
        <div style={{
          fontSize: '0.75rem',
          color: '#666',
          fontStyle: 'italic',
          padding: '0.5rem',
          backgroundColor: '#f9f9f9',
          borderLeft: '3px solid #ddd',
          marginTop: '0.5rem',
        }}>
          📋 {step.decision.sourcePassage}
        </div>
      )}

      <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid #e5e5e5' }}>
        <a
          href="/recorder"
          style={{
            fontSize: '0.75rem',
            color: '#3b82f6',
            textDecoration: 'none',
            fontWeight: 'bold',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.textDecoration = 'underline';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.textDecoration = 'none';
          }}
        >
          📼 View in Flight Recorder →
        </a>
      </div>
    </div>
  );
}

function BandChip({ band }: { band: string }) {
  const colors = {
    PROBATION: { bg: '#fee2e2', text: '#991b1b' },
    SUPERVISED: { bg: '#fef3c7', text: '#92400e' },
    TRUSTED: { bg: '#d1fae5', text: '#065f46' },
  };

  const color = colors[band as keyof typeof colors] || colors.PROBATION;

  return (
    <span style={{
      padding: '0.25rem 0.75rem',
      borderRadius: '12px',
      fontSize: '0.75rem',
      fontWeight: 'bold',
      backgroundColor: color.bg,
      color: color.text,
    }}>
      {band}
    </span>
  );
}
