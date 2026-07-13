import { NextRequest, NextResponse } from 'next/server';
import { orchestrator } from '@/src/orchestrator/orchestrator';

/**
 * GET /api/missions/[id] - Get mission status
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const mission = orchestrator.getMission(id);
  
  if (!mission) {
    return NextResponse.json(
      { error: 'Mission not found' },
      { status: 404 }
    );
  }

  return NextResponse.json({ mission });
}
