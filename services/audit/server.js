/**
 * Audit Service
 * Handles security logging and compliance records
 */

const express = require('express');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3006;

app.use(express.json());

const { initDatabase, query, closeDatabase } = require('./shared/database');
const { authenticateToken } = require('./shared/middleware');
const { readJsonDb, writeJsonDb } = require('./shared/utils');
const fs = require('fs');
const path = require('path');

const JSON_DB_PATH = path.join(__dirname, '..', '..', 'database.json');
let isPg = false;

(async () => {
  const connected = await initDatabase();
  isPg = connected;
  console.log('[AUDIT]', isPg ? 'Using PostgreSQL' : 'Using JSON database');
})();

/**
 * POST /api/audit/log
 * Record an audit log entry
 */
app.post('/api/audit/log', async (req, res) => {
  try {
    const { userId, action, details, ipAddress = '127.0.0.1' } = req.body;

    if (!userId || !action || !details) {
      return res.status(400).json({ error: 'Missing required fields.' });
    }

    if (isPg) {
      await query(
        'INSERT INTO bank_audit_logs (user_id, action, details, ip_address, created_at) VALUES ($1, $2, $3, $4, NOW())',
        [userId, action, details, ipAddress]
      );
    } else {
      const data = readJsonDb(JSON_DB_PATH);
      data.audit_logs = data.audit_logs || [];
      data.audit_logs.push({
        id: (data.audit_logs?.length || 0) + 1,
        user_id: userId,
        action,
        details,
        ip_address: ipAddress,
        created_at: new Date().toISOString()
      });
      writeJsonDb(JSON_DB_PATH, data);
    }

    console.log(`[AUDIT] User ${userId} | ${action} | ${details}`);
    res.json({ message: 'Audit logged.' });
  } catch (error) {
    console.error('[AUDIT] Log error:', error);
    res.status(500).json({ error: 'Failed to log audit.' });
  }
});

/**
 * GET /api/security/logs
 * Retrieve security logs for authenticated user
 */
app.get('/api/security/logs', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    let logs = [];
    if (isPg) {
      const result = await query(
        'SELECT * FROM bank_audit_logs WHERE user_id = $1 ORDER BY created_at DESC LIMIT 30',
        [userId]
      );
      logs = result.rows;
    } else {
      const data = readJsonDb(JSON_DB_PATH);
      logs = (data?.audit_logs || [])
        .filter(l => l.user_id === userId)
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        .slice(0, 30);
    }

    res.json({ logs });
  } catch (error) {
    console.error('[AUDIT] Fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch logs.' });
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'audit', timestamp: new Date().toISOString() });
});

app.use((err, req, res, next) => {
  console.error('[AUDIT ERROR]', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`[AUDIT] Service running on port ${PORT}`);
});

process.on('SIGTERM', async () => {
  console.log('[AUDIT] Shutting down gracefully');
  await closeDatabase();
  process.exit(0);
});
