const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const jobService = require('./jobs');

const DOCS_DIR = path.join(__dirname, '..', 'data', 'documents');

// IRC citations and descriptions for common Xactimate codes
const CODE_REFERENCE = {
  'RFG REMOV':      { description: 'Remove roofing - comp. shingles', irc: 'R908.1', reason: 'Full removal required per manufacturer specs and code — overlay not permitted when existing layer shows damage' },
  'RFG SHNGL':      { description: 'Roofing - comp. shingles (3-tab/arch)', irc: 'R905.2', reason: 'Damaged shingles must be replaced to restore weather-tight roof covering per code' },
  'RFG FELT':        { description: 'Roofing felt - #15 or #30', irc: 'R905.2.7', reason: 'Underlayment required beneath all asphalt shingle installations' },
  'RFG ICWTR':       { description: 'Ice & water shield membrane', irc: 'R905.2.7.1', reason: 'Ice barrier required in valleys and at eaves in regions where mean January temp is 25°F or less' },
  'RFG DRPEDG':      { description: 'Drip edge flashing', irc: 'R905.2.8.5', reason: 'Drip edge required at eaves and gable rake edges per IRC' },
  'RFG START':       { description: 'Starter strip shingles', irc: 'R905.2.8.1', reason: 'Starter course required for proper wind resistance at eaves and rakes' },
  'RFG RIDGE':       { description: 'Ridge cap shingles', irc: 'R905.2', reason: 'Ridge must be capped to complete weather-tight roof system' },
  'RFG STPFL':       { description: 'Step flashing', irc: 'R903.2.1', reason: 'Step flashing required at wall-to-roof intersections to prevent water intrusion' },
  'RFG PIPJK':       { description: 'Pipe jack / plumbing vent flashing', irc: 'R903.2', reason: 'Pipe penetration flashing must be replaced during re-roof to maintain water-tight seal' },
  'RFG RDGVNT':      { description: 'Ridge vent', irc: 'R806.1', reason: 'Ventilation required per code — ridge vent provides exhaust for balanced attic ventilation' },
  'RFG TARP':        { description: 'Emergency tarp / temporary protection', irc: 'R908.1', reason: 'Temporary protection to prevent further interior damage pending permanent repair' },
  'GTR RR':          { description: 'Gutter - remove & reinstall', irc: 'R801.3', reason: 'Gutters must be removed for proper drip edge and shingle installation at eaves' },
  'FLL':             { description: 'Fascia board', irc: 'R905.2.8.5', reason: 'Damaged fascia discovered during tear-off must be replaced for proper drip edge attachment' },
  'FLCH>':           { description: 'Chimney flashing - complete', irc: 'R903.2.1', reason: 'Chimney flashing system must be replaced during re-roof per manufacturer and code requirements' },
  'STEEP>':          { description: 'Steep roof charge (7/12+)', irc: 'OSHA 1926.501', reason: 'Steep pitch requires additional safety equipment, time, and fall protection per OSHA' },
  'STEEP> REMOV':    { description: 'Steep roof charge - removal (7/12+)', irc: 'OSHA 1926.501', reason: 'Steep pitch tear-off requires additional safety measures and equipment' },
  'HIGH ROOF':       { description: 'High roof charge (2+ stories)', irc: 'OSHA 1926.501', reason: 'Elevated work area requires additional equipment and safety compliance' },
  'HIGH ROOF REMOV': { description: 'High roof charge - removal (2+ stories)', irc: 'OSHA 1926.501', reason: 'Elevated tear-off requires additional equipment, staging, and debris management' }
};

function getCodeInfo(code) {
  return CODE_REFERENCE[code] || {
    description: code,
    irc: '—',
    reason: 'Required per scope of damage and industry standards'
  };
}

/**
 * Generate a professional supplement estimate PDF for a job.
 * Saves to data/documents/ and attaches to the job record.
 *
 * @param {string} jobId
 * @param {Object} comparison - output from compareScopes()
 * @returns {Object} { filename, filepath, documentId }
 */
