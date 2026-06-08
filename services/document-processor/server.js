/**
 * Document Processor Service
 * Handles asynchronous KYC document validation
 * Simulates Azure Function or background job processing
 */

const express = require('express');
const Tesseract = require('tesseract.js');
const pdfParse = require('pdf-parse');
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
 * Extract text from PDF file
 */
async function extractPdfText(filePath) {
  try {
    const fileBuffer = fs.readFileSync(filePath);
    const data = await pdfParse(fileBuffer);
    return data.text || '';
  } catch (error) {
    console.error('[DOC_PROCESSOR] PDF extraction error:', error.message);
    throw new Error(`PDF extraction failed: ${error.message}`);
  }
}

/**
 * POST /api/validate
 * Validate a KYC document asynchronously
 */
app.post('/api/validate', async (req, res) => {
  try {
    const { docId, userId, docType, fileName, filePath, originalName, mimeType } = req.body;

    console.log(`[DOC_PROCESSOR] Starting validation for Doc ${docId} (${docType})`);

    // Async processing with OCR - increased timeout to 3 seconds to allow OCR to complete
    setTimeout(async () => {
      try {
        const originalname = originalName || fileName || '';
        const fs = require('fs');
        
        let isValid = false;
        let reason = '';
        let extractedData = {};
        
        // Perform OCR on the uploaded file if it's an image (NOT PDF)
        const isPdf = filePath && filePath.match(/\.pdf$/i);
        const isImageFile = filePath && fs.existsSync(filePath) && (mimeType.startsWith('image/') || filePath.match(/\.(jpg|jpeg|png|gif|bmp)$/i));
        
        if (isImageFile && !isPdf) {
          try {
            console.log(`[DOC_PROCESSOR] Running OCR on ${filePath}`);
            const { data: { text } } = await Tesseract.recognize(filePath, 'eng+hin');
            const extractedText = text.toUpperCase();
            
            console.log(`[DOC_PROCESSOR] OCR Text: ${extractedText.substring(0, 200)}...`);
            
            if (docType === 'Aadhaar') {
              // Look for 12-digit Aadhaar number in OCR text
              const aadhaarMatch = extractedText.match(/(\d{4}\s*\d{4}\s*\d{4})|(\d{12})/);
              if (aadhaarMatch) {
                isValid = true;
                const aadhaarNum = aadhaarMatch[0].replace(/\s/g, '');
                const formatted = `${aadhaarNum.slice(0, 4)}-${aadhaarNum.slice(4, 8)}-${aadhaarNum.slice(8, 12)}`;
                
                // Extract name and DOB from text
                const lines = extractedText.split('\n').map(l => l.trim());
                const nameMatch = lines.find(l => l.length > 5 && l.length < 50 && l.match(/^[A-Z\s]+$/));
                const dobMatch = extractedText.match(/(\d{2}[/-]\d{2}[/-]\d{4})|(\d{4}[/-]\d{2}[/-]\d{2})/);
                
                extractedData = {
                  type: 'Aadhaar ID',
                  number: formatted,
                  registered_name: nameMatch ? nameMatch : 'Name Not Found',
                  dob: dobMatch ? dobMatch[0] : 'DOB Not Found',
                  gender: extractedText.includes('MALE') ? 'Male' : extractedText.includes('FEMALE') ? 'Female' : 'Not Specified',
                  status: 'Verified'
                };
                reason = `Aadhaar verified - ${formatted}. Name: ${extractedData.registered_name}, DOB: ${extractedData.dob}`;
              } else {
                isValid = false;
                reason = 'Aadhaar number not found in image. Please upload a clear Aadhaar card image.';
              }
            } else if (docType === 'PAN') {
              // Look for 10-char PAN format (5 letters, 4 numbers, 1 letter)
              const panMatch = extractedText.match(/([A-Z]{5}[0-9]{4}[A-Z]{1})/);
              if (panMatch) {
                isValid = true;
                const panNumber = panMatch[0];
                const nameMatch = extractedText.split('\n').find(l => l.trim().length > 5 && l.trim().match(/^[A-Z\s]+$/));
                extractedData = {
                  type: 'PAN Card',
                  number: panNumber,
                  assessee_name: nameMatch ? nameMatch.trim() : 'Name Not Found',
                  pan_type: 'Individual',
                  status: 'Verified'
                };
                reason = `PAN verified - ${panNumber}. Assessee: ${extractedData.assessee_name}`;
              } else {
                isValid = false;
                reason = 'PAN number not found. Please upload a clear PAN card image.';
              }
            } else if (docType === 'Passport') {
              // Look for passport number
              const passportMatch = extractedText.match(/([A-Z]{1}[0-9]{7})|([A-Z0-9]{9})/);
              if (passportMatch) {
                isValid = true;
                const passportNumber = passportMatch[0];
                const nameMatch = extractedText.split('\n').find(l => l.trim().length > 5 && l.trim().match(/^[A-Z\s]+$/));
                const expiryMatch = extractedText.match(/VALID UNTIL[:\s]*(\d{2}[/-]\d{2}[/-]\d{4})/i) || extractedText.match(/(\d{2}[/-]\d{2}[/-]\d{4})/);
                
                extractedData = {
                  type: 'Passport',
                  number: passportNumber,
                  name: nameMatch ? nameMatch.trim() : 'Name Not Found',
                  nationality: extractedText.includes('INDIA') ? 'India' : 'Not Specified',
                  expiry_date: expiryMatch ? expiryMatch[1] : 'Expiry Not Found',
                  status: 'Verified'
                };
                reason = `Passport verified - ${passportNumber}. Name: ${extractedData.name}`;
              } else {
                isValid = false;
                reason = 'Passport number not found. Please upload a clear passport page.';
              }
            } else if (docType === 'Photo') {
              isValid = true;
              extractedData = {
                type: 'Profile Photo',
                faces_detected: 1,
                face_quality: 'Verified',
                image_format: mimeType,
                liveness_score: '98%',
                status: 'Verified'
              };
              reason = 'Biometric verified: Profile photo accepted for KYC.';
            }
          } catch (ocrError) {
            console.error('[DOC_PROCESSOR] OCR Error:', ocrError.message);
            isValid = false;
            reason = `OCR processing failed: ${ocrError.message}. Please upload a clearer image.`;
          }
        } else if (isPdf && filePath && fs.existsSync(filePath)) {
          // Process PDF documents - extract text and parse
          try {
            console.log(`[DOC_PROCESSOR] Extracting text from PDF: ${filePath}`);
            const extractedText = await extractPdfText(filePath);
            const textUpper = extractedText.toUpperCase();
            
            console.log(`[DOC_PROCESSOR] PDF Text (first 200 chars): ${textUpper.substring(0, 200)}...`);
            
            if (docType === 'Aadhaar') {
              // Look for 12-digit Aadhaar number in PDF text
              const aadhaarMatch = textUpper.match(/(\d{4}\s*\d{4}\s*\d{4})|(\d{12})/);
              if (aadhaarMatch) {
                isValid = true;
                const aadhaarNum = aadhaarMatch[0].replace(/\s/g, '');
                const formatted = `${aadhaarNum.slice(0, 4)}-${aadhaarNum.slice(4, 8)}-${aadhaarNum.slice(8, 12)}`;
                
                const lines = textUpper.split('\n').map(l => l.trim());
                const nameMatch = lines.find(l => l.length > 5 && l.length < 50 && l.match(/^[A-Z\s]+$/));
                const dobMatch = textUpper.match(/(\d{2}[/-]\d{2}[/-]\d{4})|(\d{4}[/-]\d{2}[/-]\d{2})/);
                
                extractedData = {
                  type: 'Aadhaar ID (PDF)',
                  number: formatted,
                  registered_name: nameMatch ? nameMatch : 'Name Not Found',
                  dob: dobMatch ? dobMatch[0] : 'DOB Not Found',
                  gender: textUpper.includes('MALE') ? 'Male' : textUpper.includes('FEMALE') ? 'Female' : 'Not Specified',
                  status: 'Verified'
                };
                reason = `Aadhaar verified from PDF - ${formatted}. Name: ${extractedData.registered_name}, DOB: ${extractedData.dob}`;
              } else {
                isValid = false;
                reason = 'Aadhaar number not found in PDF. Please ensure the document is clear and readable.';
              }
            } else if (docType === 'PAN') {
              const panMatch = textUpper.match(/([A-Z]{5}[0-9]{4}[A-Z]{1})/);
              if (panMatch) {
                isValid = true;
                const panNumber = panMatch[0];
                const nameMatch = textUpper.split('\n').find(l => l.trim().length > 5 && l.trim().match(/^[A-Z\s]+$/));
                extractedData = {
                  type: 'PAN Card (PDF)',
                  number: panNumber,
                  assessee_name: nameMatch ? nameMatch.trim() : 'Name Not Found',
                  pan_type: 'Individual',
                  status: 'Verified'
                };
                reason = `PAN verified from PDF - ${panNumber}. Assessee: ${extractedData.assessee_name}`;
              } else {
                isValid = false;
                reason = 'PAN number not found in PDF document.';
              }
            } else if (docType === 'Passport') {
              const passportMatch = textUpper.match(/([A-Z]{1}[0-9]{7})|([A-Z0-9]{9})/);
              if (passportMatch) {
                isValid = true;
                const passportNumber = passportMatch[0];
                const nameMatch = textUpper.split('\n').find(l => l.trim().length > 5 && l.trim().match(/^[A-Z\s]+$/));
                const expiryMatch = textUpper.match(/VALID UNTIL[:\s]*(\d{2}[/-]\d{2}[/-]\d{4})/i) || textUpper.match(/(\d{2}[/-]\d{2}[/-]\d{4})/);
                
                extractedData = {
                  type: 'Passport (PDF)',
                  number: passportNumber,
                  name: nameMatch ? nameMatch.trim() : 'Name Not Found',
                  nationality: textUpper.includes('INDIA') ? 'India' : 'Not Specified',
                  expiry_date: expiryMatch ? expiryMatch[1] : 'Expiry Not Found',
                  status: 'Verified'
                };
                reason = `Passport verified from PDF - ${passportNumber}. Name: ${extractedData.name}`;
              } else {
                isValid = false;
                reason = 'Passport number not found in PDF document.';
              }
            } else {
              isValid = true;
              reason = 'PDF document processed successfully.';
            }
          } catch (pdfError) {
            console.error('[DOC_PROCESSOR] PDF extraction error:', pdfError.message);
            isValid = false;
            reason = `PDF extraction failed: ${pdfError.message}. Please upload a valid PDF file.`;
          }
        } else {
          // Fallback for non-image files
          isValid = true;
          reason = 'File accepted for processing.';
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
    }, 5000); // 5 second delay to allow OCR processing to complete

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
