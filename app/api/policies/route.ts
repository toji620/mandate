import { NextResponse } from 'next/server';
import { loadPolicyLibrary } from '@/src/policies/load';

/**
 * GET /api/policies - the extracted policy rules with their source citations.
 *
 * Reads Postgres; falls back to the committed seed documents when Postgres is
 * not running. `source` tells the UI which one it got, so the screen can be
 * honest about where the rules came from.
 */
export async function GET() {
  try {
    const library = await loadPolicyLibrary();
    return NextResponse.json(library);
  } catch (error) {
    console.error('Error loading policy library:', error);
    return NextResponse.json({ error: 'Failed to load policy library' }, { status: 500 });
  }
}
