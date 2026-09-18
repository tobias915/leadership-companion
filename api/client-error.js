// api/client-error.js
// Vercel Serverless Function that records client side crashes reported by the
// beacon in each page head. It stores nothing, reads no cookies, and always
// answers 204 so a reporting failure can never become a second failure.

const MAX_BODY_BYTES = 4 * 1024;
const MAX_MESSAGE_CHARS = 300;
const MAX_STACK_CHARS = 1000;
const MAX_UA_CHARS = 300;
const MAX_PATH_CHARS = 200;

// navigator.sendBeacon posts text/plain by default. Rather than fight the
// content type, the body is read as raw text and parsed here.
async function readRawBody(req) {
  if (typeof req.body === 'string') {
    return req.body.slice(0, MAX_BODY_BYTES);
  }

  if (req.body !== undefined && req.body !== null && typeof req.body === 'object') {
    try {
      return JSON.stringify(req.body).slice(0, MAX_BODY_BYTES);
    } catch (error) {
      return '';
    }
  }

  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    chunks.push(chunk);
    size += chunk.length;
    // Keep the first 4KB rather than discarding an oversize report outright,
    // since the head of the message is the part worth reading
    if (size >= MAX_BODY_BYTES) break;
  }

  return Buffer.concat(chunks).toString('utf8').slice(0, MAX_BODY_BYTES);
}

// Collapses to one line so a stack can never break the log into several entries
function oneLine(value, limit) {
  if (value === undefined || value === null) return '';
  return String(value).replace(/[\r\n]+/g, ' | ').trim().slice(0, limit);
}

// Query strings can carry a referral code or an email, so only the path is kept
function pathOnly(value) {
  const raw = oneLine(value, MAX_PATH_CHARS);
  if (raw === '') return '';
  const cut = raw.split('?')[0].split('#')[0];
  return cut.slice(0, MAX_PATH_CHARS);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(204).end();
    return;
  }

  try {
    const raw = await readRawBody(req);

    let payload = {};
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') payload = parsed;
    } catch (error) {
      payload = { message: raw };
    }

    const entry = {
      message: oneLine(payload.message, MAX_MESSAGE_CHARS),
      stack: oneLine(payload.stack, MAX_STACK_CHARS),
      path: pathOnly(payload.path),
      userAgent: oneLine(payload.userAgent || req.headers['user-agent'], MAX_UA_CHARS),
      cookieEnabled: payload.cookieEnabled === true,
      storageOk: payload.storageOk === true,
      at: oneLine(payload.at, 40) || new Date().toISOString()
    };

    console.error('[client-error] ' + JSON.stringify(entry));
  } catch (error) {
    // A malformed report is still worth one line, but never worth a 500
    console.error('[client-error] ' + JSON.stringify({ message: 'unreadable report', at: new Date().toISOString() }));
  }

  res.status(204).end();
}
