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
// CompanyCam webhook — stores photos directly to job record.
// NO API KEY. Webhook is the only data source.
router.post('/companycam', (req, res) => {
  const { project, photo, photos: photoBatch } = req.body;
  if (!project && !photo) return res.status(400).json({ error: 'No project or photo data' });

  const { normalizePhoto } = require('../services/companycam');
  const all = jobService.getAllJobs();
  const projectName = project?.name || '';
  const projectId = project?.id ? String(project.id) : '';

  // Match job by companycamProjectId or address
  const job = all.find(j =>
    (projectId && j.companycamProjectId === projectId) ||
    (j.address && projectName.toLowerCase().includes(j.address.toLowerCase().split(',')[0].trim()))
  );

  if (!job) {
    console.log(`[Webhook] companycam: no matching job for project "${projectName}" (${projectId})`);
    return res.json({ success: true, matched: false });
  }

  // Store companycam project ID if not already set
  if (projectId && !job.companycamProjectId) {
    jobService.updateJob(job.id, { companycamProjectId: projectId });
  }

  // Process incoming photo(s)
  const incoming = [];
  if (photo) incoming.push(photo);
  if (photoBatch && Array.isArray(photoBatch)) incoming.push(...photoBatch);

  if (incoming.length > 0) {
    const currentPhotos = job.photos || [];
    const existingIds = new Set(currentPhotos.map(p => p.id));
    let added = 0;

    for (const raw of incoming) {
      const normalized = normalizePhoto(raw);
      if (!existingIds.has(normalized.id) && normalized.url) {
        currentPhotos.push(normalized);
        existingIds.add(normalized.id);
        added++;
      }
    }

    if (added > 0) {
      jobService.updateJob(job.id, { photos: currentPhotos });
      console.log(`[Webhook] companycam: ${added} photo(s) added to job ${job.id} (${job.address})`);
    }
  }

  res.json({ success: true, matched: true, jobId: job.id });
});

module.exports = router;
