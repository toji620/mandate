'use client';

import { Fragment, useState, useEffect } from 'react';
import type { MissionStatus, MissionStep } from '@/src/orchestrator/types';

const BAND_ORDER = ['PROBATION', 'SUPERVISED', 'TRUSTED'];

function sentenceCase(actionType: string): string {
  const words = actionType.replace(/_/g, ' ').toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

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
    <main className="page">
      <p className="page-eyebrow">Live authority feed</p>
      <h1 className="page-title">Mission Control</h1>
      <p className="page-sub">
        Agent proposals evaluated against policy in real time, with trust earned or revoked per decision.
      </p>

      <div className="card card-pad">
        <div className="radio-row">
          <label className="radio-label">
            <input
              type="radio"
              value="replay"
              checked={mode === 'replay'}
              onChange={(e) => setMode(e.target.value as 'replay')}
            />
            Replay
          </label>
          <label className="radio-label">
            <input
              type="radio"
              value="live"
              checked={mode === 'live'}
              onChange={(e) => setMode(e.target.value as 'live')}
            />
            Live
          </label>
          <button className="btn btn-primary" onClick={startMission} disabled={isStarting}>
            {isStarting ? 'Starting mission' : 'Start mission'}
          </button>
        </div>
      </div>

      {currentMission && (
        <>
          <h2 className="section-label">Mission</h2>
          <div
            className="card card-pad"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}
          >
            <span className="mono">{currentMission.goal}</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
              <span className="chip faint">{currentMission.mode.toUpperCase()}</span>
              <span className="chip muted">{currentMission.status.toUpperCase()}</span>
            </span>
          </div>
        </>
      )}

      {currentMission && currentMission.steps.length > 0 && (
        <>
          <h2 className="section-label">Decision feed</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            {currentMission.steps.map((step) => {
              const before = step.agentStateBefore.autonomyBand;
              const after = step.agentStateAfter.autonomyBand;
              const bandChanged = before !== after;
              const promoted = BAND_ORDER.indexOf(after) > BAND_ORDER.indexOf(before);
              return (
                <Fragment key={step.stepNumber}>
                  <StepCard step={step} />
                  {bandChanged && (
                    <div className={promoted ? 'ledger-event' : 'ledger-event demotion'}>
                      {step.agentRole.toUpperCase()} {promoted ? 'PROMOTED' : 'DEMOTED'} · {before} → {after}
                    </div>
                  )}
                </Fragment>
              );
            })}
          </div>
        </>
      )}

      {currentMission && currentMission.steps.length === 0 && (
        <div className="empty-state">
          <p className="empty-title">Waiting for first decision</p>
          <p>The mission is running; proposals appear here as they are evaluated.</p>
        </div>
      )}

      {!currentMission && (
        <div className="empty-state">
          <p className="empty-title">No mission running</p>
          <p>Start a mission to see agent proposals evaluated in real time.</p>
        </div>
      )}
    </main>
  );
}

function StepCard({ step }: { step: MissionStep }) {
  const verdict = step.decision.verdict;
  const band = step.agentStateAfter.autonomyBand;

  return (
    <div
      className="card card-pad"
      style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1.5rem' }}
    >
      <div style={{ minWidth: 0 }}>
        <div className="mono faint">
          <small>Step {step.stepNumber} · {step.agentRole}</small>
        </div>
        <div style={{ fontWeight: 500 }}>{sentenceCase(step.proposal.actionType)}</div>
        <div className="muted">{step.decision.explanation}</div>
        {step.decision.sourcePassage && (
          <div className="citation" style={{ marginTop: '0.5rem' }}>
            {step.decision.sourcePassage}
          </div>
        )}
        <div style={{ marginTop: '0.5rem' }}>
          <small>
            <a href="/recorder" className="mono faint">View in Flight Recorder</a>
          </small>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
        <span className={`band band-${band.toLowerCase()}`}>{band}</span>
        <span className={`chip chip-${verdict.toLowerCase()}`}>{verdict}</span>
      </div>
    </div>
  );
}
