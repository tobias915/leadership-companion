// /api/stripe-webhook.js
// Vercel Serverless Function — Handles Stripe webhook events
// Logs successful card captures to Google Sheets

const Stripe = require('stripe');
const { google } = require('googleapis');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Raw body parsing for Stripe webhook signature verification
module.exports.config = {
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

// Google Sheets helper — same pattern as your existing /api/submit
async function appendToSheet(rowData) {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_CLIENT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  const sheets = google.sheets({ version: 'v4', auth });

  await sheets.spreadsheets.values.append({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: 'Sheet1!A:J',
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [rowData],
    },
  });
}

module.exports = async (req, res) => {
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
      const stripeCustomerId = session.customer || '';
      const setupIntentId = session.setup_intent || '';

      try {
        // Log to Google Sheets — same format as your waitlist entries
        // Columns: Timestamp, Email, Tier, UTM Source, UTM Medium, UTM Campaign, UTM Content, Stripe Customer ID, Setup Intent ID, Card Captured
        const timestamp = new Date().toISOString();
        await appendToSheet([
          timestamp,
          email,
          tier,
          utmSource,
          utmMedium,
          utmCampaign,
          utmContent,
          stripeCustomerId,
          setupIntentId,
          'YES — card captured',
        ]);

        console.log(`✅ Founding member logged: ${email} (${tier})`);
      } catch (sheetError) {
        // Don't fail the webhook if Sheets logging fails
        // The card is still captured in Stripe
        console.error('Google Sheets logging failed:', sheetError);
      }
    }
  }

  // Always return 200 to acknowledge receipt
  return res.status(200).json({ received: true });
};
