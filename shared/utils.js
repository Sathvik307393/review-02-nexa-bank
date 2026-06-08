/**
 * Shared Utilities Module
 * Common helper functions
 */

const fs = require('fs');
const path = require('path');

// Format currency for display
function formatCurrency(amount) {
  return `₹${parseFloat(amount).toFixed(2)}`;
}

// Validate email format
function isValidEmail(email) {
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regex.test(email);
}

// Validate password strength
function isValidPassword(password) {
  return password && password.length >= 6;
}

// Get or create directory
function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
  return dirPath;
}

// Read JSON database file
function readJsonDb(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(data);
    }
    return null;
  } catch (err) {
    console.error('[JSON DB] Read error:', err.message);
    return null;
  }
}

// Write JSON database file
function writeJsonDb(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    return true;
  } catch (err) {
    console.error('[JSON DB] Write error:', err.message);
    return false;
  }
}

// Generate unique ID
function generateId() {
  return Math.random().toString(36).substring(2, 11) + Date.now().toString(36);
}

// Sanitize filename
function sanitizeFilename(filename) {
  return filename
    .toLowerCase()
    .replace(/[^\w\s.-]/g, '')
    .replace(/[\s]/g, '_')
    .substring(0, 255);
}

// Calculate age from DOB
function calculateAge(dobString) {
  const dob = new Date(dobString);
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const monthDiff = today.getMonth() - dob.getMonth();
  
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
    age--;
  }
  
  return age;
}

// Parse date range
function parseDateRange(startDate, endDate) {
  const range = {};
  
  if (startDate) {
    range.startDate = new Date(startDate);
  }
  
  if (endDate) {
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    range.endDate = end;
  }
  
  return range;
}

// Validate transaction amount
function isValidTransactionAmount(amount) {
  const num = parseFloat(amount);
  return !isNaN(num) && num > 0 && num <= 50000;
}

// Truncate string
function truncate(str, length) {
  if (!str) return '';
  return str.length > length ? str.substring(0, length) + '...' : str;
}

module.exports = {
  formatCurrency,
  isValidEmail,
  isValidPassword,
  ensureDir,
  readJsonDb,
  writeJsonDb,
  generateId,
  sanitizeFilename,
  calculateAge,
  parseDateRange,
  isValidTransactionAmount,
  truncate
};
