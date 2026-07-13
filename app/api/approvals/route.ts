import { NextResponse } from 'next/server';
import { orchestrator } from '@/src/orchestrator/orchestrator';

/**
 * GET /api/approvals - List all pending approvals
 */
export async function GET() {
  const missions = orchestrator.getAllMissions();
  const allApprovals = missions.flatMap(m => m.pendingApprovals);
  const pendingApprovals = allApprovals.filter(a => a.status === 'pending');
  
  return NextResponse.json({ approvals: pendingApprovals });
}
