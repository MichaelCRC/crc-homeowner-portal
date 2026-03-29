const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Ensure data directories exist
['data', 'data/documents'].forEach(dir => {
  const p = path.join(__dirname, dir);
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
});
// Ensure jobs.json exists
const jobsPath = path.join(__dirname, 'data', 'jobs.json');
if (!fs.existsSync(jobsPath)) fs.writeFileSync(jobsPath, '[]');

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static files
app.use('/static', express.static(path.join(__dirname, 'static')));
app.use('/documents', express.static(path.join(__dirname, 'data', 'documents')));

// API Routes
app.use('/api/portal', require('./routes/portal'));
app.use('/api/admin', require('./routes/admin'));
app.use('/webhook', require('./routes/webhooks'));

// Page Routes
app.get('/portal/:token', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'portal.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'crc-homeowner-portal', timestamp: new Date().toISOString() });
});

// Root redirect
app.get('/', (req, res) => {
  res.redirect('/admin');
});

// Global error handler — never dump raw errors to client
app.use((err, req, res, next) => {
  console.error('[Error]', err.message, err.stack?.split('\n')[1] || '');
  if (req.path.startsWith('/api/portal/')) {
    // Homeowner-facing: friendly message
    res.status(500).json({ error: 'Something went wrong. Please try again or contact CRC directly.' });
  } else {
    // Admin/webhook: specific message
    res.status(500).json({ error: `Server error: ${err.message}` });
  }
});

app.listen(PORT, () => {
  console.log(`CRC Homeowner Portal running on port ${PORT}`);
});
