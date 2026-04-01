const fs = require('fs');
const path = require('path');
const jobService = require('./jobs');
const { sendEmail } = require('./email');
const { CODE_REFERENCE } = require('./supplement-document');

/**
 * Build the supplement email draft data for a job.
 * Returns everything needed to send or preview the email.
 *
 * @param {string} jobId
 * @param {Object} comparison - output from compareScopes()
 * @param {Object} pdfInfo - { filename, filepath, documentId }
 * @returns {Object} email draft with subject, body, attachment info
 */
function buildSupplementEmailDraft(jobId, comparison, pdfInfo) {
  const job = jobService.getJobById(jobId);
  if (!job) throw new Error('Job not found');

  const allGapItems = [...comparison.missingItems, ...comparison.quantityGaps];
  const adjusterName = job.adjuster?.name || 'Claims Adjuster';
  const adjusterEmail = job.adjuster?.email || '';

  // Build line item summary with IRC citations
  const itemLines = allGapItems.map(item => {
    const info = CODE_REFERENCE[item.code] || { description: item.code, irc: '—', reason: '' };
    const label = item.carrierQty === 0 ? 'OMITTED' : `UNDER-SCOPED (${item.carrierQty} → ${item.crcQty} ${item.unit})`;
    return { code: item.code, description: info.description, irc: info.irc, reason: info.reason, label, gapQty: item.gapQty, unit: item.unit };
  });

  const subject = `Supplement Request — ${job.address} — Claim #${job.claimNumber || 'N/A'}`;

  const textBody = buildTextBody(job, adjusterName, itemLines, comparison);
  const htmlBody = buildHtmlBody(job, adjusterName, itemLines, comparison);

  const draft = {
    jobId: job.id,
    to: adjusterEmail,
    from: 'claims@columbusroofingco.com',
    subject,
    textBody,
    htmlBody,
    attachment: pdfInfo ? {
      filename: `Supplement Request - ${job.address}.pdf`,
      filepath: pdfInfo.filepath,
      documentId: pdfInfo.documentId
    } : null,
    estimatedValue: comparison.estimatedSupplementValue,
    totalGapItems: allGapItems.length,
    createdAt: new Date().toISOString()
  };

  // Store draft on job record
  jobService.updateJob(job.id, { supplementEmailDraft: draft });

  console.log(`[Supplement] Email draft prepared for job ${jobId} → ${adjusterEmail || '(no adjuster email)'}`);
  return draft;
}

function buildTextBody(job, adjusterName, itemLines, comparison) {
  let text = `${adjusterName},\n\n`;
  text += `Re: ${job.address} — Claim #${job.claimNumber || 'N/A'} — ${job.carrier || 'Carrier'}\n\n`;
  text += `After a thorough review of the carrier's scope of loss against our field inspection findings, `;
  text += `Columbus Roofing Company has identified ${itemLines.length} line item(s) that were either omitted `;
  text += `or under-scoped in the original estimate. `;
  text += `We are requesting supplemental consideration for the following items:\n\n`;

  for (const item of itemLines) {
    text += `  ${item.code} — ${item.description}\n`;
    text += `    ${item.label} | ${item.gapQty} ${item.unit}\n`;
    text += `    IRC/OSHA Reference: ${item.irc}\n`;
    text += `    Justification: ${item.reason}\n\n`;
  }

  text += `Estimated Supplement Value: $${comparison.estimatedSupplementValue.toLocaleString('en-US', { minimumFractionDigits: 2 })}\n\n`;
  text += `The attached supplement estimate document provides a full breakdown with code references and justifications. `;
  text += `We respectfully request that these items be reviewed and added to the approved scope.\n\n`;
  text += `Please do not hesitate to reach out with any questions or to schedule a re-inspection.\n\n`;
  text += `Respectfully,\n`;
  text += `Columbus Roofing Company\n`;
  text += `claims@columbusroofingco.com\n`;
  text += `(614) 743-1481\n`;

  return text;
}

