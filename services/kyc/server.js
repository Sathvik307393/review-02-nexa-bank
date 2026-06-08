/**
 * KYC Service
 * Manages Know Your Customer document uploads and verification
 */

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3004;

app.use(express.json());

const { initDatabase, query, closeDatabase } = require('../../shared/database');
const { authenticateToken } = require('../../shared/middleware');
const { readJsonDb, writeJsonDb, ensureDir } = require('../../shared/utils');

const JSON_DB_PATH = path.join(__dirname, '..', '..', 'database.json');
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, 'uploads');
let isPg = false;

ensureDir(UPLOAD_DIR);

(async () => {
  const connected = await initDatabase();
  isPg = connected;
  console.log('[KYC]', isPg ? 'Using PostgreSQL' : 'Using JSON database');
})();

// Multer configuration
const storage = multer.diskStorage({
  destination: UPLOAD_DIR,
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, 'kyc-' + req.user.id + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const fileFilter = (req, file, cb) => {
  const allowedMimeTypes = ['application/pdf', 'image/jpeg', 'image/png'];
  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid document type. Only PDF, JPG, and PNG are allowed.'));
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }
});

/**
 * POST /api/kyc/upload
 * Upload KYC document
 */
app.post('/api/kyc/upload', authenticateToken, (req, res) => {
  const uploadMiddleware = upload.single('kyc_document');

  uploadMiddleware(req, res, async function (err) {
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ error: `Upload error: ${err.message}` });
    } else if (err) {
      return res.status(400).json({ error: err.message });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'Please choose a valid file to upload.' });
    }

    const docType = req.body.doc_type || 'Document';
    const filePath = req.file.path;

    try {
      let docId;
      if (isPg) {
        const result = await query(
          'INSERT INTO bank_kyc_docs (user_id, file_name, original_name, file_path, mime_type, doc_type, status, uploaded_at) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW()) RETURNING id',
          [req.user.id, req.file.filename, `${docType}: ${req.file.originalname}`, filePath, req.file.mimetype, docType, 'Pending']
        );
        docId = result.rows[0].id;
      } else {
        const data = readJsonDb(JSON_DB_PATH);
        data.kyc_docs = data.kyc_docs || [];
        docId = (data.kyc_docs?.length || 0) + 1;
        data.kyc_docs.push({
          id: docId,
          user_id: req.user.id,
          file_name: req.file.filename,
          original_name: `${docType}: ${req.file.originalname}`,
          file_path: filePath,
          mime_type: req.file.mimetype,
          doc_type: docType,
          status: 'Pending',
          uploaded_at: new Date().toISOString()
        });
        writeJsonDb(JSON_DB_PATH, data);
      }

      // Trigger local validation simulator
      const axios = require('axios');
      const docProcessorUrl = process.env.DOC_PROCESSOR_URL || 'http://doc-processor:3005';
      axios.post(`${docProcessorUrl}/api/validate`, {
        docId: docId,
        userId: req.user.id,
        docType: docType,
        fileName: req.file.filename,
        filePath: filePath
      }).catch(err => console.warn('[KYC] Doc processor call failed:', err.message));

      res.json({
        message: `${docType} document uploaded successfully for verification.`,
        docId: docId,
        docType: docType
      });
    } catch (dbErr) {
      console.error('[KYC] Upload error:', dbErr);
      res.status(500).json({ error: 'Could not record document upload status.' });
    }
  });
});

/**
 * GET /api/kyc/download/:filename
 * Download KYC document
 */
app.get('/api/kyc/download/:filename', authenticateToken, async (req, res) => {
  try {
    const filename = req.params.filename;

    let doc;
    if (isPg) {
      const result = await query('SELECT * FROM bank_kyc_docs WHERE file_name = $1', [filename]);
      doc = result.rows[0];
    } else {
      const data = readJsonDb(JSON_DB_PATH);
      doc = data?.kyc_docs?.find(d => d.file_name === filename);
    }

    if (!doc) {
      return res.status(404).json({ error: 'Document not found.' });
    }

    const filePath = path.join(UPLOAD_DIR, filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found.' });
    }

    res.setHeader('Content-Disposition', `attachment; filename="${doc.original_name}"`);
    res.setHeader('Content-Type', doc.mime_type || 'application/octet-stream');
    res.sendFile(filePath);
  } catch (error) {
    console.error('[KYC] Download error:', error);
    res.status(500).json({ error: 'Failed to download file.' });
  }
});

/**
 * POST /api/kyc/form-submit
 * Submit digital KYC form with e-signature
 */
app.post('/api/kyc/form-submit', authenticateToken, async (req, res) => {
  try {
    const { dob, address, taxId, income, occupation, signatureData } = req.body;

    if (!dob || !address || !taxId || !income || !occupation || !signatureData) {
      return res.status(400).json({ error: 'All fields and signature are required.' });
    }

    // Age validation
    const dobDate = new Date(dob);
    if (isNaN(dobDate.getTime())) {
      return res.status(400).json({ error: 'Invalid Date of Birth format.' });
    }
    const age = (new Date() - dobDate) / (1000 * 60 * 60 * 24 * 365.25);
    if (age < 18) {
      return res.status(400).json({ error: 'You must be at least 18 years old.' });
    }

    const validOccupations = ['Salaried Employee', 'Self-Employed / Business', 'Student', 'Retired', 'Professional'];
    if (!validOccupations.includes(occupation)) {
      return res.status(400).json({ error: 'Please select a valid occupation.' });
    }

    if (isPg) {
      const client = await query('BEGIN') || {};
      try {
        await query('DELETE FROM bank_kyc_forms WHERE user_id = $1', [req.user.id]);
        await query(
          'INSERT INTO bank_kyc_forms (user_id, dob, address, tax_id, income, occupation, signature_data, submitted_at) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())',
          [req.user.id, dob, address, taxId, income, occupation, signatureData]
        );
        await query('UPDATE bank_users SET kyc_status = $1 WHERE id = $2', [req.user.id, 'Submitted']);
        await query('COMMIT');
      } catch (e) {
        await query('ROLLBACK');
        throw e;
      }
    } else {
      const data = readJsonDb(JSON_DB_PATH);
      data.kyc_forms = (data.kyc_forms || []).filter(f => f.user_id !== req.user.id);
      data.kyc_forms.push({
        id: (data.kyc_forms?.length || 0) + 1,
        user_id: req.user.id,
        dob, address, tax_id: taxId, income, occupation,
        signature_data: signatureData,
        submitted_at: new Date().toISOString()
      });
      const user = data.users?.find(u => u.id === req.user.id);
      if (user) user.kyc_status = 'Submitted';
      writeJsonDb(JSON_DB_PATH, data);
    }

    res.json({ message: 'KYC Digital E-Form submitted successfully for verification.' });
  } catch (error) {
    console.error('[KYC] Form submit error:', error);
    res.status(500).json({ error: 'Failed to save KYC form details.' });
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'kyc', timestamp: new Date().toISOString() });
});

app.use((err, req, res, next) => {
  console.error('[KYC ERROR]', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`[KYC] Service running on port ${PORT}`);
});

process.on('SIGTERM', async () => {
  console.log('[KYC] Shutting down gracefully');
  await closeDatabase();
  process.exit(0);
});
