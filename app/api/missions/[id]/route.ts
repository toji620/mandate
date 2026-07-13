import { NextRequest, NextResponse } from 'next/server';
import { orchestrator } from '@/src/orchestrator/orchestrator';

/**
 * GET /api/missions/[id] - Get mission status
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const mission = orchestrator.getMission(params.id);
  
  if (!mission) {
    return NextResponse.json(
      { error: 'Mission not found' },
      { status: 404 }
    );
  }

  return NextResponse.json({ mission });
}