function buildHtmlBody(job, adjusterName, itemLines, comparison) {
  const itemRows = itemLines.map(item => `
    <tr>
      <td style="padding:8px 10px;border-bottom:1px solid #eee;font-weight:700;font-size:13px">${item.code}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #eee;font-size:13px">${item.description}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #eee;font-size:13px;text-align:right">${item.gapQty} ${item.unit}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #eee;font-size:13px;font-weight:700">${item.irc}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #eee;font-size:12px;color:#555">${item.reason}</td>
    </tr>`).join('');

  return `<div style="font-family:'Inter',Helvetica,Arial,sans-serif;max-width:700px;margin:0 auto;padding:0;background:#ffffff">
  <div style="padding:24px;border-bottom:2px solid #111">
    <div style="font-size:14px;font-weight:900;letter-spacing:2px;color:#111">COLUMBUS ROOFING COMPANY</div>
    <div style="font-size:11px;color:#666;margin-top:4px">(614) 743-1481 &nbsp;|&nbsp; claims@columbusroofingco.com</div>
  </div>
  <div style="padding:28px 24px">
    <p style="font-size:14px;color:#111;margin:0 0 6px">${adjusterName},</p>
    <p style="font-size:13px;color:#333;line-height:1.6;margin:12px 0 20px">
      Re: <strong>${job.address}</strong> — Claim #${job.claimNumber || 'N/A'} — ${job.carrier || 'Carrier'}
    </p>
    <p style="font-size:13px;color:#333;line-height:1.6;margin:0 0 20px">
      After a thorough review of the carrier's scope of loss against our field inspection findings,
      Columbus Roofing Company has identified <strong>${itemLines.length} line item(s)</strong> that were either
      omitted or under-scoped in the original estimate. We are requesting supplemental consideration
      for the following items:
    </p>
    <table style="width:100%;border-collapse:collapse;margin:20px 0">
      <thead>
        <tr style="background:#f7f7f7">
          <th style="padding:8px 10px;text-align:left;font-size:11px;font-weight:800;letter-spacing:0.5px;border-bottom:2px solid #ddd">CODE</th>
          <th style="padding:8px 10px;text-align:left;font-size:11px;font-weight:800;letter-spacing:0.5px;border-bottom:2px solid #ddd">DESCRIPTION</th>
          <th style="padding:8px 10px;text-align:right;font-size:11px;font-weight:800;letter-spacing:0.5px;border-bottom:2px solid #ddd">QTY</th>
          <th style="padding:8px 10px;text-align:left;font-size:11px;font-weight:800;letter-spacing:0.5px;border-bottom:2px solid #ddd">IRC REF</th>
          <th style="padding:8px 10px;text-align:left;font-size:11px;font-weight:800;letter-spacing:0.5px;border-bottom:2px solid #ddd">JUSTIFICATION</th>
        </tr>
      </thead>
      <tbody>
        ${itemRows}
      </tbody>
    </table>
    <div style="text-align:right;padding:16px 0;border-top:2px solid #111">
      <span style="font-size:15px;font-weight:800">Estimated Supplement Value: $${comparison.estimatedSupplementValue.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
      <div style="font-size:10px;color:#999;margin-top:4px">Based on OHCO8X MAR26 reference pricing. Actual values determined by Xactimate.</div>
    </div>
    <p style="font-size:13px;color:#333;line-height:1.6;margin:24px 0 12px">
      The attached supplement estimate document provides a full breakdown with code references and justifications.
      We respectfully request that these items be reviewed and added to the approved scope.
    </p>
    <p style="font-size:13px;color:#333;line-height:1.6;margin:0 0 20px">
      Please do not hesitate to reach out with any questions or to schedule a re-inspection.
    </p>
    <p style="font-size:13px;color:#111;margin:0">Respectfully,</p>
    <p style="font-size:13px;font-weight:700;color:#111;margin:4px 0 0">Columbus Roofing Company</p>
  </div>
  <div style="padding:16px 24px;border-top:1px solid #e5e5e5">
    <p style="font-size:11px;color:#999;margin:0">claims@columbusroofingco.com &nbsp;|&nbsp; (614) 743-1481</p>
  </div>
</div>`;
}

/**
 * Send the supplement email for a job.
 * Uses the stored draft or builds a new one.
 *
 * @param {string} jobId
 * @returns {Object} send result
 */
async function sendSupplementEmail(jobId) {
  const job = jobService.getJobById(jobId);
  if (!job) throw new Error('Job not found');

  const draft = job.supplementEmailDraft;
  if (!draft) throw new Error('No supplement email draft found — run scope comparison first');

  if (!draft.to) {
    return { success: false, reason: 'No adjuster email on file' };
  }

  // Build SendGrid message with attachment
  const msg = {
    to: draft.to,
    subject: draft.subject,
    text: draft.textBody,
    html: draft.htmlBody
  };

  // Attach PDF if available
  if (draft.attachment?.filepath && fs.existsSync(draft.attachment.filepath)) {
    const pdfContent = fs.readFileSync(draft.attachment.filepath).toString('base64');
    msg.attachments = [{
      content: pdfContent,
      filename: draft.attachment.filename,
      type: 'application/pdf',
      disposition: 'attachment'
    }];
  }

  const result = await sendEmail(msg);

  if (result.success) {
    jobService.updateJob(jobId, {
      supplementEmailSentAt: new Date().toISOString(),
      supplementEmailDraft: { ...draft, sentAt: new Date().toISOString() }
    });
    console.log(`[Supplement] Email sent for job ${jobId} → ${draft.to}`);
  }

  return result;
}

module.exports = { buildSupplementEmailDraft, sendSupplementEmail };
