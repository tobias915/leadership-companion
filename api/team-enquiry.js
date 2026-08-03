// api/team-enquiry.js
// Vercel Serverless Function for Team plan enquiries, delivered via Amazon SES

import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';

const MAX_BODY_BYTES = 10 * 1024;
const MIN_FILL_MS = 3000;
const TEAM_SIZES = ['1 to 5', '6 to 15', '16 to 30', '31 to 100', '100+'];
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Strip CR and LF so nothing the enquirer types can inject an email header
function singleLine(value) {
  return String(value).replace(/[\r\n]/g, '').trim();
}

// Notes keep their line breaks, but CR is still removed
function multiLine(value) {
  return String(value).replace(/\r/g, '').trim();
}

async function readJsonBody(req) {
  if (req.body !== undefined && req.body !== null && typeof req.body !== 'string') {
    return { value: req.body };
  }

  let raw = typeof req.body === 'string' ? req.body : '';

  if (raw === '') {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) return { tooLarge: true };
      chunks.push(chunk);
    }
    raw = Buffer.concat(chunks).toString('utf8');
  }

  if (Buffer.byteLength(raw, 'utf8') > MAX_BODY_BYTES) return { tooLarge: true };

  try {
    return { value: JSON.parse(raw) };
  } catch (error) {
    return { invalid: true };
  }
}

// Bots must never learn they were caught, so callers answer 200 and send nothing
function looksLikeBot(payload) {
  if (payload.website !== undefined && String(payload.website).trim() !== '') return true;

  const startedAt = Number(payload.startedAt);
  if (!payload.startedAt || !Number.isFinite(startedAt)) return true;
  if (Date.now() - startedAt < MIN_FILL_MS) return true;

  return false;
}

function validate(payload) {
  const name = typeof payload.name === 'string' ? payload.name.trim() : '';
  const email = typeof payload.email === 'string' ? payload.email.trim() : '';
  const phone = typeof payload.phone === 'string' ? payload.phone.trim() : '';
  const company = typeof payload.company === 'string' ? payload.company.trim() : '';
  const teamSize = typeof payload.teamSize === 'string' ? payload.teamSize.trim() : '';
  const notes = typeof payload.notes === 'string' ? payload.notes.trim() : '';

  if (!name || !email || !company || !teamSize) return null;
  if (!EMAIL_PATTERN.test(email)) return null;
  if (!TEAM_SIZES.includes(teamSize)) return null;
  if (name.length > 200 || company.length > 200) return null;
  if (email.length > 320 || notes.length > 2000) return null;
  if (phone.length > 30) return null;

  return {
    name: singleLine(name),
    email: singleLine(email),
    phone: singleLine(phone),
    company: singleLine(company),
    teamSize: singleLine(teamSize),
    notes: multiLine(notes)
  };
}

async function sendEmail({ to, replyTo, subject, text }) {
  const client = new SESClient({
    region: process.env.SES_REGION,
    credentials: {
      accessKeyId: process.env.SES_ACCESS_KEY_ID,
      secretAccessKey: process.env.SES_SECRET_ACCESS_KEY
    }
  });

  await client.send(new SendEmailCommand({
    Source: process.env.TEAM_ENQUIRY_FROM,
    Destination: { ToAddresses: [to] },
    ReplyToAddresses: [replyTo],
    Message: {
      Subject: { Data: subject, Charset: 'UTF-8' },
      Body: { Text: { Data: text, Charset: 'UTF-8' } }
    }
  }));
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false });
  }

  const contentType = req.headers['content-type'] || '';
  if (!contentType.includes('application/json')) {
    return res.status(400).json({ ok: false });
  }

  const contentLength = Number(req.headers['content-length'] || 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return res.status(400).json({ ok: false });
  }

  const parsed = await readJsonBody(req);
  if (parsed.tooLarge || parsed.invalid) {
    return res.status(400).json({ ok: false });
  }

  const payload = parsed.value;
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return res.status(400).json({ ok: false });
  }

  if (looksLikeBot(payload)) {
    return res.status(200).json({ ok: true });
  }

  const enquiry = validate(payload);
  if (!enquiry) {
    return res.status(400).json({ ok: false });
  }

  const notification = [
    'Someone has requested information about Leadership Companion for their team.',
    '',
    'Name: ' + enquiry.name,
    'Email: ' + enquiry.email,
    'Phone: ' + (enquiry.phone || 'Not provided'),
    'Company: ' + enquiry.company,
    'Team size: ' + enquiry.teamSize,
    'Notes: ' + (enquiry.notes || 'None')
  ].join('\n');

  try {
    await sendEmail({
      to: process.env.TEAM_ENQUIRY_TO,
      replyTo: enquiry.email,
      subject: 'Team enquiry: ' + enquiry.company + ' (' + enquiry.teamSize + ' leaders)',
      text: notification
    });
  } catch (error) {
    console.error('Team enquiry notification failed:', error);
    return res.status(500).json({ ok: false });
  }

  if (process.env.TEAM_ENQUIRY_AUTOREPLY === 'true') {
    try {
      await sendEmail({
        to: enquiry.email,
        replyTo: process.env.TEAM_ENQUIRY_TO,
        subject: 'We have your Leadership Companion enquiry',
        text: 'Hi ' + enquiry.name + ', thanks for getting in touch about Leadership Companion for your team. One of our team members will come back to you within one business day. If it is easier, just reply to this email with any extra detail. The Leadership Companion team.'
      });
    } catch (error) {
      // An auto-reply failure must not fail an enquiry we have already received
      console.error('Team enquiry auto-reply failed:', error);
    }
  }

  return res.status(200).json({ ok: true });
}
