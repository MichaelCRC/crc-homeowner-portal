const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');

const DATA_FILE = path.join(__dirname, '..', 'data', 'jobs.json');

function readJobs() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function writeJobs(jobs) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(jobs, null, 2));
}

function generateToken() {
  return crypto.randomBytes(24).toString('hex');
}

const STAGES = [
  { id: 1, label: 'Claim Filed' },
  { id: 2, label: 'Adjuster Scheduled' },
  { id: 3, label: 'Scope Received' },
  { id: 4, label: 'Supplement In Review' },
  { id: 5, label: 'Approved & Scheduled' },
  { id: 6, label: 'Project Complete' }
];

const STAGE_DESCRIPTIONS = {
  1: 'Your claim has been filed. CRC is monitoring progress with your carrier.',
  2: 'Your insurance adjuster visit has been scheduled. CRC will be on-site.',
  3: 'The scope of loss has been received. CRC is reviewing the line items.',
  4: 'CRC has submitted a supplement to your carrier for additional coverage.',
  5: 'Your claim has been approved. CRC is scheduling your installation.',
  6: 'Your project is complete. Thank you for choosing Columbus Roofing Company.'
};

function createJob(data) {
  const jobs = readJobs();
  const now = new Date().toISOString();
  const job = {
    id: uuidv4(),
    token: generateToken(),
    address: data.address || '',
    homeowner: {
      name: data.homeownerName || 'Homeowner',
      email: data.homeownerEmail || '',
      phone: data.homeownerPhone || ''
    },
    carrier: data.carrier || '',
    claimNumber: data.claimNumber || '',
    adjuster: {
      name: data.adjusterName || '',
      phone: data.adjusterPhone || '',
      email: data.adjusterEmail || ''
    },
    stage: 1,
    stageHistory: [{ stage: 1, timestamp: now, note: 'Job created', changedBy: data.createdBy || 'admin' }],
    documents: [],
    messages: [],
    photos: [],
    timeline: [{ date: now, event: 'job_created', description: 'Job created', visibleToHomeowner: false }],
    companycamProjectId: data.companycamProjectId || '',
    notes: data.notes || '',
    repName: data.repName || 'Michael McGovern',
    repPhone: data.repPhone || '614-824-7462',
    repEmail: data.repEmail || 'crc@columbusroofingco.com',
    inspectionDate: data.inspectionDate || null,
    buildDate: data.buildDate || null,
    approvedAmount: data.approvedAmount || null,
    createdAt: now,
    updatedAt: now
  };
  jobs.push(job);
  writeJobs(jobs);
  return job;
}

// Make sure a job loaded off disk has all the new fields. Returns the
// (possibly mutated) job and a flag indicating whether the file needs
// re-saving.
function _ensureSchema(job) {
  if (!job) return { job, changed: false };
  let changed = false;
  if (!job.token) { job.token = generateToken(); changed = true; }
  if (!Array.isArray(job.timeline)) { job.timeline = []; changed = true; }
  if (!Array.isArray(job.photos)) { job.photos = []; changed = true; }
  if (!Array.isArray(job.documents)) { job.documents = []; changed = true; }
  if (!Array.isArray(job.stageHistory)) { job.stageHistory = []; changed = true; }
  if (!('repName' in job))   { job.repName = 'Michael McGovern'; changed = true; }
  if (!('repPhone' in job))  { job.repPhone = '614-824-7462'; changed = true; }
  if (!('repEmail' in job))  { job.repEmail = 'crc@columbusroofingco.com'; changed = true; }
  if (!('inspectionDate' in job)) { job.inspectionDate = null; changed = true; }
  if (!('buildDate' in job))      { job.buildDate = null; changed = true; }
  if (!('approvedAmount' in job)) { job.approvedAmount = null; changed = true; }
  return { job, changed };
}

