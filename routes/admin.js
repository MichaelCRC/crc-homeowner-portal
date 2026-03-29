const express = require('express');
const router = express.Router();
const { adminAuth } = require('../middleware/auth');
const jobService = require('../services/jobs');
const emailService = require('../services/email');

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

module.exports = router;
