/**
 * Shared Middleware Module
 * Provides common middleware for all services
 */

const jwt = require('jsonwebtoken');

// Environment variables
const JWT_SECRET = process.env.JWT_SECRET || 'apex_banking_super_secret_cryptographic_key_9988';

/**
 * Middleware: Authenticate JWT Token
 * Extracts and validates JWT from httpOnly cookies
 */
function authenticateToken(req, res, next) {
  const token = req.cookies?.auth_token;
  
  if (!token) {
    return res.status(401).json({ error: 'Access denied. Please login.' });
  }

  try {
    const verified = jwt.verify(token, JWT_SECRET);
    req.user = verified;
    next();
  } catch (err) {
    res.clearCookie('auth_token');
    return res.status(401).json({ error: 'Session expired. Please login again.' });
  }
}

/**
 * Middleware: Require Admin Role
 * Ensures user has admin privileges
 */
function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Access denied. Administrator privileges required.' });
  }
  next();
}

/**
 * Middleware: Require Specific Role
 */
function requireRole(roles = []) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: `Access denied. Required roles: ${roles.join(', ')}` });
    }
    next();
  };
}

/**
 * Middleware: Error Handler
 * Centralized error handling
 */
function errorHandler(err, req, res, next) {
  console.error('[ERROR]', err.message);
  
  if (res.headersSent) {
    return next(err);
  }

  const statusCode = err.statusCode || 500;
  const message = err.message || 'An error occurred';

  res.status(statusCode).json({
    error: message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
}

/**
 * Middleware: Request Logger
 * Log incoming requests
 */
function requestLogger(req, res, next) {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} - ${res.statusCode} (${duration}ms)`);
  });

  next();
}

/**
 * Generate JWT Token
 */
function generateToken(payload, expiresIn = '2h') {
  return jwt.sign(payload, JWT_SECRET, { expiresIn });
}

/**
 * Verify JWT Token
 */
function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (err) {
    throw new Error('Invalid or expired token');
  }
}

/**
 * Get client IP address (handles proxies)
 */
function getClientIp(req) {
  return (req.headers['x-forwarded-for']?.split(',')[0] || 
          req.connection.remoteAddress || 
          req.socket.remoteAddress || 
          '127.0.0.1').trim();
}

/**
 * Determine if connection should use secure cookies
 */
function isSecureConnection(req) {
  return req.secure || req.headers['x-forwarded-proto'] === 'https';
}

/**
 * Set auth cookie
 */
function setAuthCookie(res, token, req) {
  const isSecure = isSecureConnection(req);
  res.cookie('auth_token', token, {
    httpOnly: true,
    secure: isSecure,
    sameSite: isSecure ? 'none' : 'strict',
    maxAge: 2 * 60 * 60 * 1000 // 2 hours
  });
}

module.exports = {
  authenticateToken,
  requireAdmin,
  requireRole,
  errorHandler,
  requestLogger,
  generateToken,
  verifyToken,
  getClientIp,
  isSecureConnection,
  setAuthCookie,
  JWT_SECRET
};