function getJobByToken(token) {
  const jobs = readJobs();
  const found = jobs.find(j => j.token === token);
  if (!found) return null;
  const { job, changed } = _ensureSchema(found);
  if (changed) writeJobs(jobs);
  return job;
}

function getJobById(id) {
  const jobs = readJobs();
  const found = jobs.find(j => j.id === id);
  if (!found) return null;
  const { job, changed } = _ensureSchema(found);
  if (changed) writeJobs(jobs);
  return job;
}

function addTimelineEntry(id, entry) {
  const jobs = readJobs();
  const idx = jobs.findIndex(j => j.id === id);
  if (idx === -1) return null;
  if (!Array.isArray(jobs[idx].timeline)) jobs[idx].timeline = [];
  const e = {
    date: entry.date || new Date().toISOString(),
    event: entry.event || 'note',
    description: entry.description || '',
    visibleToHomeowner: entry.visibleToHomeowner !== false,
  };
  jobs[idx].timeline.push(e);
  jobs[idx].updatedAt = new Date().toISOString();
  writeJobs(jobs);
  return e;
}

function getAllJobs() {
  return readJobs();
}

function updateJob(id, updates) {
  const jobs = readJobs();
  const idx = jobs.findIndex(j => j.id === id);
  if (idx === -1) return null;
  const now = new Date().toISOString();
  jobs[idx] = { ...jobs[idx], ...updates, updatedAt: now };
  writeJobs(jobs);
  return jobs[idx];
}

function advanceStage(id, newStage, note, changedBy) {
  const jobs = readJobs();
  const idx = jobs.findIndex(j => j.id === id);
  if (idx === -1) return null;
  const now = new Date().toISOString();
  const fromStage = jobs[idx].stage;
  jobs[idx].stage = newStage;
  if (!Array.isArray(jobs[idx].stageHistory)) jobs[idx].stageHistory = [];
  jobs[idx].stageHistory.push({ stage: newStage, fromStage, timestamp: now, date: now, note: note || '', changedBy: changedBy || 'admin' });
  if (!Array.isArray(jobs[idx].timeline)) jobs[idx].timeline = [];
  const stageLabel = (STAGES.find(s => s.id === newStage) || {}).label || ('Stage ' + newStage);
  jobs[idx].timeline.push({
    date: now,
    event: 'stage_change',
    description: note || ('Moved to ' + stageLabel),
    visibleToHomeowner: true,
  });
  jobs[idx].updatedAt = now;
  writeJobs(jobs);
  return jobs[idx];
}

function addDocument(id, doc) {
  const jobs = readJobs();
  const idx = jobs.findIndex(j => j.id === id);
  if (idx === -1) return null;
  const now = new Date().toISOString();
  jobs[idx].documents.push({
    id: uuidv4(),
    filename: doc.filename,
    originalName: doc.originalName,
    type: doc.type || 'other',
    size: doc.size || 0,
    status: 'received',
    uploadedAt: now
  });
  jobs[idx].updatedAt = now;
  writeJobs(jobs);
  return jobs[idx];
}

function addMessage(id, message) {
  const jobs = readJobs();
  const idx = jobs.findIndex(j => j.id === id);
  if (idx === -1) return null;
  const now = new Date().toISOString();
  jobs[idx].messages.push({
    id: uuidv4(),
    from: message.from,
    body: message.body,
    direction: message.direction || 'inbound',
    timestamp: now
  });
  jobs[idx].updatedAt = now;
  writeJobs(jobs);
  return jobs[idx];
}

function deleteJob(id) {
  const jobs = readJobs();
  const filtered = jobs.filter(j => j.id !== id);
  if (filtered.length === jobs.length) return false;
  writeJobs(filtered);
  return true;
}

module.exports = {
  STAGES,
  STAGE_DESCRIPTIONS,
  createJob,
  getJobByToken,
  getJobById,
  getAllJobs,
  updateJob,
  advanceStage,
  addDocument,
  addMessage,
  deleteJob,
  generateToken,
  addTimelineEntry,
};
