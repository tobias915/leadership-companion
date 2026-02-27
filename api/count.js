// /api/count.js
// Vercel Serverless Function — Returns the current signup count
// Used by the spots counter on the landing page

const { google } = require('googleapis');

// Cache the count for 60 seconds to avoid hammering the Sheets API
let cachedCount = null;
let cacheTimestamp = 0;
const CACHE_TTL = 60 * 1000; // 60 seconds

module.exports = async (req, res) => {
  // Allow GET only
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');

  const now = Date.now();

  // Return cached count if fresh
  if (cachedCount !== null && (now - cacheTimestamp) < CACHE_TTL) {
    return res.status(200).json({ count: cachedCount });
  }

  try {
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_CLIENT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      },
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });

    const sheets = google.sheets({ version: 'v4', auth });

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: 'Sheet1!A:A', // Just the first column (timestamps) to count rows
    });

    const rows = response.data.values || [];
    // Subtract 1 for the header row (if you have one), otherwise use rows.length
    const count = Math.max(0, rows.length - 1);

    // Update cache
    cachedCount = count;
    cacheTimestamp = now;

    return res.status(200).json({ count });
  } catch (error) {
    console.error('Count API error:', error);
    // Return cached count if available, even if stale
    if (cachedCount !== null) {
      return res.status(200).json({ count: cachedCount });
    }
    return res.status(500).json({ error: 'Failed to get count', count: 0 });
  }
};
