/**
 * Admin Service
 * Handles administrative operations and reporting
 */

const express = require('express');
const cookieParser = require('cookie-parser');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3007;

app.use(express.json());
app.use(cookieParser());

const { initDatabase, query, closeDatabase } = require('./shared/database');
const { authenticateToken, requireAdmin } = require('./shared/middleware');
const { readJsonDb, writeJsonDb } = require('./shared/utils');
const fs = require('fs');
const path = require('path');

const JSON_DB_PATH = path.join(__dirname, '..', '..', 'database.json');
let isPg = false;

(async () => {
  const connected = await initDatabase();
  isPg = connected;
  console.log('[ADMIN]', isPg ? 'Using PostgreSQL' : 'Using JSON database');
})();

/**
 * GET /api/admin/data
 * Retrieve all users and transactions
 */
app.get('/api/admin/data', authenticateToken, requireAdmin, async (req, res) => {
  try {
    let users = [], transactions = [];

    if (isPg) {
      const userRes = await query(`
        SELECT u.id, u.name, u.email, u.balance, u.kyc_status, u.created_at,
               (SELECT COUNT(*) FROM bank_transactions t WHERE t.user_id = u.id) as tx_count,
               json_agg(json_build_object('file_name', k.file_name, 'status', k.status, 'doc_type', k.doc_type)) FILTER (WHERE k.id IS NOT NULL) as documents
        FROM bank_users u
        LEFT JOIN bank_kyc_docs k ON u.id = k.user_id
        GROUP BY u.id
        ORDER BY u.id DESC
      `);
      users = userRes.rows;

      const txRes = await query(`
        SELECT t.*, u.email as user_email FROM bank_transactions t
        JOIN bank_users u ON t.user_id = u.id
        ORDER BY t.created_at DESC
      `);
      transactions = txRes.rows;
    } else {
      const data = readJsonDb(JSON_DB_PATH);
      users = (data?.users || []).map(u => {
        const { password_hash, ...safeUser } = u;
        safeUser.tx_count = (data.transactions || []).filter(t => t.user_id === u.id).length;
        safeUser.documents = (data.kyc_docs || [])
          .filter(d => d.user_id === u.id)
          .map(d => ({ file_name: d.file_name, status: d.status || 'Pending', doc_type: d.doc_type }));
        return safeUser;
      });

      transactions = (data?.transactions || []).map(t => {
        const user = (data.users || []).find(u => u.id === t.user_id);
        return { ...t, user_email: user?.email || 'unknown' };
      }).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    }

    res.json({ users, transactions });
  } catch (error) {
    console.error('[ADMIN] Data fetch error:', error);
    res.status(500).json({ error: 'Failed to load admin data.' });
  }
});

/**
 * POST /api/admin/kyc-status
 * Update user KYC status
 */
app.post('/api/admin/kyc-status', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { userId, status } = req.body;

    if (!['Pending', 'Submitted', 'Verified'].includes(status)) {
      return res.status(400).json({ error: 'Invalid KYC status.' });
    }

    if (req.user.id === parseInt(userId)) {
      return res.status(400).json({ error: 'Security Violations: Users cannot verify their own KYC status.' });
    }

    if (isPg) {
      await query('UPDATE bank_users SET kyc_status = $1 WHERE id = $2', [status, parseInt(userId)]);
    } else {
      const data = readJsonDb(JSON_DB_PATH);
      const user = data?.users?.find(u => u.id === parseInt(userId));
      if (user) {
        user.kyc_status = status;
        writeJsonDb(JSON_DB_PATH, data);
      }
    }

    console.log(`[ADMIN] User ${userId} KYC status updated to ${status}`);
    res.json({ message: `KYC Status updated to ${status}.` });
  } catch (error) {
    console.error('[ADMIN] KYC update error:', error);
    res.status(500).json({ error: 'Failed to update KYC status.' });
  }
});

/**
 * POST /api/admin/reset-data
 * Reset all non-admin data for testing
 */
app.post('/api/admin/reset-data', authenticateToken, requireAdmin, async (req, res) => {
  try {
    if (isPg) {
      await query('DELETE FROM bank_transactions');
      await query('DELETE FROM bank_audit_logs');
      await query('DELETE FROM bank_kyc_forms');
      await query('DELETE FROM bank_kyc_docs');
      await query("DELETE FROM bank_users WHERE role != 'admin'");
    } else {
      const data = readJsonDb(JSON_DB_PATH);
      const adminUsers = (data?.users || []).filter(u => u.role === 'admin');
      data.users = adminUsers;
      data.transactions = [];
      data.kyc_docs = [];
      data.audit_logs = [];
      data.kyc_forms = [];
      writeJsonDb(JSON_DB_PATH, data);
    }

    console.log('[ADMIN] Database reset performed');
    res.json({ message: 'Database reset successfully. All test data cleared.' });
  } catch (error) {
    console.error('[ADMIN] Reset error:', error);
    res.status(500).json({ error: 'Failed to reset database.' });
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'admin', timestamp: new Date().toISOString() });
});

app.use((err, req, res, next) => {
  console.error('[ADMIN ERROR]', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`[ADMIN] Service running on port ${PORT}`);
});

process.on('SIGTERM', async () => {
  console.log('[ADMIN] Shutting down gracefully');
  await closeDatabase();
  process.exit(0);
});
