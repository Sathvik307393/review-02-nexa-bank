/**
 * User Service
 * Handles user profiles, dashboard data, and user-related operations
 */

const express = require('express');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3002;

// Middleware
app.use(express.json());

// Import shared modules
const { initDatabase, query, isDatabasePostgres, closeDatabase } = require('../../shared/database');
const { authenticateToken } = require('../../shared/middleware');
const { readJsonDb } = require('../../shared/utils');
const fs = require('fs');
const path = require('path');

const JSON_DB_PATH = path.join(__dirname, '..', '..', 'database.json');
let isPg = false;

// Initialize database
(async () => {
  const connected = await initDatabase();
  isPg = connected;
  console.log('[USER]', isPg ? 'Using PostgreSQL' : 'Using JSON database');
})();

// ===== ROUTES =====

/**
 * GET /api/dashboard-data
 * Fetch user dashboard with account info, stats, and recent transactions
 */
app.get('/api/dashboard-data', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    // Get user
    let user;
    if (isPg) {
      const result = await query('SELECT id, name, email, balance, kyc_status, role FROM bank_users WHERE id = $1', [userId]);
      user = result.rows[0];
    } else {
      const data = readJsonDb(JSON_DB_PATH);
      user = data?.users?.find(u => u.id === userId);
      if (user) {
        const { password_hash, ...safeUser } = user;
        user = safeUser;
      }
    }

    if (!user) {
      return res.status(404).json({ error: 'User profile not found.' });
    }

    // Get transactions
    let txs = [];
    if (isPg) {
      const result = await query(
        'SELECT * FROM bank_transactions WHERE user_id = $1 ORDER BY created_at DESC',
        [userId]
      );
      txs = result.rows;
    } else {
      const data = readJsonDb(JSON_DB_PATH);
      txs = (data?.transactions || [])
        .filter(t => t.user_id === userId)
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    }

    // Get KYC documents
    let uploadedDocs = [];
    if (isPg) {
      const result = await query(
        'SELECT id, file_name, original_name, uploaded_at, status, doc_type, ocr_details FROM bank_kyc_docs WHERE user_id = $1 ORDER BY uploaded_at DESC',
        [userId]
      );
      uploadedDocs = result.rows;
    } else {
      const data = readJsonDb(JSON_DB_PATH);
      uploadedDocs = (data?.kyc_docs || [])
        .filter(d => d.user_id === userId)
        .sort((a, b) => new Date(b.uploaded_at) - new Date(a.uploaded_at));
    }

    // Calculate stats
    let totalIncome = 0, totalSpending = 0;
    txs.forEach(t => {
      const amt = parseFloat(t.amount);
      if (t.type === 'Deposit' || t.type === 'Transfer (Received)') {
        totalIncome += amt;
      } else if (t.type === 'Withdrawal' || t.type === 'Transfer (Sent)') {
        totalSpending += amt;
      }
    });

    // Generate 7-day chart data
    const dailyStats = {};
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      const label = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      dailyStats[dateStr] = { label, income: 0, spending: 0 };
    }

    txs.forEach(t => {
      const dateStr = new Date(t.created_at).toISOString().split('T')[0];
      if (dailyStats[dateStr]) {
        const amt = parseFloat(t.amount);
        if (t.type === 'Deposit' || t.type === 'Transfer (Received)') {
          dailyStats[dateStr].income += amt;
        } else if (t.type === 'Withdrawal' || t.type === 'Transfer (Sent)') {
          dailyStats[dateStr].spending += amt;
        }
      }
    });

    const chartLabels = [];
    const chartIncome = [];
    const chartSpending = [];
    Object.keys(dailyStats).sort().forEach(dateStr => {
      chartLabels.push(dailyStats[dateStr].label);
      chartIncome.push(dailyStats[dateStr].income);
      chartSpending.push(dailyStats[dateStr].spending);
    });

    res.json({
      user,
      stats: {
        balance: parseFloat(user.balance),
        totalIncome,
        totalSpending
      },
      chartData: {
        labels: chartLabels,
        income: chartIncome,
        spending: chartSpending
      },
      recentTransactions: txs.slice(0, 5),
      uploadedDocs
    });
  } catch (error) {
    console.error('[USER] Dashboard error:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard data.' });
  }
});

/**
 * GET /api/user/profile
 * Get user profile information
 */
app.get('/api/user/profile', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    let user;
    if (isPg) {
      const result = await query('SELECT id, name, email, balance, kyc_status, role, created_at FROM bank_users WHERE id = $1', [userId]);
      user = result.rows[0];
    } else {
      const data = readJsonDb(JSON_DB_PATH);
      user = data?.users?.find(u => u.id === userId);
      if (user) {
        const { password_hash, ...safeUser } = user;
        user = safeUser;
      }
    }

    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    res.json({ user });
  } catch (error) {
    console.error('[USER] Profile error:', error);
    res.status(500).json({ error: 'Failed to fetch user profile.' });
  }
});

/**
 * GET / (Serve frontend HTML)
 * Returns the banking portal frontend
 */
app.get('/', (req, res) => {
  // This would normally serve the frontend HTML
  res.send('Frontend served here');
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'user', timestamp: new Date().toISOString() });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('[USER ERROR]', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
app.listen(PORT, () => {
  console.log(`[USER] Service running on port ${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('[USER] Shutting down gracefully');
  await closeDatabase();
  process.exit(0);
});
