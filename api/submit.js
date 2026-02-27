// api/submit.js
// Vercel Serverless Function for secure form submission

export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { email, tier, utmData, pageUrl } = req.body;

    // Server-side validation
    if (!email || !email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
      return res.status(400).json({ error: 'Invalid email address' });
    }

    if (!['waitlist', 'starter', 'founding_pro', 'starter_PENDING', 'founding_pro_PENDING'].includes(tier)) {
      return res.status(400).json({ error: 'Invalid tier' });
    }

    const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;

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
    formData.append(SOURCE_FIELD_ID, 'founding_member');
    formData.append(UTM_SOURCE_FIELD_ID, utmData?.utm_source || '');
    formData.append(UTM_MEDIUM_FIELD_ID, utmData?.utm_medium || '');
    formData.append(UTM_CAMPAIGN_FIELD_ID, utmData?.utm_campaign || '');
    formData.append(UTM_CONTENT_FIELD_ID, utmData?.utm_content || '');
    formData.append(PAGE_URL_FIELD_ID, pageUrl || '');

    const response = await fetch(
      `https://docs.google.com/forms/d/e/${GOOGLE_FORM_ID}/formResponse`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData.toString(),
      }
    );

    return res.status(200).json({ 
      success: true, 
      message: 'Successfully joined waitlist' 
    });

  } catch (error) {
    console.error('Form submission error:', error);
    return res.status(500).json({ 
      error: 'Failed to submit form',
      message: 'Please try again later' 
    });
  }
}