import { NextRequest, NextResponse } from 'next/server';
import { orchestrator } from '@/src/orchestrator/orchestrator';

// Mock policy rules for now (in real app, would fetch from DB)
const mockRules = [
  {
    id: 1,
    policyId: 1,
    ruleType: 'SPEND_THRESHOLD' as const,
    thresholdValue: 10000,
    currency: 'GBP',
    appliesTo: 'all',
    sourcePassage: 'Finance Approval Matrix s2.1: Expenditures exceeding GBP 10,000 require Finance Director approval',
  },
  {
    id: 2,
    policyId: 2,
    ruleType: 'VENDOR_APPROVAL' as const,
    appliesTo: 'Dell',
    sourcePassage: 'Approved Vendor List: Dell is an approved supplier',
  },
  {
    id: 3,
    policyId: 2,
    ruleType: 'VENDOR_APPROVAL' as const,
    appliesTo: 'HP',
    sourcePassage: 'Approved Vendor List: HP is an approved supplier',
  },
  {
    id: 4,
    policyId: 2,
    ruleType: 'VENDOR_APPROVAL' as const,
    appliesTo: 'Lenovo',
    sourcePassage: 'Approved Vendor List: Lenovo is an approved supplier',
  },
];

/**
 * GET /api/missions - List all missions
 */
export async function GET() {
  const missions = orchestrator.getAllMissions();
  return NextResponse.json({ missions });
}

/**
 * POST /api/missions - Start a new mission
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { goal, mode } = body;

    if (!goal || !mode) {
      return NextResponse.json(
        { error: 'Missing required fields: goal, mode' },
        { status: 400 }
      );
    }

    if (mode !== 'live' && mode !== 'replay') {
      return NextResponse.json(
        { error: 'Invalid mode. Must be "live" or "replay"' },
        { status: 400 }
      );
    }

    const missionId = await orchestrator.startMission(
      {
        goal,
        mode,
        initialContext: {},
      },
      mockRules
    );

    return NextResponse.json({ missionId });
  } catch (error) {
    console.error('Error starting mission:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to start mission' },
      { status: 500 }
    );
  }
}
