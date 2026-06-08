/**
 * Authentication Service
 * Handles user registration, login, and JWT token management
 */

const express = require('express');
const bcrypt = require('bcryptjs');
const cookieParser = require('cookie-parser');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Import shared modules
const { initDatabase, query, isDatabasePostgres, closeDatabase } = require('../../shared/database');
const { setAuthCookie, generateToken, getClientIp, isSecureConnection, JWT_SECRET } = require('../../shared/middleware');
const { isValidEmail, isValidPassword, readJsonDb, writeJsonDb } = require('../../shared/utils');
const fs = require('fs');
const path = require('path');

const JSON_DB_PATH = path.join(__dirname, '..', '..', 'database.json');
let isPg = false;

// Initialize database on startup
(async () => {
  const connected = await initDatabase();
  isPg = connected;
  
  if (isPg) {
    console.log('[AUTH] Using PostgreSQL database');
  } else {
    console.log('[AUTH] Using JSON file database');
  }
})();

// ===== ROUTES =====

/**
 * POST /api/auth/register
 * Register a new user
 */
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password, confirmPassword } = req.body;

    // Validations
    if (!name || !email || !password || !confirmPassword) {
      return res.status(400).json({ error: 'All fields are required.' });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ error: 'Passwords do not match.' });
    }

    if (!isValidPassword(password)) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'Please enter a valid email address.' });
    }

    // Check if user already exists
    let existingUser = null;
    if (isPg) {
      const res_query = await query('SELECT * FROM bank_users WHERE LOWER(email) = LOWER($1)', [email.trim()]);
      existingUser = res_query.rows[0];
    } else {
      const data = readJsonDb(JSON_DB_PATH);
      existingUser = data?.users?.find(u => u.email.toLowerCase() === email.trim().toLowerCase());
    }

    if (existingUser) {
      return res.status(400).json({ error: 'Account already registered with this email.' });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // Create user
    const newUser = {
      name: name.trim(),
      email: email.trim().toLowerCase(),
      password_hash: passwordHash,
      balance: 1000.00,
      kyc_status: 'Pending',
      role: 'user'
    };

    let userId;
    if (isPg) {
      const client = await query('BEGIN') || {};
      try {
        const userRes = await query(
          'INSERT INTO bank_users (name, email, password_hash, balance, kyc_status, role, created_at) VALUES ($1, $2, $3, $4, $5, $6, NOW()) RETURNING id',
          [newUser.name, newUser.email, newUser.password_hash, newUser.balance, newUser.kyc_status, newUser.role]
        );
        userId = userRes.rows[0].id;

        // Add welcome deposit transaction
        await query(
          'INSERT INTO bank_transactions (user_id, type, amount, remark, status, created_at) VALUES ($1, $2, $3, $4, $5, NOW())',
          [userId, 'Deposit', 1000.00, 'Welcome Bonus', 'Success']
        );

        await query('COMMIT');
      } catch (e) {
        await query('ROLLBACK');
        throw e;
      }
    } else {
      const data = readJsonDb(JSON_DB_PATH) || { users: [], transactions: [] };
      userId = Math.max(...(data.users?.map(u => u.id) || [0])) + 1;

      data.users = data.users || [];
      data.users.push({
        id: userId,
        ...newUser,
        created_at: new Date().toISOString()
      });

      data.transactions = data.transactions || [];
      data.transactions.push({
        id: (data.transactions?.length || 0) + 1,
        user_id: userId,
        type: 'Deposit',
        amount: 1000.00,
        remark: 'Welcome Bonus',
        status: 'Success',
        created_at: new Date().toISOString()
      });

      writeJsonDb(JSON_DB_PATH, data);
    }

    // Generate JWT token
    const token = generateToken({ id: userId, email: newUser.email, role: newUser.role });
    setAuthCookie(res, token, req);

    // Log audit
    try {
      const auditUrl = process.env.AUDIT_SERVICE_URL || 'http://audit:3006';
      const axios = require('axios');
      await axios.post(`${auditUrl}/api/audit/log`, {
        userId: userId,
        action: 'REGISTER',
        details: 'Apex account successfully created.',
        ipAddress: getClientIp(req)
      }).catch(err => console.warn('[AUTH] Audit logging failed:', err.message));
    } catch (err) {
      console.warn('[AUTH] Audit service unavailable');
    }

    res.status(201).json({
      message: 'Registration successful!',
      user: { id: userId, name: newUser.name, email: newUser.email }
    });
  } catch (error) {
    console.error('[AUTH] Registration error:', error);
    res.status(500).json({ error: 'An error occurred during registration.' });
  }
});

/**
 * POST /api/auth/login
 * Authenticate user and return JWT token
 */
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password, role } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Please enter all fields.' });
    }

    // Find user
    let user = null;
    if (isPg) {
      const result = await query('SELECT * FROM bank_users WHERE LOWER(email) = LOWER($1)', [email.trim()]);
      user = result.rows[0];
    } else {
      const data = readJsonDb(JSON_DB_PATH);
      user = data?.users?.find(u => u.email.toLowerCase() === email.trim().toLowerCase());
    }

    if (!user) {
      return res.status(400).json({ error: 'Invalid email or password.' });
    }

    // Match password
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(400).json({ error: 'Invalid email or password.' });
    }

    // Role-based access control
    const requestedRole = role || 'user';
    const actualRole = user.role || 'user';
    if (requestedRole !== actualRole) {
      return res.status(403).json({ error: 'Access denied. Account type does not match selected portal role.' });
    }

    // Generate token
    const token = generateToken({ id: user.id, email: user.email, role: user.role || 'user' });
    setAuthCookie(res, token, req);

    // Log audit
    try {
      const auditUrl = process.env.AUDIT_SERVICE_URL || 'http://audit:3006';
      const axios = require('axios');
      await axios.post(`${auditUrl}/api/audit/log`, {
        userId: user.id,
        action: 'LOGIN',
        details: 'Successful user authentication session.',
        ipAddress: getClientIp(req)
      }).catch(err => console.warn('[AUTH] Audit logging failed:', err.message));
    } catch (err) {
      console.warn('[AUTH] Audit service unavailable');
    }

    res.json({
      message: 'Login successful!',
      user: { id: user.id, name: user.name, email: user.email }
    });
  } catch (error) {
    console.error('[AUTH] Login error:', error);
    res.status(500).json({ error: 'An error occurred during login.' });
  }
});

/**
 * POST /api/auth/logout
 * Clear auth token
 */
app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('auth_token');
  res.json({ message: 'Logged out successfully.' });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'auth', timestamp: new Date().toISOString() });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('[AUTH ERROR]', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
app.listen(PORT, () => {
  console.log(`[AUTH] Service running on port ${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('[AUTH] Shutting down gracefully');
  await closeDatabase();
  process.exit(0);
});
