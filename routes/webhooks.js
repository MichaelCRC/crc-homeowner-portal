const express = require('express');
const router = express.Router();
const jobService = require('../services/jobs');
const { sendStageNotification } = require('../services/email');

// POST /webhook/supplement-portal
// Receives scope analysis results from the supplement portal
// SYSTEM-TRIGGERED — fires homeowner notification email
router.post('/supplement-portal', async (req, res) => {
  const { jobId, address, stage, note, data } = req.body;

  let job;
  if (jobId) {
    job = jobService.getJobById(jobId);
  } else if (address) {
    const all = jobService.getAllJobs();
    job = all.find(j => j.address.toLowerCase().includes(address.toLowerCase()));
  }

  if (!job) {
    console.log('[Webhook] supplement-portal: job not found', { jobId, address });
    return res.status(404).json({ error: 'Job not found' });
  }

  const oldStage = job.stage;

  // Update stage if provided
  if (stage && stage !== job.stage) {
    jobService.advanceStage(job.id, stage, note || 'Updated via supplement portal');
  }

  // Store any supplemental data
  if (data) {
    jobService.updateJob(job.id, { supplementData: data });
  }

  // Fire notification email on stage change (system-triggered)
  if (stage && stage !== oldStage) {
    const updatedJob = jobService.getJobById(job.id);
    sendStageNotification(updatedJob, stage).then(r => {
      console.log(`[Notification] Stage ${oldStage}→${stage} email: ${r.success ? 'sent' : r.reason}`);
    }).catch(() => {});
  }

  console.log(`[Webhook] supplement-portal: updated job ${job.id} (${job.address})`);
  res.json({ success: true, jobId: job.id });
});

// POST /webhook/stage-update
// For future CRM core to push stage changes
// SYSTEM-TRIGGERED — fires homeowner notification email
router.post('/stage-update', async (req, res) => {
  const { jobId, stage, note, source } = req.body;

  if (!jobId || !stage) {
    return res.status(400).json({ error: 'jobId and stage required' });
  }

  const job = jobService.getJobById(jobId);
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }

  const oldStage = job.stage;
  jobService.advanceStage(jobId, stage, note || `Stage update from ${source || 'external'}`);

  // Fire notification email on stage change (system-triggered)
  if (stage !== oldStage) {
    const updatedJob = jobService.getJobById(jobId);
    sendStageNotification(updatedJob, stage).then(r => {
      console.log(`[Notification] Stage ${oldStage}→${stage} email: ${r.success ? 'sent' : r.reason}`);
    }).catch(() => {});
  }

  console.log(`[Webhook] stage-update: job ${jobId} → stage ${stage}`);
  res.json({ success: true });
});

// POST /webhook/companycam
// CompanyCam photo webhook — auto-link photos to jobs
router.post('/companycam', (req, res) => {
  const { project, photo } = req.body;
  if (!project) return res.status(400).json({ error: 'No project data' });

  const all = jobService.getAllJobs();
  const projectName = project.name || '';
  const job = all.find(j =>
    j.companycamProjectId === String(project.id) ||
    (j.address && projectName.toLowerCase().includes(j.address.toLowerCase().split(',')[0]))
  );

  if (job) {
    console.log(`[Webhook] companycam: photo linked to job ${job.id}`);
    // Photos are fetched live from CompanyCam API, no storage needed
  }

  res.json({ success: true });
});

module.exports = router;
