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
    const { docId, userId, docType, fileName, filePath, originalName, mimeType } = req.body;

    console.log(`[DOC_PROCESSOR] Starting validation for Doc ${docId} (${docType})`);

    // Simulate async processing
    setTimeout(async () => {
      try {
        const originalname = originalName || fileName || '';
        
        // Simple validation based on filename
        let isValid = false;
        let reason = '';
        let extractedData = {};
        
        const nameLower = originalname.toLowerCase();
        if (docType === 'Aadhaar') {
          isValid = nameLower.includes('aadhar') || nameLower.includes('aadhaar');
          if (isValid) {
            // Generate proper 16-digit Aadhaar number (XXXX-XXXX-XXXX-XXXX)
            const part1 = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
            const part2 = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
            const part3 = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
            const part4 = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
            const aadhaarNumber = `${part1}-${part2}-${part3}-${part4}`;
            extractedData = {
              type: 'Aadhaar ID',
              number: aadhaarNumber,
              registered_name: 'Sathvik Nandeesha',
              dob: '1990-05-15',
              gender: 'Male',
              status: 'Verified'
            };
            reason = `Aadhaar verified - ${aadhaarNumber}. Name: Sathvik Nandeesha, DOB: 1990-05-15`;
          } else {
            reason = 'File must contain Aadhaar keywords.';
          }
        } else if (docType === 'PAN') {
          isValid = nameLower.includes('pan') || nameLower.includes('tax');
          if (isValid) {
            // Generate proper PAN format (5 letters, 4 numbers, 1 letter)
            const letters1 = String.fromCharCode(65 + Math.floor(Math.random() * 26), 65 + Math.floor(Math.random() * 26), 65 + Math.floor(Math.random() * 26), 65 + Math.floor(Math.random() * 26), 65 + Math.floor(Math.random() * 26));
            const numbers = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
            const letterLast = String.fromCharCode(65 + Math.floor(Math.random() * 26));
            const panNumber = `${letters1}${numbers}${letterLast}`;
            extractedData = {
              type: 'PAN Card',
              number: panNumber,
              assessee_name: 'Sathvik Nandeesha',
              pan_type: 'Individual',
              status: 'Verified'
            };
            reason = `PAN verified - ${panNumber}. Assessee: Sathvik Nandeesha, Type: Individual`;
          } else {
            reason = 'File must contain PAN keywords.';
          }
        } else if (docType === 'Passport') {
          isValid = nameLower.includes('passport') || nameLower.includes('pass');
          if (isValid) {
            // Generate proper Passport format (1 letter, 7 digits)
            const passportNumber = 'P' + String(Math.floor(Math.random() * 10000000)).padStart(7, '0');
            extractedData = {
              type: 'Passport',
              number: passportNumber,
              name: 'Sathvik Nandeesha',
              nationality: 'India',
              expiry_date: '2030-12-31',
              status: 'Verified'
            };
            reason = `Passport verified - ${passportNumber}. Name: Sathvik Nandeesha, Valid until: 2030-12-31`;
          } else {
            reason = 'File must contain Passport keywords.';
          }
        } else if (docType === 'Photo') {
          isValid = (mimeType && mimeType.startsWith('image/')) || originalname.match(/\.(jpg|jpeg|png)$/i) !== null;
          if (isValid) {
            extractedData = {
              type: 'Profile Photo',
              faces_detected: 1,
              face_quality: 'High',
              image_resolution: '1920x1440',
              liveness_score: '98%',
              status: 'Verified'
            };
            reason = 'Biometric verified: 1 face detected, High quality, Liveness score 98%';
          } else {
            reason = 'Profile Photo must be JPG or PNG.';
          }
        } else {
          isValid = true;
          reason = 'Verification successful.';
        }

        // Update document status
        const extractedDataJson = Object.keys(extractedData).length > 0 ? JSON.stringify(extractedData) : null;
        if (isPg) {
          await query(
            'UPDATE bank_kyc_docs SET status = $1, ocr_details = $2, extracted_data = $3 WHERE id = $4',
            [isValid ? 'Verified' : 'Invalid', reason, extractedDataJson, docId]
          );
        } else {
          const data = readJsonDb(JSON_DB_PATH);
          const doc = data?.kyc_docs?.find(d => d.id === docId);
          if (doc) {
            doc.status = isValid ? 'Verified' : 'Invalid';
            doc.ocr_details = reason;
            doc.extracted_data = extractedDataJson;
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
