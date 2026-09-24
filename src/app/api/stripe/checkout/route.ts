import prisma from '@/lib/prisma';
import { SubscriptionTier } from '@/types/prisma';
import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { z } from 'zod';

type CheckoutPlan = 'monthly' | 'lifetime';

const checkoutRequestSchema = z.object({
  plan: z.enum(['monthly', 'lifetime']),
});

function getStripeClient() {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) throw new Error('STRIPE_SECRET_KEY is not configured');

  return new Stripe(secretKey, {
    apiVersion: '2026-06-24.dahlia',
  });
}

function getPriceId(plan: CheckoutPlan) {
  return plan === 'monthly'
    ? process.env.STRIPE_PRICE_ID_PRO_MONTHLY
    : process.env.STRIPE_PRICE_ID_LIFETIME;
}

function hasEqualOrHigherPlan(
  currentTier: SubscriptionTier,
  subscriptionStatus: string | null,
  requestedPlan: CheckoutPlan
) {
  const hasActiveAccess = subscriptionStatus === 'active' || subscriptionStatus === 'trialing';
  if (!hasActiveAccess) return false;
  if (currentTier === SubscriptionTier.LIFETIME) return true;
  return requestedPlan === 'monthly' && currentTier === SubscriptionTier.PRO;
}

export async function POST(req: Request) {
  try {
    const stripe = getStripeClient();
    const supabase = await createClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let requestBody: unknown;

    try {
      requestBody = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid plan selected' }, { status: 400 });
    }

    const parsedRequest = checkoutRequestSchema.safeParse(requestBody);

    if (!parsedRequest.success) {
      return NextResponse.json({ error: 'Invalid plan selected' }, { status: 400 });
    }

    const { plan } = parsedRequest.data;

    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
    });

    if (!dbUser) {
      return NextResponse.json({ error: 'User not found in database' }, { status: 404 });
    }

    if (hasEqualOrHigherPlan(dbUser.subscriptionTier, dbUser.subscriptionStatus, plan)) {
      return NextResponse.json({ error: 'User already has equal or higher plan' }, { status: 409 });
    }

    // Ensure customer exists in Stripe
    let customerId = dbUser.stripeCustomerId;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: dbUser.email || user.email,
        metadata: {
          userId: user.id,
        },
      });

      const updateResult = await prisma.user.updateMany({
        where: { id: user.id, stripeCustomerId: null },
        data: { stripeCustomerId: customer.id },
      });

      if (updateResult.count === 1) {
        customerId = customer.id;
      } else {
        const currentUser = await prisma.user.findUnique({
          where: { id: user.id },
          select: { stripeCustomerId: true },
        });

        if (!currentUser?.stripeCustomerId) {
          throw new Error('Unable to persist Stripe customer id');
        }

        customerId = currentUser.stripeCustomerId;

        try {
          await stripe.customers.del(customer.id);
        } catch (deleteError) {
          console.warn('Failed to delete orphaned Stripe customer:', deleteError);
        }
      }
    }

    // Determine price ID from env
    const priceId = getPriceId(plan);

    if (!priceId) {
      return NextResponse.json({ error: 'Stripe product configuration missing' }, { status: 500 });
    }

    const mode: 'subscription' | 'payment' = plan === 'monthly' ? 'subscription' : 'payment';
    const appUrl = process.env.NEXT_PUBLIC_APP_URL;

    if (!appUrl) {
      return NextResponse.json({ error: 'Application URL configuration missing' }, { status: 500 });
    }

    // Create Checkout Session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode,
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: `${appUrl}/dashboard?checkout=success`,
      cancel_url: `${appUrl}/dashboard?checkout=cancelled`,
      metadata: {
        userId: user.id,
        planType: plan,
      },
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error('Stripe Checkout Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
