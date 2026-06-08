/**
 * Transactions Service
 * Handles deposits, withdrawals, transfers with ACID compliance
 */

const express = require('express');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3003;

app.use(express.json());

const { initDatabase, query, closeDatabase } = require('../../shared/database');
const { authenticateToken } = require('../../shared/middleware');
const { readJsonDb, writeJsonDb } = require('../../shared/utils');
const fs = require('fs');
const path = require('path');

const JSON_DB_PATH = path.join(__dirname, '..', '..', 'database.json');
let isPg = false;

(async () => {
  const connected = await initDatabase();
  isPg = connected;
  console.log('[TRANSACTIONS]', isPg ? 'Using PostgreSQL' : 'Using JSON database');
})();

/**
 * POST /api/transactions
 * Submit a new transaction (deposit, withdrawal, transfer)
 */
app.post('/api/transactions', authenticateToken, async (req, res) => {
  try {
    const { type, amount, targetEmail, remark } = req.body;
    const userId = req.user.id;

    if (!type || !amount) {
      return res.status(400).json({ error: 'Transaction type and amount are required.' });
    }

    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      return res.status(400).json({ error: 'Transaction amount must be a positive number.' });
    }

    if (numAmount > 50000) {
      return res.status(400).json({ error: "More than 50,000 transaction can't be done." });
    }

    if (isPg) {
      const client = await query('BEGIN') || {};
      try {
        // Get sender with lock
        const userRes = await query('SELECT * FROM bank_users WHERE id = $1 FOR UPDATE', [userId]);
        const user = userRes.rows[0];
        if (!user) throw new Error('User not found.');

        const currentBalance = parseFloat(user.balance);

        if (type === 'Withdrawal') {
          if (currentBalance < numAmount) throw new Error('Insufficient funds.');

          await query('UPDATE bank_users SET balance = $1 WHERE id = $2', [currentBalance - numAmount, userId]);
          await query(
            'INSERT INTO bank_transactions (user_id, type, amount, remark, status, created_at) VALUES ($1, $2, $3, $4, $5, NOW())',
            [userId, 'Withdrawal', numAmount, remark || 'ATM Withdrawal', 'Success']
          );
        } else if (type === 'Deposit') {
          await query('UPDATE bank_users SET balance = $1 WHERE id = $2', [currentBalance + numAmount, userId]);
          await query(
            'INSERT INTO bank_transactions (user_id, type, amount, remark, status, created_at) VALUES ($1, $2, $3, $4, $5, NOW())',
            [userId, 'Deposit', numAmount, remark || 'Deposit', 'Success']
          );
        } else if (type === 'Transfer') {
          if (!targetEmail) throw new Error('Recipient email is required.');
          if (targetEmail.toLowerCase() === user.email.toLowerCase()) throw new Error('Cannot transfer to yourself.');

          const recRes = await query('SELECT * FROM bank_users WHERE LOWER(email) = LOWER($1) FOR UPDATE', [targetEmail.trim()]);
          const recipient = recRes.rows[0];
          if (!recipient) throw new Error('Recipient not found.');

          if (currentBalance < numAmount) throw new Error('Insufficient funds.');

          await query('UPDATE bank_users SET balance = $1 WHERE id = $2', [currentBalance - numAmount, userId]);
          await query('UPDATE bank_users SET balance = $1 WHERE id = $2', [parseFloat(recipient.balance) + numAmount, recipient.id]);

          await query(
            'INSERT INTO bank_transactions (user_id, type, amount, sender_email, recipient_email, remark, status, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())',
            [userId, 'Transfer (Sent)', numAmount, user.email, recipient.email, remark || `Transfer to ${recipient.email}`, 'Success']
          );
          await query(
            'INSERT INTO bank_transactions (user_id, type, amount, sender_email, recipient_email, remark, status, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())',
            [recipient.id, 'Transfer (Received)', numAmount, user.email, recipient.email, remark || `Transfer from ${user.email}`, 'Success']
          );
        }

        await query('COMMIT');
      } catch (e) {
        await query('ROLLBACK');
        throw e;
      }
    } else {
      // JSON fallback
      const data = readJsonDb(JSON_DB_PATH);
      const user = data?.users?.find(u => u.id === userId);
      if (!user) throw new Error('User not found.');

      const currentBalance = parseFloat(user.balance);

      if (type === 'Withdrawal') {
        if (currentBalance < numAmount) throw new Error('Insufficient funds.');
        user.balance = currentBalance - numAmount;
        data.transactions.push({
          id: (data.transactions?.length || 0) + 1,
          user_id: userId,
          type: 'Withdrawal',
          amount: numAmount,
          remark: remark || 'ATM Withdrawal',
          status: 'Success',
          created_at: new Date().toISOString()
        });
      } else if (type === 'Deposit') {
        user.balance = currentBalance + numAmount;
        data.transactions.push({
          id: (data.transactions?.length || 0) + 1,
          user_id: userId,
          type: 'Deposit',
          amount: numAmount,
          remark: remark || 'Deposit',
          status: 'Success',
          created_at: new Date().toISOString()
        });
      } else if (type === 'Transfer') {
        if (!targetEmail) throw new Error('Recipient email required.');
        if (targetEmail.toLowerCase() === user.email.toLowerCase()) throw new Error('Cannot transfer to yourself.');

        const recipient = data.users.find(u => u.email.toLowerCase() === targetEmail.trim().toLowerCase());
        if (!recipient) throw new Error('Recipient not found.');
        if (currentBalance < numAmount) throw new Error('Insufficient funds.');

        user.balance = currentBalance - numAmount;
        recipient.balance = parseFloat(recipient.balance) + numAmount;

        data.transactions.push({
          id: (data.transactions?.length || 0) + 1,
          user_id: userId,
          type: 'Transfer (Sent)',
          amount: numAmount,
          sender_email: user.email,
          recipient_email: recipient.email,
          remark: remark || `Transfer to ${recipient.email}`,
          status: 'Success',
          created_at: new Date().toISOString()
        });
        data.transactions.push({
          id: (data.transactions?.length || 0) + 1,
          user_id: recipient.id,
          type: 'Transfer (Received)',
          amount: numAmount,
          sender_email: user.email,
          recipient_email: recipient.email,
          remark: remark || `Transfer from ${user.email}`,
          status: 'Success',
          created_at: new Date().toISOString()
        });
      }

      writeJsonDb(JSON_DB_PATH, data);
    }

    res.json({ message: 'Transaction processed successfully.' });
  } catch (error) {
    console.error('[TRANSACTIONS] Error:', error.message);
    res.status(400).json({ error: error.message || 'Transaction failed.' });
  }
});

