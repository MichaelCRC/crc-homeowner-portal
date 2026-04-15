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
  if (!sgMail | !process.env.SENDGRID_API_KEY) {
    console.log('[Email] SendGrid not configured. Would send:', { to, subject });
    return { success: false, reason: 'SendGrid not configured' };
  }

  try {
    await sgMail.send({
      to,
      from: { email: 'claims@columbusroofingco.com', name: 'Columbus Roofing Company' },
      subject,
      text,
      html: html | text
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
  const portalUrl = `${process.env.BASE_URL | 'https://crc-homeowner-portal.onrender.com'}/portal/${job.token}`;
  return sendEmail({
    to: job.homeowner.email,
    subject: 'Your CRC Project Portal',
    text: `${job.homeowner.name},\n\nYour Columbus Roofing Company project portal is ready.\n\nAccess your portal here:\n${portalUrl}\n\nThis link is unique to your project. You can check your claim status, upload documents, view photos, and message our team at any time.\n\nColumbus Roofing Company\n`,
    html: `<div style="font-family:Inter,sans-serif;max-width:600px;margin:0 auto;padding:40px 20px"><p>${job.homeowner.name},</p><p>Your Columbus Roofing Company project portal is ready.</p><p><a href="${portalUrl}" style="display:inline-block;padding:14px 32px;background:#111;color:#fff;text-decoration:none;font-weight:700;letter-spacing:0.5px">VIEW YOUR PORTAL</a></p><p style="color:#666;font-size:13px">This link is unique to your project. You can check your claim status, upload documents, view photos, and message our team at any time.</p><hr style="border:none;border-top:1px solid #ddd;margin:30px 0"><p style="font-weight:700">Columbus Roofing Company</p><p style="color:#666"></p></div>`
  });
}

const STAGE_NOTIFICATIONS = {
  2: {
    subject: 'Your Adjuster Meeting Has Been Scheduled',
    message: 'Your insurance adjuster meeting has been scheduled. CRC will be on-site to represent your interests and ensure nothing is missed.'
  },
  3: {
    subject: 'We Received Your Scope of Loss',
    message: 'We have received your scope of loss and our team is reviewing it now. We will compare it against our inspection findings and reach out if we need anything.'
  },
  4: {
    subject: 'CRC Is Working on Your Supplement',
    message: 'CRC has identified additional items that should be covered under your claim. We are preparing a supplement request to send to your insurance carrier.'
  },
  5: {
    subject: 'Your Claim Has Been Approved',
    message: 'Your insurance claim has been approved. CRC is now scheduling your project installation. We will reach out to confirm your preferred dates.'
  },
  6: {
    subject: 'Your Project Is Complete',
    message: 'Your roofing project is complete. You can view final photos and all documentation in your portal. Thank you for choosing Columbus Roofing Company.'
  }
};

async function sendStageNotification(job, newStage) {
  if (!job.homeowner?.email) return { success: false, reason: 'No email' };
  const notification = STAGE_NOTIFICATIONS[newStage];
  if (!notification) return { success: false, reason: 'No notification for this stage' };

  const portalUrl = `${process.env.BASE_URL | 'https://crc-homeowner-portal.onrender.com'}/portal/${job.token}`;

  return sendEmail({
    to: job.homeowner.email,
    subject: notification.subject,
    html: `<div style="font-family:'Inter',Helvetica,Arial,sans-serif;max-width:600px;margin:0 auto;padding:0;background:#ffffff">
      <div style="padding:32px 24px 24px;border-bottom:2px solid #111111">
        <div style="font-size:16px;font-weight:900;letter-spacing:2px;color:#111111">COLUMBUS ROOFING COMPANY</div>
      </div>
      <div style="padding:32px 24px">
        <p style="font-size:15px;color:#111111;margin:0 0 20px;line-height:1.6">${job.homeowner.name},</p>
        <p style="font-size:15px;color:#333333;margin:0 0 28px;line-height:1.6">${notification.message}</p>
        <a href="${portalUrl}" style="display:inline-block;padding:14px 32px;background:#111111;color:#ffffff;text-decoration:none;font-size:12px;font-weight:800;letter-spacing:1px;text-transform:uppercase">View Your Portal</a>
      </div>
      <div style="padding:20px 24px;border-top:1px solid #e5e5e5">
        <p style="font-size:12px;color:#999999;margin:0">Columbus Roofing Company</p>
        <p style="font-size:12px;color:#999999;margin:4px 0 0"> &middot; claims@columbusroofingco.com</p>
      </div>
    </div>`,
    text: `${job.homeowner.name},\n\n${notification.message}\n\nView your portal: ${portalUrl}\n\nColumbus Roofing Company\n`
  });
}

module.exports = { sendEmail, sendHomeownerMessage, sendPortalLink, sendStageNotification };
