/**
 * VIP Sender Management API
 * POST - Add a VIP sender
 * DELETE - Remove a VIP sender
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { addVipSender, removeVipSender } from '@/lib/alerts/preferences';

export async function POST(request: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { email } = await request.json();

    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    const preferences = await addVipSender(session.user.id, email);

    return NextResponse.json({
      success: true,
      vipSenders: preferences?.vipSenders || [],
    });
  } catch (error) {
    console.error('[VipAPI] POST error:', error);
    return NextResponse.json(
      { error: 'Failed to add VIP sender' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { email } = await request.json();

    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    const preferences = await removeVipSender(session.user.id, email);

    return NextResponse.json({
      success: true,
      vipSenders: preferences?.vipSenders || [],
    });
  } catch (error) {
    console.error('[VipAPI] DELETE error:', error);
    return NextResponse.json(
      { error: 'Failed to remove VIP sender' },
      { status: 500 }
    );
  }
}
