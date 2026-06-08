/**
 * API Gateway Service
 * Main entry point for all client requests
 * Routes to appropriate microservices
 */

const express = require('express');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.set('trust proxy', 1); // Trust reverse proxy (Azure)
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use(limiter);

// Service URLs
const SERVICES = {
  AUTH: process.env.AUTH_SERVICE_URL || 'http://auth:3001',
  USER: process.env.USER_SERVICE_URL || 'http://user:3002',
  TRANSACTIONS: process.env.TRANSACTION_SERVICE_URL || 'http://transactions:3003',
  KYC: process.env.KYC_SERVICE_URL || 'http://kyc:3004',
  AUDIT: process.env.AUDIT_SERVICE_URL || 'http://audit:3006',
  ADMIN: process.env.ADMIN_SERVICE_URL || 'http://admin:3007'
};

console.log('[GATEWAY] Service URLs:', SERVICES);

// Helper to proxy requests to microservices
async function proxyRequest(req, res, serviceUrl, path) {
  try {
    const config = {
      method: req.method,
      url: `${serviceUrl}${path}`,
      headers: {
        ...req.headers,
        'X-Forwarded-For': req.ip,
        'X-Forwarded-Proto': req.protocol
      },
      withCredentials: true
    };

    // Include body for POST/PUT/PATCH
    if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
      config.data = req.body;
    }

    // Include query parameters
    if (Object.keys(req.query).length > 0) {
      config.params = req.query;
    }

    // Forward cookies
    if (req.cookies.auth_token) {
      config.headers.cookie = `auth_token=${req.cookies.auth_token}`;
    }

    const response = await axios(config);

    // Forward response cookies
    if (response.headers['set-cookie']) {
      res.setHeader('set-cookie', response.headers['set-cookie']);
    }

    res.status(response.status).json(response.data);
  } catch (error) {
    const statusCode = error.response?.status || 500;
    const errorData = error.response?.data || { error: 'Service unavailable' };
    
    console.error(`[GATEWAY ERROR] ${req.method} ${path}:`, error.message);
    res.status(statusCode).json(errorData);
  }
}

// ===== AUTHENTICATION ROUTES =====
app.post('/api/auth/register', (req, res) => {
  proxyRequest(req, res, SERVICES.AUTH, '/api/auth/register');
});

app.post('/api/auth/login', (req, res) => {
  proxyRequest(req, res, SERVICES.AUTH, '/api/auth/login');
});

app.post('/api/auth/logout', (req, res) => {
  proxyRequest(req, res, SERVICES.AUTH, '/api/auth/logout');
});

// ===== DASHBOARD & USER ROUTES =====
app.get('/api/dashboard-data', (req, res) => {
  proxyRequest(req, res, SERVICES.USER, '/api/dashboard-data');
});

app.get('/api/user/profile', (req, res) => {
  proxyRequest(req, res, SERVICES.USER, '/api/user/profile');
});

// ===== TRANSACTION ROUTES =====
app.post('/api/transactions', (req, res) => {
  proxyRequest(req, res, SERVICES.TRANSACTIONS, '/api/transactions');
});

app.get('/api/transactions', (req, res) => {
  proxyRequest(req, res, SERVICES.TRANSACTIONS, '/api/transactions');
});

app.get('/api/transactions/statement', (req, res) => {
  proxyRequest(req, res, SERVICES.TRANSACTIONS, '/api/transactions/statement');
});

// ===== KYC ROUTES =====
app.post('/api/kyc/upload', (req, res) => {
  proxyRequest(req, res, SERVICES.KYC, '/api/kyc/upload');
});

app.post('/api/kyc/validate', (req, res) => {
  proxyRequest(req, res, SERVICES.KYC, '/api/kyc/validate');
});

app.post('/api/kyc/form-submit', (req, res) => {
  proxyRequest(req, res, SERVICES.KYC, '/api/kyc/form-submit');
});

app.get('/api/kyc/download/:filename', (req, res) => {
  proxyRequest(req, res, SERVICES.KYC, `/api/kyc/download/${req.params.filename}`);
});

// ===== SECURITY & AUDIT ROUTES =====
app.get('/api/security/logs', (req, res) => {
  proxyRequest(req, res, SERVICES.AUDIT, '/api/security/logs');
});

// ===== ADMIN ROUTES =====
app.get('/api/admin/data', (req, res) => {
  proxyRequest(req, res, SERVICES.ADMIN, '/api/admin/data');
});

app.post('/api/admin/kyc-status', (req, res) => {
  proxyRequest(req, res, SERVICES.ADMIN, '/api/admin/kyc-status');
});

app.post('/api/admin/reset-data', (req, res) => {
  proxyRequest(req, res, SERVICES.ADMIN, '/api/admin/reset-data');
});

// ===== FRONTEND ROUTES (Serve static frontend) =====
app.get('/', (req, res) => {
  proxyRequest(req, res, SERVICES.USER, '/');
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    timestamp: new Date().toISOString(),
    services: SERVICES
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('[GATEWAY ERROR]', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
app.listen(PORT, () => {
  console.log(`[GATEWAY] API Gateway running on port ${PORT}`);
  console.log(`[GATEWAY] Environment: ${process.env.NODE_ENV || 'development'}`);
});
