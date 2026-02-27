// api/stripe-webhook.js
// Vercel Serverless Function — Handles Stripe webhook events
// Logs successful card captures to Google Form (same method as submit.js)

const Stripe = require('stripe');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Raw body parsing for Stripe webhook signature verification
export const config = {
  api: {
    bodyParser: false,
  },
};

// Helper to get raw body from request
function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const rawBody = await getRawBody(req);
  const sig = req.headers['stripe-signature'];

  let event;

  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).json({ error: `Webhook Error: ${err.message}` });
  }

  // Handle the checkout.session.completed event
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;

    // Only process setup mode sessions (our card capture flow)
    if (session.mode === 'setup') {
      const email = session.customer_email || session.customer_details?.email || 'unknown';
      const tier = (session.metadata?.tier || 'unknown') + '_CONFIRMED';
      const utmSource = session.metadata?.utm_source || '';
      const utmMedium = session.metadata?.utm_medium || '';
      const utmCampaign = session.metadata?.utm_campaign || '';
      const utmContent = session.metadata?.utm_content || '';
      const setupIntentId = session.setup_intent || '';

      try {
        // Log to Google Form — same method as submit.js
        const GOOGLE_FORM_ID = process.env.GOOGLE_FORM_ID;
        const EMAIL_FIELD_ID = process.env.EMAIL_FIELD_ID;
        const TIER_FIELD_ID = process.env.TIER_FIELD_ID;
        const SOURCE_FIELD_ID = process.env.SOURCE_FIELD_ID;
        const UTM_SOURCE_FIELD_ID = process.env.UTM_SOURCE_FIELD_ID;
        const UTM_MEDIUM_FIELD_ID = process.env.UTM_MEDIUM_FIELD_ID;
        const UTM_CAMPAIGN_FIELD_ID = process.env.UTM_CAMPAIGN_FIELD_ID;
        const UTM_CONTENT_FIELD_ID = process.env.UTM_CONTENT_FIELD_ID;
        const PAGE_URL_FIELD_ID = process.env.PAGE_URL_FIELD_ID;

        const formData = new URLSearchParams();
        formData.append(EMAIL_FIELD_ID, email);
        formData.append(TIER_FIELD_ID, tier);
        formData.append(SOURCE_FIELD_ID, 'stripe_webhook');
        formData.append(UTM_SOURCE_FIELD_ID, utmSource);
        formData.append(UTM_MEDIUM_FIELD_ID, utmMedium);
        formData.append(UTM_CAMPAIGN_FIELD_ID, utmCampaign);
        formData.append(UTM_CONTENT_FIELD_ID, utmContent);
        formData.append(PAGE_URL_FIELD_ID, `setup_intent:${setupIntentId}`);

        await fetch(
          `https://docs.google.com/forms/d/e/${GOOGLE_FORM_ID}/formResponse`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: formData.toString(),
          }
        );

        console.log(`Founding member logged: ${email} (${tier})`);
      } catch (formError) {
        // Don't fail the webhook if form logging fails
        console.error('Google Form logging failed:', formError);
      }
    }
  }

  // Always return 200 to acknowledge receipt
  return res.status(200).json({ received: true });
}