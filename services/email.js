let sgMail;
try {
  sgMail = require('@sendgrid/mail');
  if (process.env.SENDGRID_API_KEY) {
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);
  }
} catch {
  sgMail = null;
}

async function sendEmail({ to, subject, text, html }) {
  if (!sgMail || !process.env.SENDGRID_API_KEY) {
    console.log('[Email] SendGrid not configured. Would send:', { to, subject });
    return { success: false, reason: 'SendGrid not configured' };
  }

  try {
    await sgMail.send({
      to,
      from: { email: 'claims@columbusroofingco.com', name: 'Columbus Roofing Company' },
      subject,
      text,
      html: html || text
    });
    return { success: true };
  } catch (err) {
    console.error('[Email] Send error:', err.message);
    return { success: false, reason: err.message };
  }
}

async function sendHomeownerMessage(job, messageBody) {
  return sendEmail({
    to: 'claims@columbusroofingco.com',
    subject: `Homeowner Message — ${job.address} — ${job.homeowner.name}`,
    text: `Message from ${job.homeowner.name} (${job.homeowner.email}):\n\n${messageBody}\n\nJob: ${job.address}\nClaim: ${job.claimNumber}\nCarrier: ${job.carrier}`,
    html: `<p><strong>Message from ${job.homeowner.name}</strong> (${job.homeowner.email}):</p><p>${messageBody}</p><hr><p>Job: ${job.address}<br>Claim: ${job.claimNumber}<br>Carrier: ${job.carrier}</p>`
  });
}

async function sendPortalLink(job) {
  const portalUrl = `${process.env.BASE_URL || 'https://crc-homeowner-portal.onrender.com'}/portal/${job.token}`;
  return sendEmail({
    to: job.homeowner.email,
    subject: 'Your CRC Project Portal',
    text: `${job.homeowner.name},\n\nYour Columbus Roofing Company project portal is ready.\n\nAccess your portal here:\n${portalUrl}\n\nThis link is unique to your project. You can check your claim status, upload documents, view photos, and message our team at any time.\n\nColumbus Roofing Company\n614-907-4CRC`,
    html: `<div style="font-family:Inter,sans-serif;max-width:600px;margin:0 auto;padding:40px 20px"><p>${job.homeowner.name},</p><p>Your Columbus Roofing Company project portal is ready.</p><p><a href="${portalUrl}" style="display:inline-block;padding:14px 32px;background:#111;color:#fff;text-decoration:none;font-weight:700;letter-spacing:0.5px">VIEW YOUR PORTAL</a></p><p style="color:#666;font-size:13px">This link is unique to your project. You can check your claim status, upload documents, view photos, and message our team at any time.</p><hr style="border:none;border-top:1px solid #ddd;margin:30px 0"><p style="font-weight:700">Columbus Roofing Company</p><p style="color:#666">614-907-4CRC</p></div>`
  });
}

module.exports = { sendEmail, sendHomeownerMessage, sendPortalLink };
