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
      name: data.homeownerName || '',
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
    stageHistory: [{ stage: 1, timestamp: now, note: 'Job created' }],
    documents: [],
    messages: [],
    photos: [],
    companycamProjectId: data.companycamProjectId || '',
    notes: data.notes || '',
    createdAt: now,
    updatedAt: now
  };
  jobs.push(job);
  writeJobs(jobs);
  return job;
}

function getJobByToken(token) {
  const jobs = readJobs();
  return jobs.find(j => j.token === token) || null;
}

function getJobById(id) {
  const jobs = readJobs();
  return jobs.find(j => j.id === id) || null;
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

function advanceStage(id, newStage, note) {
  const jobs = readJobs();
  const idx = jobs.findIndex(j => j.id === id);
  if (idx === -1) return null;
  const now = new Date().toISOString();
  jobs[idx].stage = newStage;
  jobs[idx].stageHistory.push({ stage: newStage, timestamp: now, note: note || '' });
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
  generateToken
};
