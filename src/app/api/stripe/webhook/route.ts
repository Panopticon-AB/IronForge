import { getErrorMessage } from '@/lib/error-message';
import prisma from '@/lib/prisma';
import { SubscriptionTier } from '@/types/prisma';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import Stripe from 'stripe';

type StripeSubscriptionWithPeriod = Stripe.Subscription & {
  current_period_end?: number;
};

function getStripeClient() {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) throw new Error('STRIPE_SECRET_KEY is not configured');

  return new Stripe(secretKey, {
    apiVersion: '2026-04-22.dahlia',
  });
}

function getWebhookSecret() {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) throw new Error('STRIPE_WEBHOOK_SECRET is not configured');

  return webhookSecret;
}

export async function POST(req: Request) {
  try {
    const stripe = getStripeClient();
    const body = await req.text();
    const signature = (await headers()).get('stripe-signature');

    if (!signature) {
      return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 });
    }

    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(body, signature, getWebhookSecret());
    } catch (err) {
      console.error(`Webhook signature verification failed: ${getErrorMessage(err)}`);
      return NextResponse.json({ error: 'Webhook signature verification failed' }, { status: 400 });
    }

    // Handle the event
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.userId;
        const planType = session.metadata?.planType; // 'monthly' | 'lifetime'

        if (userId && (planType === 'monthly' || planType === 'lifetime')) {
          const tier = planType === 'lifetime' ? SubscriptionTier.LIFETIME : SubscriptionTier.PRO;

          await prisma.user.update({
            where: { id: userId },
            data: {
              subscriptionTier: tier,
              subscriptionStatus: 'active',
              // Lifetime access has no expiry, Pro could rely on subscription updates
              subscriptionExpiry: planType === 'lifetime' ? null : undefined,
            },
          });
        }
        break;
      }
      case 'customer.subscription.deleted':
      case 'customer.subscription.updated': {
        const subscription = event.data.object as StripeSubscriptionWithPeriod;
        const customerId = subscription.customer as string;

        if (customerId) {
          const status = subscription.status;
          const currentPeriodEnd = subscription.current_period_end
            ? new Date(subscription.current_period_end * 1000)
            : null;
          const user = await prisma.user.findUnique({
            where: { stripeCustomerId: customerId },
            select: { subscriptionTier: true },
          });

          if (!user) break;

          const subscriptionTier =
            user.subscriptionTier === SubscriptionTier.LIFETIME
              ? {}
              : {
                  subscriptionTier:
                    status === 'active' || status === 'trialing'
                      ? SubscriptionTier.PRO
                      : SubscriptionTier.FREE,
                };

          // Update the user linked to this Stripe customer
          await prisma.user.update({
            where: { stripeCustomerId: customerId },
            data: {
              subscriptionStatus: status,
              subscriptionExpiry: currentPeriodEnd,
              // If canceled/unpaid, revert to FREE (could implement grace period logic)
              ...subscriptionTier,
            },
          });
        }
        break;
      }
      default:
        console.log(`Unhandled event type ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error('Webhook Error:', err);
    return NextResponse.json({ error: 'Webhook handler failed' }, { status: 500 });
  }
}
