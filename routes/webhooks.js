const express = require('express');
const router = express.Router();
const jobService = require('../services/jobs');
const { sendStageNotification } = require('../services/email');
const { compareScopes } = require('../services/scope-comparison');
const { generateSupplementPDF } = require('../services/supplement-document');
const { buildSupplementEmailDraft } = require('../services/supplement-email');

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

  // Store any supplemental data and run scope comparison if both scopes present
  if (data) {
    let updates = { supplementData: data };

    // Calculate estimated supplement opportunity when both scopes are available
    if (data.crcLineItems && data.carrierLineItems) {
      try {
        const comparison = compareScopes(data.crcLineItems, data.carrierLineItems);
        updates.scopeComparison = comparison;
        console.log(`[Webhook] supplement-portal: scope comparison for job ${job.id} — ${comparison.totalGapItems} gap items, estimated supplement value $${comparison.estimatedSupplementValue}`);

        // Generate supplement PDF and prepare email draft if gap items exist
        if (comparison.totalGapItems > 0) {
          jobService.updateJob(job.id, updates);
          generateSupplementPDF(job.id, comparison).then(pdfInfo => {
            if (pdfInfo) {
              buildSupplementEmailDraft(job.id, comparison, pdfInfo);
              console.log(`[Webhook] supplement-portal: supplement PDF + email draft ready for job ${job.id}`);
            }
          }).catch(err => {
            console.log(`[Webhook] supplement-portal: PDF generation failed for job ${job.id}:`, err.message);
          });
          // updates already saved above, skip the save below
          updates = null;
        }
      } catch (err) {
        console.log(`[Webhook] supplement-portal: scope comparison failed for job ${job.id}:`, err.message);
      }
    }

    if (updates) {
      jobService.updateJob(job.id, updates);
    }
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
// Authenticated via HMAC-SHA1 signature using COMPANYCAM_WEBHOOK_SECRET.
// Webhook registered via CompanyCam API using their access token.
router.post('/companycam', (req, res) => {
  // Verify CompanyCam signature if secret is configured
  const webhookSecret = process.env.COMPANYCAM_WEBHOOK_SECRET;
  if (webhookSecret) {
    const crypto = require('crypto');
    const signature = req.headers['x-companycam-signature'];
    if (!signature) {
      console.log('[Webhook] companycam: missing X-CompanyCam-Signature header');
      return res.status(401).json({ error: 'Missing signature' });
    }
    const rawBody = JSON.stringify(req.body);
    const expected = crypto.createHmac('sha1', webhookSecret).update(rawBody).digest('base64');
    // Timing-safe comparison
    try {
      if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
        console.log('[Webhook] companycam: invalid signature');
        return res.status(401).json({ error: 'Invalid signature' });
      }
    } catch {
      console.log('[Webhook] companycam: signature length mismatch');
      return res.status(401).json({ error: 'Invalid signature' });
    }
  }

  // CompanyCam webhook payload format: { event_type, created_at, payload, webhook_id }
  // For photo.created: payload is the photo object with a nested .project
  const payload = req.body.payload || req.body;
  const eventType = req.body.event_type || '';

  // Extract project — could be nested in photo, or top-level
  const photo = (eventType.startsWith('photo.') ? payload : payload.photo) || null;
  const project = photo?.project || payload.project || payload;
  const photoBatch = payload.photos;

  if (!project?.id && !photo) return res.status(400).json({ error: 'No project or photo data' });

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

// POST /webhook/job-sync
// Receives job creation from supplement portal to create matching record
router.post('/job-sync', (req, res) => {
  const { source, address, homeowner, carrier, claimNumber, adjuster, stage, createdAt } = req.body;

  if (!address) {
    return res.status(400).json({ error: 'Address required' });
  }

  // Check if job already exists by address
  const all = jobService.getAllJobs();
  const existing = all.find(j =>
    j.address.toLowerCase().replace(/\s+/g, '') === address.toLowerCase().replace(/\s+/g, '')
  );

  if (existing) {
    console.log(`[Sync] Job already exists for ${address} (${existing.id})`);
    return res.json({ success: true, jobId: existing.id, action: 'exists' });
  }

  // Create new job from sync data
  const job = jobService.createJob({
    address,
    homeownerName: homeowner?.name || '',
    homeownerEmail: homeowner?.email || '',
    homeownerPhone: homeowner?.phone || '',
    carrier: carrier || '',
    claimNumber: claimNumber || '',
    adjusterName: adjuster?.name || '',
    adjusterPhone: adjuster?.phone || '',
    adjusterEmail: adjuster?.email || ''
  });

  // Set stage if provided
  if (stage && stage > 1) {
    jobService.advanceStage(job.id, stage, `Synced from ${source || 'external'}`);
  }

  console.log(`[Sync] Created job ${job.id} for ${address} (from ${source})`);
  res.json({ success: true, jobId: job.id, token: job.token, action: 'created' });
});

module.exports = router;
