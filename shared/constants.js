/**
 * Shared Constants Module
 * Application-wide constants
 */

module.exports = {
  // Server Ports
  PORTS: {
    API_GATEWAY: process.env.PORT || 3000,
    AUTH_SERVICE: 3001,
    USER_SERVICE: 3002,
    TRANSACTIONS_SERVICE: 3003,
    KYC_SERVICE: 3004,
    AUDIT_SERVICE: 3006,
    ADMIN_SERVICE: 3007,
    DOC_PROCESSOR_SERVICE: 3005
  },

  // Service URLs (Internal)
  SERVICE_URLS: {
    AUTH: process.env.AUTH_SERVICE_URL || 'http://auth:3001',
    USER: process.env.USER_SERVICE_URL || 'http://user:3002',
    TRANSACTIONS: process.env.TRANSACTION_SERVICE_URL || 'http://transactions:3003',
    KYC: process.env.KYC_SERVICE_URL || 'http://kyc:3004',
    AUDIT: process.env.AUDIT_SERVICE_URL || 'http://audit:3006',
    ADMIN: process.env.ADMIN_SERVICE_URL || 'http://admin:3007',
    DOC_PROCESSOR: process.env.DOC_PROCESSOR_URL || 'http://doc-processor:3005'
  },

  // KYC Document Types
  KYC_DOC_TYPES: {
    AADHAAR: 'Aadhaar',
    PAN: 'PAN',
    PASSPORT: 'Passport',
    PHOTO: 'Photo'
  },

  // KYC Status
  KYC_STATUS: {
    PENDING: 'Pending',
    SUBMITTED: 'Submitted',
    VERIFIED: 'Verified',
    REJECTED: 'Rejected',
    INVALID: 'Invalid'
  },

  // Transaction Types
  TRANSACTION_TYPES: {
    DEPOSIT: 'Deposit',
    WITHDRAWAL: 'Withdrawal',
    TRANSFER_SENT: 'Transfer (Sent)',
    TRANSFER_RECEIVED: 'Transfer (Received)'
  },

  // Audit Actions
  AUDIT_ACTIONS: {
    REGISTER: 'REGISTER',
    LOGIN: 'LOGIN',
    LOGOUT: 'LOGOUT',
    DEPOSIT: 'DEPOSIT',
    WITHDRAWAL: 'WITHDRAWAL',
    TRANSFER_SENT: 'TRANSFER_SENT',
    TRANSFER_RECEIVED: 'TRANSFER_RECEIVED',
    KYC_SUBMITTED: 'KYC_SUBMITTED',
    KYC_FORM_SUBMITTED: 'KYC_FORM_SUBMITTED',
    KYC_DOC_VALIDATION_VERIFIED: 'KYC_DOC_VALIDATION_VERIFIED',
    KYC_DOC_VALIDATION_INVALID: 'KYC_DOC_VALIDATION_INVALID',
    KYC_AUTO_VERIFIED: 'KYC_AUTO_VERIFIED',
    KYC_VERIFICATION: 'KYC_VERIFICATION'
  },

  // User Roles
  USER_ROLES: {
    USER: 'user',
    ADMIN: 'admin'
  },

  // Transaction Limits (in INR)
  TRANSACTION_LIMITS: {
    MAX_SINGLE_TRANSFER: 50000,
    DEFAULT_WELCOME_BONUS: 1000.00,
    MIN_TRANSACTION: 1
  },

  // File Upload Limits
  FILE_UPLOAD: {
    MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
    ALLOWED_MIME_TYPES: ['application/pdf', 'image/jpeg', 'image/png'],
    UPLOAD_DIR: process.env.UPLOAD_DIR || './uploads',
    PROCESSED_DIR: 'processed_and_validated'
  },

  // Azure Configuration
  AZURE: {
    CONTAINER_NAME: 'kyc-documents',
    PROCESSED_CONTAINER: 'processed-and-validated-container',
    QUEUE_NAME: 'kyc-notifications'
  },

  // HTTP Status Codes
  HTTP_STATUS: {
    OK: 200,
    CREATED: 201,
    BAD_REQUEST: 400,
    UNAUTHORIZED: 401,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    CONFLICT: 409,
    INTERNAL_SERVER_ERROR: 500
  },

  // Error Messages
  ERRORS: {
    UNAUTHORIZED: 'Access denied. Please login.',
    FORBIDDEN: 'You do not have permission to access this resource.',
    NOT_FOUND: 'Resource not found.',
    INVALID_EMAIL: 'Please enter a valid email address.',
    INVALID_PASSWORD: 'Password must be at least 6 characters long.',
    PASSWORDS_MISMATCH: 'Passwords do not match.',
    ACCOUNT_EXISTS: 'Account already registered with this email.',
    INVALID_CREDENTIALS: 'Invalid email or password.',
    INSUFFICIENT_FUNDS: 'Insufficient funds.',
    SELF_TRANSFER: 'Cannot transfer money to yourself.',
    INVALID_AMOUNT: 'Transaction amount must be positive.',
    AMOUNT_EXCEEDS_LIMIT: 'Transaction amount exceeds the maximum limit.',
    USER_NOT_FOUND: 'User not found.',
    DOCUMENT_NOT_FOUND: 'Document not found.',
    INVALID_FILE_TYPE: 'Invalid document type. Only PDF, JPG, and PNG are allowed.'
  },

  // Success Messages
  SUCCESS: {
    REGISTRATION: 'Registration successful!',
    LOGIN: 'Login successful!',
    LOGOUT: 'Logged out successfully.',
    TRANSACTION: 'Transaction processed successfully.',
    KYC_SUBMITTED: 'KYC documents submitted successfully.',
    KYC_FORM_SUBMITTED: 'KYC Digital E-Form submitted successfully for verification.',
    DATABASE_RESET: 'Database reset successfully.'
  }
};