/**
 * GET /api/transactions
 * Fetch user transactions with optional date filtering
 */
app.get('/api/transactions', authenticateToken, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const userId = req.user.id;

    let txs = [];
    if (isPg) {
      let query_str = 'SELECT * FROM bank_transactions WHERE user_id = $1';
      const params = [userId];

      if (startDate) {
        params.push(startDate);
        query_str += ` AND created_at >= $${params.length}`;
      }
      if (endDate) {
        params.push(endDate + ' 23:59:59');
        query_str += ` AND created_at <= $${params.length}`;
      }

      query_str += ' ORDER BY created_at DESC';
      const result = await query(query_str, params);
      txs = result.rows;
    } else {
      const data = readJsonDb(JSON_DB_PATH);
      txs = (data?.transactions || [])
        .filter(t => t.user_id === userId);

      if (startDate) {
        const start = new Date(startDate);
        txs = txs.filter(t => new Date(t.created_at) >= start);
      }
      if (endDate) {
        const end = new Date(endDate + 'T23:59:59');
        txs = txs.filter(t => new Date(t.created_at) <= end);
      }

      txs.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    }

    res.json({ transactions: txs });
  } catch (error) {
    console.error('[TRANSACTIONS] Fetch error:', error);
    res.status(500).json({ error: 'Failed to retrieve transactions.' });
  }
});

/**
 * GET /api/transactions/statement
 * Download transactions as CSV
 */
app.get('/api/transactions/statement', authenticateToken, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const userId = req.user.id;

    let user, txs = [];
    if (isPg) {
      const userRes = await query('SELECT * FROM bank_users WHERE id = $1', [userId]);
      user = userRes.rows[0];

      let query_str = 'SELECT * FROM bank_transactions WHERE user_id = $1';
      const params = [userId];

      if (startDate) {
        params.push(startDate);
        query_str += ` AND created_at >= $${params.length}`;
      }
      if (endDate) {
        params.push(endDate + ' 23:59:59');
        query_str += ` AND created_at <= $${params.length}`;
      }

      const result = await query(query_str, params);
      txs = result.rows;
    } else {
      const data = readJsonDb(JSON_DB_PATH);
      user = data?.users?.find(u => u.id === userId);
      txs = (data?.transactions || []).filter(t => t.user_id === userId);

      if (startDate) txs = txs.filter(t => new Date(t.created_at) >= new Date(startDate));
      if (endDate) txs = txs.filter(t => new Date(t.created_at) <= new Date(endDate + 'T23:59:59'));
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="statement-${user.email}-${Date.now()}.csv"`);

    let csvContent = 'Transaction ID,Date,Type,Amount (INR),Sender,Recipient,Remark,Status\n';
    txs.forEach(t => {
      const date = new Date(t.created_at).toLocaleString();
      const remark = (t.remark || '').replace(/"/g, '""');
      csvContent += `${t.id},"${date}","${t.type}",${parseFloat(t.amount).toFixed(2)},"${t.sender_email || 'N/A'}","${t.recipient_email || 'N/A'}","${remark}","${t.status}"\n`;
    });

    res.send(csvContent);
  } catch (error) {
    console.error('[TRANSACTIONS] Statement error:', error);
    res.status(500).json({ error: 'Failed to generate statement.' });
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'transactions', timestamp: new Date().toISOString() });
});

app.use((err, req, res, next) => {
  console.error('[TRANSACTIONS ERROR]', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`[TRANSACTIONS] Service running on port ${PORT}`);
});

process.on('SIGTERM', async () => {
  console.log('[TRANSACTIONS] Shutting down gracefully');
  await closeDatabase();
  process.exit(0);
});
