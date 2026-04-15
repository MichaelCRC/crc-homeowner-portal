const express = require('express');
const router = express.Router();
const { portalAuth } = require('../middleware/auth');
const jobService = require('../services/jobs');
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

// Mapping from internal stage IDs (1-6) to homeowner-facing labels.
// The homeowner sees "Inspection Complete → Project Complete"; admin
// uses the original taxonomy ("Claim Filed → Project Complete"). Order
// matches so progress percentages line up.
const HOMEOWNER_STAGES = [
  { id: 1, label: 'Inspection Complete' },
  { id: 2, label: 'Claim Filed' },
  { id: 3, label: 'Adjuster Meeting' },
  { id: 4, label: 'Scope Approved' },
  { id: 5, label: 'Build Scheduled' },
  { id: 6, label: 'Project Complete' },
];

// GET /api/portal/:token — job overview (homeowner-safe)
router.get('/:token', portalAuth, (req, res) => {
  const job = req.job;
  // Homeowner-safe documents — strip internal fields like supplement strategy.
  const docs = (job.documents || []).map(d => ({
    id: d.id, name: d.originalName || d.filename, type: d.type, date: d.uploadedAt, url: d.filename ? '/documents/' + d.filename : null,
  }));
  // Photos — pull inspection photos from CompanyCam helper if present.
  let inspectionPhotos = [];
  let postInstallPhotos = [];
  try {
    const { getPhotosFromJob } = require('../services/companycam');
    const p = getPhotosFromJob(job) || {};
    inspectionPhotos = p.inspection || [];
    postInstallPhotos = p.postInstall || [];
  } catch {}
  // Timeline — only entries flagged visibleToHomeowner. Include stage
  // history as an implicit fallback so legacy jobs still have a story.
  const tl = (Array.isArray(job.timeline) ? job.timeline : []).filter(e => e.visibleToHomeowner !== false);
  if (!tl.length) {
    for (const h of (job.stageHistory || [])) {
      const lbl = (HOMEOWNER_STAGES.find(s => s.id === h.stage) || {}).label || ('Stage ' + h.stage);
      tl.push({ date: h.timestamp || h.date, event: 'stage_change', description: 'Moved to ' + lbl });
    }
  }
  tl.sort((a, b) => new Date(b.date) - new Date(a.date));
  res.json({
    id: job.id,
    address: job.address,
    homeowner: { name: job.homeowner.name },
    carrier: job.carrier,
    claimNumber: job.claimNumber,
    adjuster: job.adjuster,
    stage: job.stage,
    stages: HOMEOWNER_STAGES,
    stageDescription: jobService.STAGE_DESCRIPTIONS[job.stage],
    rep: { name: job.repName || 'Michael McGovern', phone: job.repPhone || '614-824-7462', email: job.repEmail || 'crc@columbusroofingco.com' },
    inspectionDate: job.inspectionDate || null,
    buildDate: job.buildDate || null,
    approvedAmount: job.approvedAmount || null,
    documents: docs,
    photos: inspectionPhotos,
    postInstallPhotos,
    timeline: tl.slice(0, 50),
    messages: (job.messages || []).map(m => ({ id: m.id, from: m.from, body: m.body, direction: m.direction, timestamp: m.timestamp })),
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  });
});

// GET /api/portal/:token/photos — read from job record (webhook-stored)
// CompanyCam is WEBHOOK ONLY — no API key.
router.get('/:token/photos', portalAuth, (req, res) => {
  const { getPhotosFromJob } = require('../services/companycam');
  const { inspection, postInstall } = getPhotosFromJob(req.job);
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

// GET /api/portal/:token/design — Hover visualization data for Design tab
router.get('/:token/design', portalAuth, async (req, res) => {
  const { findHoverJob, getVisualizationEmbed } = require('../services/hover');
  const job = req.job;

  // Check if we have a cached Hover ID from supplement portal sync
  const hoverId = job.supplementData?.measurements?.hoverId || null;

  if (hoverId) {
    const embed = await getVisualizationEmbed(hoverId);
    return res.json({ available: true, hoverId, ...embed });
  }

  // Search Hover by address
  const hoverResult = await findHoverJob(job.address);
  if (!hoverResult.success) {
    return res.json({ available: false, reason: hoverResult.reason });
  }

  const embed = await getVisualizationEmbed(hoverResult.hoverId);
  res.json({
    available: true,
    hoverId: hoverResult.hoverId,
    ...embed
  });
});

// GET /api/portal/:token/home-value — property value + roof ROI projection
router.get('/:token/home-value', portalAuth, async (req, res) => {
  const { getHomeValue, calculateRoofROI } = require('../services/home-value');
  const job = req.job;

  const valueResult = await getHomeValue(job.address);
  if (!valueResult.success) {
    return res.json({ available: false, reason: valueResult.reason });
  }

  // Use supplement estimated value or a reasonable default for ROI calc
  const projectCost = job.scopeComparison?.estimatedSupplementValue || 12000;
  const roi = calculateRoofROI(valueResult.currentValue, projectCost);

  res.json({
    available: true,
    source: valueResult.source,
    ...roi
  });
});

// --- Claim Guide ---
router.get('/:token/claim-guide', portalAuth, (req, res) => {
  const fs = require('fs');
  const guidePath = path.join(__dirname, '..', 'data', 'knowledge', 'carrier-guides');
  const masterPath = path.join(__dirname, '..', 'data', 'knowledge', 'crc-homeowner-carrier-guide.md');
  const carrier = (req.job.carrier || '').toLowerCase().trim();

  // Map carrier names to file names
  const carrierFileMap = {
    'state farm': 'state-farm-guide.md',
    'allstate': 'allstate-guide.md',
    'erie': 'erie-guide.md', 'erie insurance': 'erie-guide.md',
    'nationwide': 'nationwide-guide.md',
    'grange': 'grange-guide.md', 'grange mutual': 'grange-guide.md', 'grange insurance': 'grange-guide.md',
    'american family': 'american-family-guide.md', 'amfam': 'american-family-guide.md',
    'liberty mutual': 'liberty-safeco-guide.md', 'safeco': 'liberty-safeco-guide.md', 'liberty': 'liberty-safeco-guide.md',
    'westfield': 'westfield-guide.md',
    'usaa': 'usaa-guide.md',
  };

  let carrierGuide = '';
  const fileName = carrierFileMap[carrier];
  if (fileName) {
    try { carrierGuide = fs.readFileSync(path.join(guidePath, fileName), 'utf-8'); } catch {}
  }

  // Universal process section
  let universalProcess = '';
  let ohioRights = '';
  try {
    const master = fs.readFileSync(masterPath, 'utf-8');
    const uniMatch = master.match(/## UNIVERSAL CLAIM PROCESS[\s\S]*?(?=\n## [A-Z])/);
    if (uniMatch) universalProcess = uniMatch[0];
    const ohioMatch = master.match(/## OHIO HOMEOWNER RIGHTS[\s\S]*$/);
    if (ohioMatch) ohioRights = ohioMatch[0];
  } catch {}

  res.json({ universalProcess, carrierGuide, ohioRights });
});

module.exports = router;
