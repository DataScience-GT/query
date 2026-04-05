import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { hackathonId } = body;

  if (!hackathonId) {
    return NextResponse.json({ error: 'Hackathon ID is required' }, { status: 400 });
  }

  // Register as judge (not participant) - this goes to the judge admin for approval
  return NextResponse.json({
    success: true,
    message: 'Judge registration submitted. Please wait for admin approval before judging.',
    hackathonId,
    role: 'judge',
    note: 'Judge registrations require admin approval before judging can begin.',
  });
}

export async function GET(_req: NextRequest) {
  return NextResponse.json({ message: 'Judge registration route - use POST to register' });
}
