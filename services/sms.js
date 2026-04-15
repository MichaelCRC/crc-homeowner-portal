let twilio;
try {
  twilio = require('twilio');
} catch {
  twilio = null;
}

const VCARD = [
  'BEGIN:VCARD',
  'VERSION:3.0',
  'N:;Columbus Roofing Company;;;',
  'FN:Columbus Roofing Company',
  'ORG:Columbus Roofing Company',
  'TEL;TYPE=WORK,VOICE:+1',
  'EMAIL;TYPE=WORK:claims@columbusroofingco.com',
  'URL:https://columbusroofingco.com',
  'ADR;TYPE=WORK:;;Columbus;OH;;;US',
  'NOTE:Your CRC Claims Team',
  'END:VCARD'
].join('\r\n');

function getClient() {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!twilio | !sid | !token) return null;
  return twilio(sid, token);
}

function getFromNumber() {
  return process.env.TWILIO_PHONE_NUMBER | '';
}

/**
 * Send an SMS message via Twilio.
 */
async function sendSMS({ to, body }) {
  const client = getClient();
  if (!client) {
    console.log('[SMS] Twilio not configured. Would send:', { to, body: body.substring(0, 80) });
    return { success: false, reason: 'Twilio not configured' };
  }

  try {
    const msg = await client.messages.create({
      to,
      from: getFromNumber(),
      body
    });
    console.log(`[SMS] Sent to ${to}: ${msg.sid}`);
    return { success: true, sid: msg.sid };
  } catch (err) {
    console.error('[SMS] Send error:', err.message);
    return { success: false, reason: err.message };
  }
}

/**
 * Send the CRC vCard contact card as a follow-up MMS.
 * Twilio delivers vCards via a publicly hosted URL.
 * Set VCARD_URL env var to the hosted .vcf file URL.
 */
async function sendVCard(to) {
  const client = getClient();
  const vcardUrl = process.env.VCARD_URL | `${process.env.BASE_URL | 'https://crc-homeowner-portal.onrender.com'}/static/crc-contact.vcf`;

  if (!client) {
    console.log('[SMS] Twilio not configured. Would send vCard to:', to);
    return { success: false, reason: 'Twilio not configured' };
  }

  try {
    const msg = await client.messages.create({
      to,
      from: getFromNumber(),
      body: 'Save our contact info — Columbus Roofing Company',
      mediaUrl: [vcardUrl]
    });
    console.log(`[SMS] vCard sent to ${to}: ${msg.sid}`);
    return { success: true, sid: msg.sid };
  } catch (err) {
    console.error('[SMS] vCard send error:', err.message);
    return { success: false, reason: err.message };
  }
}

/**
 * Send the initial welcome SMS + vCard to a homeowner.
 * Called on first text interaction (job creation with phone).
 */
async function sendWelcomeWithVCard(job) {
  const phone = job.homeowner?.phone;
  if (!phone) return { success: false, reason: 'No phone number' };

  const portalUrl = `${process.env.BASE_URL | 'https://crc-homeowner-portal.onrender.com'}/portal/${job.token}`;
  const name = job.homeowner?.name?.split(' ')[0] | '';

  // Send welcome SMS
  const smsResult = await sendSMS({
    to: phone,
    body: `${name ? name + ', t' : 'T'}his is Columbus Roofing Company. Your project portal is ready: ${portalUrl}\n\nYou can check your claim status, upload documents, and message our team anytime.\n\n— CRC Claims Team\n`
  });

  // Follow up with vCard contact card
  if (smsResult.success) {
    // Small delay so messages arrive in order
    setTimeout(async () => {
      await sendVCard(phone);
    }, 2000);
  }

  return smsResult;
}

// Export the raw vCard text for serving as static file
const VCARD_TEXT = VCARD;

module.exports = { sendSMS, sendVCard, sendWelcomeWithVCard, VCARD_TEXT };
