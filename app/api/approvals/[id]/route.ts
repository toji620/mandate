import { NextRequest, NextResponse } from 'next/server';
import { orchestrator } from '@/src/orchestrator/orchestrator';

/**
 * POST /api/approvals/[id] - Approve or reject an approval
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const { action, approvedBy } = body;

    if (!action || !approvedBy) {
      return NextResponse.json(
        { error: 'Missing required fields: action, approvedBy' },
        { status: 400 }
      );
    }

    if (action !== 'approve' && action !== 'reject') {
      return NextResponse.json(
        { error: 'Invalid action. Must be "approve" or "reject"' },
        { status: 400 }
      );
    }

    if (action === 'approve') {
      await orchestrator.approveAction(params.id, approvedBy);
    } else {
      await orchestrator.rejectAction(params.id, approvedBy);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error processing approval:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to process approval' },
      { status: 500 }
    );
  }
}
