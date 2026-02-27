// /api/create-checkout.js
// Vercel Serverless Function — Creates a Stripe Checkout Session in "setup" mode
// Card is captured but NOT charged until launch.

const Stripe = require('stripe');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

module.exports = async (req, res) => {
  // Only allow POST
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { email, tier, utmData } = req.body;

    if (!email || !tier) {
      return res.status(400).json({ error: 'Email and tier are required' });
    }

    if (!['starter', 'founding_pro'].includes(tier)) {
      return res.status(400).json({ error: 'Invalid tier for checkout' });
    }

    // Determine the price display for the checkout page
    const tierConfig = {
      starter: {
        name: 'Founding Starter — $29 AUD/month (locked for life)',
        description: 'Your card will be saved securely. You will NOT be charged until we launch. Your founding rate of $29/month is locked in for life.',
        amount: 2900, // in cents, for display only
      },
      founding_pro: {
        name: 'Founding Pro — $49 AUD/month (first year, then $59)',
        description: 'Your card will be saved securely. You will NOT be charged until we launch. Your founding rate of $49/month is locked in for the first year.',
        amount: 4900, // in cents, for display only
      },
    };

    const config = tierConfig[tier];

    // Create a Stripe Checkout Session in "setup" mode
    // This captures the payment method WITHOUT charging
    const session = await stripe.checkout.sessions.create({
      mode: 'setup',
      payment_method_types: ['card'],
      customer_email: email,
      metadata: {
        tier: tier,
        utm_source: utmData?.utm_source || '',
        utm_medium: utmData?.utm_medium || '',
        utm_campaign: utmData?.utm_campaign || '',
        utm_content: utmData?.utm_content || '',
        signup_timestamp: new Date().toISOString(),
      },
      custom_text: {
        submit: {
          message: `You will NOT be charged today. Your card is saved securely and will only be charged when Leadership Companion launches. ${tier === 'starter' ? '$29 AUD/month locked for life.' : '$49 AUD/month for your first year (then $59).'}`,
        },
      },
      success_url: `${process.env.DOMAIN_URL || 'https://leadershipcompanion.co'}/success.html?tier=${tier}&email={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.DOMAIN_URL || 'https://leadershipcompanion.co'}/#founding-members`,
    });

    return res.status(200).json({ url: session.url });
  } catch (error) {
    console.error('Stripe checkout error:', error);
    return res.status(500).json({ error: 'Failed to create checkout session' });
  }
};
