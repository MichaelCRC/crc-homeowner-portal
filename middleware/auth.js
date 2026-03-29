const jobService = require('../services/jobs');

// Middleware: resolve job from portal token
function portalAuth(req, res, next) {
  const { token } = req.params;
  if (!token) return res.status(401).json({ error: 'No token provided' });

  const job = jobService.getJobByToken(token);
  if (!job) return res.status(404).json({ error: 'Invalid portal link' });

  req.job = job;
  next();
}

// Middleware: basic admin auth via header or query param
function adminAuth(req, res, next) {
  const secret = process.env.PORTAL_SECRET || 'crc-admin-dev';
  const provided = req.headers['x-admin-key'] || req.query.key;

  // In development, allow access without key
  if (!process.env.PORTAL_SECRET && process.env.NODE_ENV !== 'production') {
    return next();
  }

  if (provided !== secret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

module.exports = { portalAuth, adminAuth };