function generateSupplementPDF(jobId, comparison) {
  const job = jobService.getJobById(jobId);
  if (!job) throw new Error('Job not found');

  const allGapItems = [...comparison.missingItems, ...comparison.quantityGaps];
  if (allGapItems.length === 0) return null;

  const filename = `supplement-${job.id}-${Date.now()}.pdf`;
  const filepath = path.join(DOCS_DIR, filename);

  if (!fs.existsSync(DOCS_DIR)) fs.mkdirSync(DOCS_DIR, { recursive: true });

  const doc = new PDFDocument({ size: 'LETTER', margins: { top: 50, bottom: 50, left: 50, right: 50 } });
  const stream = fs.createWriteStream(filepath);
  doc.pipe(stream);

  const pageWidth = 512; // 612 - 50 - 50

  // --- HEADER ---
  doc.fontSize(10).font('Helvetica-Bold').text('COLUMBUS ROOFING COMPANY', 50, 50);
  doc.fontSize(8).font('Helvetica').text('(614) 743-1481  |  claims@columbusroofingco.com', 50, 64);
  doc.moveTo(50, 82).lineTo(50 + pageWidth, 82).lineWidth(2).stroke('#111111');

  // --- TITLE ---
  doc.moveDown(1);
  doc.fontSize(16).font('Helvetica-Bold').text(`SUPPLEMENT REQUEST`, { align: 'center' });
  doc.fontSize(11).font('Helvetica').text(job.address, { align: 'center' });
  doc.moveDown(0.5);

  // --- CLAIM INFO ---
  const infoY = doc.y;
  doc.fontSize(9).font('Helvetica-Bold');
  doc.text('Claim Information', 50, infoY);
  doc.moveDown(0.3);
  doc.font('Helvetica').fontSize(9);
  doc.text(`Property:        ${job.address}`);
  doc.text(`Homeowner:       ${job.homeowner?.name || '—'}`);
  doc.text(`Carrier:         ${job.carrier || '—'}`);
  doc.text(`Claim Number:    ${job.claimNumber || '—'}`);
  doc.text(`Adjuster:        ${job.adjuster?.name || '—'}`);
  doc.text(`Price List:      ${comparison.priceList || 'OHCO8X'} MAR26`);
  doc.text(`Date Prepared:   ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`);
  doc.moveDown(1);

  // --- DIVIDER ---
  doc.moveTo(50, doc.y).lineTo(50 + pageWidth, doc.y).lineWidth(0.5).stroke('#cccccc');
  doc.moveDown(0.5);

  // --- SECTION: MISSING ITEMS ---
  if (comparison.missingItems.length > 0) {
    doc.fontSize(11).font('Helvetica-Bold').text('Items Omitted from Carrier Scope');
    doc.moveDown(0.3);
    drawLineItemsTable(doc, comparison.missingItems, pageWidth);
    doc.moveDown(0.8);
  }

  // --- SECTION: QUANTITY GAPS ---
  if (comparison.quantityGaps.length > 0) {
    doc.fontSize(11).font('Helvetica-Bold').text('Items Under-Scoped by Carrier');
    doc.moveDown(0.3);
    drawLineItemsTable(doc, comparison.quantityGaps, pageWidth);
    doc.moveDown(0.8);
  }

  // --- TOTAL ---
  doc.moveTo(50, doc.y).lineTo(50 + pageWidth, doc.y).lineWidth(1).stroke('#111111');
  doc.moveDown(0.5);
  doc.fontSize(12).font('Helvetica-Bold');
  doc.text(`Estimated Supplement Value:   $${comparison.estimatedSupplementValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, { align: 'right' });
  doc.moveDown(0.3);
  doc.fontSize(8).font('Helvetica').fillColor('#666666');
  doc.text('Estimated value based on OHCO8X MAR26 reference pricing. Actual values determined by Xactimate at time of carrier review.', { align: 'right' });
  doc.fillColor('#111111');
  doc.moveDown(1.5);

  // --- FOOTER ---
  doc.fontSize(8).font('Helvetica').fillColor('#999999');
  doc.text('Columbus Roofing Company  |  (614) 743-1481  |  claims@columbusroofingco.com', 50, doc.page.height - 50, { align: 'center' });

  doc.end();

  // Return a promise that resolves when the file is written
  return new Promise((resolve, reject) => {
    stream.on('finish', () => {
      // Attach document to job record
      const documentRecord = jobService.addDocument(jobId, {
        filename,
        originalName: `Supplement Request - ${job.address}.pdf`,
        type: 'supplement',
        size: fs.statSync(filepath).size
      });

      const addedDoc = documentRecord.documents[documentRecord.documents.length - 1];

      console.log(`[Supplement] PDF generated for job ${jobId}: ${filename}`);
      resolve({ filename, filepath, documentId: addedDoc.id });
    });
    stream.on('error', reject);
  });
}

/**
 * Draw a formatted line items table into the PDF.
 */
function drawLineItemsTable(doc, items, pageWidth) {
  // Column widths
  const cols = {
    code: 80,
    desc: 140,
    qty: 45,
    unit: 35,
    irc: 70,
    reason: pageWidth - 80 - 140 - 45 - 35 - 70 - 10 // remaining minus gutters
  };

  // Header row
  const headerY = doc.y;
  doc.fontSize(7).font('Helvetica-Bold').fillColor('#444444');
  let x = 50;
  doc.text('CODE', x, headerY, { width: cols.code });
  x += cols.code;
  doc.text('DESCRIPTION', x, headerY, { width: cols.desc });
  x += cols.desc;
  doc.text('QTY', x, headerY, { width: cols.qty, align: 'right' });
  x += cols.qty + 5;
  doc.text('UNIT', x, headerY, { width: cols.unit });
  x += cols.unit + 5;
  doc.text('IRC REF', x, headerY, { width: cols.irc });
  x += cols.irc;
  doc.text('JUSTIFICATION', x, headerY, { width: cols.reason });

  doc.moveTo(50, headerY + 11).lineTo(50 + pageWidth, headerY + 11).lineWidth(0.5).stroke('#dddddd');
  doc.y = headerY + 15;

  // Data rows
  doc.font('Helvetica').fontSize(7).fillColor('#111111');
  for (const item of items) {
    const info = getCodeInfo(item.code);
    const rowY = doc.y;

    // Check if we need a new page
    if (rowY > doc.page.height - 80) {
      doc.addPage();
      doc.y = 50;
    }

    const y = doc.y;
    x = 50;
    doc.font('Helvetica-Bold').text(item.code, x, y, { width: cols.code });
    x += cols.code;
    doc.font('Helvetica').text(info.description, x, y, { width: cols.desc });
    x += cols.desc;
    doc.text(item.gapQty.toString(), x, y, { width: cols.qty, align: 'right' });
    x += cols.qty + 5;
    doc.text(item.unit, x, y, { width: cols.unit });
    x += cols.unit + 5;
    doc.font('Helvetica-Bold').text(info.irc, x, y, { width: cols.irc });
    x += cols.irc;
    doc.font('Helvetica').text(info.reason, x, y, { width: cols.reason });

    // Move past the tallest cell (reason text may wrap)
    const reasonHeight = doc.heightOfString(info.reason, { width: cols.reason });
    doc.y = y + Math.max(12, reasonHeight + 4);
  }
}

module.exports = { generateSupplementPDF, CODE_REFERENCE };
