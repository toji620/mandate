import { NextRequest, NextResponse } from 'next/server';
import { orchestrator } from '@/src/orchestrator/orchestrator';
import { loadPolicyRules } from '@/src/policies/load';

/**
 * GET /api/missions - list all missions
 */
export async function GET() {
  const missions = orchestrator.getAllMissions();
  return NextResponse.json({ missions });
}

/**
 * POST /api/missions - start a new mission
 *
 * The rules come from the policy library (Postgres, or the committed seed
 * documents when it is down). They used to be a hardcoded array in this file,
 * which meant the running app was never actually judged against the seeded
 * policy — only against a copy of it that happened to agree.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { goal, mode } = body;

    if (!goal || !mode) {
      return NextResponse.json({ error: 'Missing required fields: goal, mode' }, { status: 400 });
    }

    if (mode !== 'live' && mode !== 'replay') {
      return NextResponse.json(
        { error: 'Invalid mode. Must be "live" or "replay"' },
        { status: 400 }
      );
    }

    const rules = await loadPolicyRules();

    if (rules.length === 0) {
      return NextResponse.json(
        { error: 'No policy rules available. Run `npm run db:seed`.' },
        { status: 500 }
      );
    }

    const missionId = await orchestrator.startMission({ goal, mode, initialContext: {} }, rules);

    return NextResponse.json({ missionId });
  } catch (error) {
    console.error('Error starting mission:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to start mission' },
      { status: 500 }
    );
  }
}
