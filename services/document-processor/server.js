/**
 * Document Processor Service
 * Handles asynchronous KYC document validation
 * Simulates Azure Function or background job processing
 */

const express = require('express');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3005;

app.use(express.json());

const { initDatabase, query, closeDatabase } = require('./shared/database');
const { readJsonDb, writeJsonDb } = require('./shared/utils');
const fs = require('fs');
const path = require('path');

const JSON_DB_PATH = path.join(__dirname, '..', '..', 'database.json');
let isPg = false;

(async () => {
  const connected = await initDatabase();
  isPg = connected;
  console.log('[DOC_PROCESSOR]', isPg ? 'Using PostgreSQL' : 'Using JSON database');
})();

/**
 * POST /api/validate
 * Validate a KYC document asynchronously
 */
app.post('/api/validate', async (req, res) => {
  try {
    const { docId, userId, docType, fileName, filePath } = req.body;

    console.log(`[DOC_PROCESSOR] Starting validation for Doc ${docId} (${docType})`);

    // Simulate async processing
    setTimeout(async () => {
      try {
        const originalname = fileName || '';
        
        // Simple validation based on filename
        let isValid = false;
        let reason = '';
        
        const nameLower = originalname.toLowerCase();
        if (docType === 'Aadhaar') {
          isValid = nameLower.includes('aadhar') || nameLower.includes('aadhaar');
          reason = isValid ? 'Successfully verified Aadhaar format.' : 'File must contain Aadhaar keywords.';
        } else if (docType === 'PAN') {
          isValid = nameLower.includes('pan') || nameLower.includes('tax');
          reason = isValid ? 'Successfully verified PAN format.' : 'File must contain PAN keywords.';
        } else if (docType === 'Passport') {
          isValid = nameLower.includes('passport') || nameLower.includes('pass');
          reason = isValid ? 'Successfully verified Passport format.' : 'File must contain Passport keywords.';
        } else if (docType === 'Photo') {
          isValid = originalname.match(/\.(jpg|jpeg|png)$/i) !== null;
          reason = isValid ? 'Biometric validation successful.' : 'Profile Photo must be JPG or PNG.';
        } else {
          isValid = true;
          reason = 'Verification successful.';
        }

        // Update document status
        if (isPg) {
          await query(
            'UPDATE bank_kyc_docs SET status = $1, ocr_details = $2 WHERE id = $3',
            [isValid ? 'Verified' : 'Invalid', reason, docId]
          );
        } else {
          const data = readJsonDb(JSON_DB_PATH);
          const doc = data?.kyc_docs?.find(d => d.id === docId);
          if (doc) {
            doc.status = isValid ? 'Verified' : 'Invalid';
            doc.ocr_details = reason;
            writeJsonDb(JSON_DB_PATH, data);
          }
        }

        console.log(`[DOC_PROCESSOR] Validation complete: Doc ${docId} - ${isValid ? 'VERIFIED' : 'INVALID'}`);

        // Trigger audit logging
        const auditUrl = process.env.AUDIT_SERVICE_URL || 'http://audit:3006';
        const axios = require('axios');
        await axios.post(`${auditUrl}/api/audit/log`, {
          userId: userId,
          action: `KYC_DOC_VALIDATION_${isValid ? 'VERIFIED' : 'INVALID'}`,
          details: `Document ${docType} validation returned: ${isValid ? 'VERIFIED' : 'INVALID'}. ${reason}`,
          ipAddress: '127.0.0.1'
        }).catch(err => console.warn('[DOC_PROCESSOR] Audit log failed:', err.message));

      } catch (error) {
        console.error('[DOC_PROCESSOR] Validation error:', error);
      }
    }, 2000); // 2 second delay to simulate processing

    res.json({ message: 'Document queued for validation.' });
  } catch (error) {
    console.error('[DOC_PROCESSOR] Request error:', error);
    res.status(500).json({ error: 'Failed to process document.' });
  }
});

/**
 * GET /health
 */
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'document-processor', timestamp: new Date().toISOString() });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('[DOC_PROCESSOR ERROR]', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`[DOC_PROCESSOR] Service running on port ${PORT}`);
});

process.on('SIGTERM', async () => {
  console.log('[DOC_PROCESSOR] Shutting down gracefully');
  await closeDatabase();
  process.exit(0);
});
