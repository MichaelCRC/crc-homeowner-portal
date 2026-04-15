const express = require('express');
const router = express.Router();
const { adminAuth } = require('../middleware/auth');
const jobService = require('../services/jobs');
const emailService = require('../services/email');
const { sendSupplementEmail } = require('../services/supplement-email');
const { sendWelcomeWithVCard } = require('../services/sms');
const { reverseGeocode } = require('../services/geocode');
const { checkProximityAndBrief } = require('../services/storm-approach');

// GET /api/admin/jobs — list all jobs
router.get('/jobs', adminAuth, (req, res) => {
  const jobs = jobService.getAllJobs();
  res.json(jobs.map(j => ({
    id: j.id,
    token: j.token,
    address: j.address,
    homeowner: j.homeowner,
    carrier: j.carrier,
    claimNumber: j.claimNumber,
    stage: j.stage,
    stageLabel: jobService.STAGES.find(s => s.id === j.stage)?.label || 'Unknown',
    documentsCount: j.documents.length,
    messagesCount: j.messages.length,
    createdAt: j.createdAt,
    updatedAt: j.updatedAt
  })));
});

// GET /api/admin/jobs/:id — single job full detail
router.get('/jobs/:id', adminAuth, (req, res) => {
  const job = jobService.getJobById(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  res.json(job);
});

// POST /api/admin/jobs — create job
router.post('/jobs', adminAuth, async (req, res) => {
  const job = jobService.createJob(req.body);

  // Send portal link if email provided
  if (job.homeowner.email) {
    const emailResult = await emailService.sendPortalLink(job);
    job._emailSent = emailResult.success;
  }

  // Send SMS welcome + vCard contact card if phone provided
  if (job.homeowner.phone) {
    sendWelcomeWithVCard(job).then(r => {
      console.log(`[SMS] Welcome + vCard for ${job.address}: ${r.success ? 'sent' : r.reason}`);
    }).catch(() => {});
  }

  // Sync to supplement portal — create matching record
  const supplementUrl = process.env.SUPPLEMENT_PORTAL_URL || 'https://crc-supplements-portal.onrender.com';
  fetch(`${supplementUrl}/webhook/job-sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      source: 'homeowner-portal',
      jobId: job.id,
      address: job.address,
      homeowner: job.homeowner,
      carrier: job.carrier,
      claimNumber: job.claimNumber,
      adjuster: job.adjuster,
      stage: job.stage,
      createdAt: job.createdAt
    })
  }).catch(err => console.log('[Sync] Supplement portal sync failed:', err.message));

  res.json({
    success: true,
    job,
    portalUrl: `/portal/${job.token}`
  });
});

// PUT /api/admin/jobs/:id — update job
router.put('/jobs/:id', adminAuth, (req, res) => {
  const updated = jobService.updateJob(req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: 'Job not found' });
  res.json({ success: true, job: updated });
});

// POST /api/admin/jobs/:id/stage — advance stage
router.post('/jobs/:id/stage', adminAuth, (req, res) => {
  const { stage, note } = req.body;
  if (!stage || stage < 1 || stage > 6) {
    return res.status(400).json({ error: 'Invalid stage (1-6)' });
  }
  const updated = jobService.advanceStage(req.params.id, stage, note);
  if (!updated) return res.status(404).json({ error: 'Job not found' });
  res.json({ success: true, job: updated });
});

// POST /api/admin/jobs/:id/message — send message as CRC
router.post('/jobs/:id/message', adminAuth, (req, res) => {
  const { body: messageBody } = req.body;
  if (!messageBody) return res.status(400).json({ error: 'Message required' });

  const updated = jobService.addMessage(req.params.id, {
    from: 'CRC Claims Team',
    body: messageBody,
    direction: 'outbound'
  });
  if (!updated) return res.status(404).json({ error: 'Job not found' });
  res.json({ success: true });
});

// DELETE /api/admin/jobs/:id
router.delete('/jobs/:id', adminAuth, (req, res) => {
  const deleted = jobService.deleteJob(req.params.id);
  if (!deleted) return res.status(404).json({ error: 'Job not found' });
  res.json({ success: true });
});

// POST /api/admin/jobs/:id/resend-link — resend portal link
router.post('/jobs/:id/resend-link', adminAuth, async (req, res) => {
  const job = jobService.getJobById(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  if (!job.homeowner.email) return res.status(400).json({ error: 'No email on file' });

  const result = await emailService.sendPortalLink(job);
  res.json({ success: result.success, message: result.success ? 'Link sent' : result.reason });
});

// GET /api/admin/jobs/:id/supplement-draft — preview supplement email draft
router.get('/jobs/:id/supplement-draft', adminAuth, (req, res) => {
  const job = jobService.getJobById(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  if (!job.supplementEmailDraft) return res.status(404).json({ error: 'No supplement draft — scope comparison has not run yet' });

  const draft = job.supplementEmailDraft;
  res.json({
    to: draft.to,
    from: draft.from,
    subject: draft.subject,
    htmlBody: draft.htmlBody,
    textBody: draft.textBody,
    attachment: draft.attachment ? { filename: draft.attachment.filename, documentId: draft.attachment.documentId } : null,
    estimatedValue: draft.estimatedValue,
    totalGapItems: draft.totalGapItems,
    sentAt: draft.sentAt || null,
    createdAt: draft.createdAt
  });
});

// POST /api/admin/jobs/:id/send-supplement — one-click send supplement email
router.post('/jobs/:id/send-supplement', adminAuth, async (req, res) => {
  try {
    const result = await sendSupplementEmail(req.params.id);
    if (result.success) {
      res.json({ success: true, message: 'Supplement email sent to adjuster' });
    } else {
      res.json({ success: false, reason: result.reason });
    }
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/admin/jobs/:id/storm-approach — GPS proximity check + storm brief
router.post('/jobs/:id/storm-approach', adminAuth, async (req, res) => {
  const { lat, lng } = req.body;
  if (!lat || !lng) return res.status(400).json({ error: 'lat and lng required' });

  const job = jobService.getJobById(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });

  const result = await checkProximityAndBrief(job, lat, lng);
  res.json(result);
});

// POST /api/admin/geocode — reverse geocode GPS coordinates to address
router.post('/geocode', adminAuth, async (req, res) => {
  const { lat, lng } = req.body;
  if (!lat || !lng) return res.status(400).json({ error: 'lat and lng required' });

  const result = await reverseGeocode(lat, lng);
  res.json(result);
});

// POST /api/admin/jobs/:id/timeline — append a homeowner-visible event.
router.post('/jobs/:id/timeline', adminAuth, (req, res) => {
  const { event, description, visibleToHomeowner, date } = req.body || {};
  if (!description) return res.status(400).json({ error: 'description required' });
  const entry = jobService.addTimelineEntry(req.params.id, {
    date, event: event || 'note', description, visibleToHomeowner: visibleToHomeowner !== false,
  });
  if (!entry) return res.status(404).json({ error: 'Job not found' });
  res.json({ success: true, entry });
});

// PATCH /api/admin/jobs/:id — partial update for the new homeowner-
// visible fields (rep info, dates, approved amount).
router.patch('/jobs/:id', adminAuth, (req, res) => {
  const allowed = ['repName', 'repPhone', 'repEmail', 'inspectionDate', 'buildDate', 'approvedAmount', 'address', 'carrier', 'claimNumber', 'notes', 'companycamProjectId'];
  const patch = {};
  for (const k of allowed) if (req.body[k] !== undefined) patch[k] = req.body[k];
  if (req.body.homeowner) patch.homeowner = { ...(jobService.getJobById(req.params.id)?.homeowner || {}), ...req.body.homeowner };
  if (req.body.adjuster)  patch.adjuster  = { ...(jobService.getJobById(req.params.id)?.adjuster  || {}), ...req.body.adjuster };
  const updated = jobService.updateJob(req.params.id, patch);
  if (!updated) return res.status(404).json({ error: 'Job not found' });
  res.json({ success: true, job: updated });
});

module.exports = router;
