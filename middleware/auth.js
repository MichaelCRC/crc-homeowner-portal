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

// Middleware: admin auth — DISABLED for build phase
// TODO: Re-enable with proper session auth before public launch
function adminAuth(req, res, next) {
  return next();
}

module.exports = { portalAuth, adminAuth };
