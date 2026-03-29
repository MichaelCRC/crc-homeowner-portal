const express = require('express');
const router = express.Router();
const { portalAuth } = require('../middleware/auth');
const jobService = require('../services/jobs');
const companycam = require('../services/companycam');
const email = require('../services/email');
const multer = require('multer');
const path = require('path');

// File upload config
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, '..', 'data', 'documents')),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${req.job.id}-${Date.now()}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.pdf', '.jpg', '.jpeg', '.png', '.doc', '.docx', '.xls', '.xlsx'];
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, allowed.includes(ext));
  }
});

// GET /api/portal/:token — job overview
router.get('/:token', portalAuth, (req, res) => {
  const job = req.job;
  res.json({
    id: job.id,
    address: job.address,
    homeowner: { name: job.homeowner.name },
    carrier: job.carrier,
    claimNumber: job.claimNumber,
    adjuster: job.adjuster,
    stage: job.stage,
    stages: jobService.STAGES,
    stageDescription: jobService.STAGE_DESCRIPTIONS[job.stage],
    documents: job.documents,
    messages: job.messages.map(m => ({
      id: m.id,
      from: m.from,
      body: m.body,
      direction: m.direction,
      timestamp: m.timestamp
    })),
    createdAt: job.createdAt,
    updatedAt: job.updatedAt
  });
});

// GET /api/portal/:token/photos — pull from CompanyCam
router.get('/:token/photos', portalAuth, async (req, res) => {
  const job = req.job;
  let projectId = job.companycamProjectId;

  // Auto-detect project by address if no ID stored
  if (!projectId && job.address) {
    const project = await companycam.searchProjectByAddress(job.address);
    if (project) {
      projectId = project.id;
      jobService.updateJob(job.id, { companycamProjectId: project.id });
    }
  }

  if (!projectId) {
    return res.json({ photos: [], message: 'No photos available yet' });
  }

  const photos = await companycam.fetchPhotos(projectId);

  // Categorize: inspection vs post-install based on tags
  const inspection = [];
  const postInstall = [];
  photos.forEach(p => {
    const tags = p.tags.map(t => t.toLowerCase());
    if (tags.some(t => t.includes('install') || t.includes('complete') || t.includes('after'))) {
      postInstall.push(p);
    } else {
      inspection.push(p);
    }
  });

  res.json({ inspection, postInstall });
});

// POST /api/portal/:token/upload — document upload
router.post('/:token/upload', portalAuth, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const job = req.job;
  const doc = {
    filename: req.file.filename,
    originalName: req.file.originalname,
    type: req.body.docType || 'other',
    size: req.file.size
  };

  const updated = jobService.addDocument(job.id, doc);

  // Fire webhook to supplement portal
  try {
    const webhookUrl = process.env.SUPPLEMENT_PORTAL_URL || 'https://crc-supplements-portal.onrender.com';
    await fetch(`${webhookUrl}/webhook/document`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jobId: job.id,
        address: job.address,
        document: doc,
        source: 'homeowner-portal'
      })
    }).catch(() => {});
  } catch {}

  // Auto-advance stage: if scope doc uploaded and stage is 1 or 2, move to 3
  // This is system-triggered — fires notification email
  if (doc.type === 'scope' && job.stage < 3) {
    jobService.advanceStage(job.id, 3, 'Scope of loss uploaded by homeowner');
    const { sendStageNotification } = require('../services/email');
    const updatedJob = jobService.getJobById(job.id);
    sendStageNotification(updatedJob, 3).catch(() => {});
  }

  res.json({
    success: true,
    message: 'Document received — CRC is reviewing',
    document: updated.documents[updated.documents.length - 1]
  });
});

// POST /api/portal/:token/message — homeowner sends message
router.post('/:token/message', portalAuth, async (req, res) => {
  const { body: messageBody } = req.body;
  if (!messageBody || !messageBody.trim()) {
    return res.status(400).json({ error: 'Message cannot be empty' });
  }

  const job = req.job;
  jobService.addMessage(job.id, {
    from: job.homeowner.name || 'Homeowner',
    body: messageBody.trim(),
    direction: 'inbound'
  });

  // Route to claims email
  await email.sendHomeownerMessage(job, messageBody.trim());

  res.json({ success: true, message: 'Message sent to CRC' });
});

module.exports = router;
