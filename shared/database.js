/**
 * Shared Database Module
 * Provides PostgreSQL connection pool and JSON fallback
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

let isPg = false;
let pool = null;

const DEFAULT_JSON_DB_PATH = path.join(__dirname, '..', '..', 'database.json');

// Parse database configuration
function getDbConfig() {
  let dbConfig = {};
  
  if (process.env.DATABASE_URL || process.env.AZURE_POSTGRESQL_CONNECTION_STRING) {
    dbConfig.connectionString = process.env.DATABASE_URL || process.env.AZURE_POSTGRESQL_CONNECTION_STRING;
  } else {
    let azureConnStr = null;
    for (const key in process.env) {
      if (key.startsWith('POSTGRESQLCONNSTR_')) {
        azureConnStr = process.env[key];
        break;
      }
    }

    if (azureConnStr) {
      dbConfig.connectionString = azureConnStr;
    } else {
      dbConfig = {
        host: process.env.DB_HOST || '127.0.0.1',
        port: parseInt(process.env.DB_PORT || '5432'),
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || 'SecurePass123!@',
        database: process.env.DB_NAME || 'autohub'
      };
    }
  }

  // Add SSL config for remote hosts
  const isRemoteHost = (dbConfig.host && dbConfig.host !== 'localhost' && dbConfig.host !== '127.0.0.1') ||
    (dbConfig.connectionString && !dbConfig.connectionString.includes('localhost') && !dbConfig.connectionString.includes('127.0.0.1'));
  const sslEnabled = process.env.DB_SSL === 'true' || isRemoteHost;

  if (sslEnabled) {
    dbConfig.ssl = { rejectUnauthorized: false };
  }

  return dbConfig;
}

// Initialize database connection
async function initDatabase() {
  const dbConfig = getDbConfig();
  
  try {
    console.log('[DB] Connecting to PostgreSQL...');
    pool = new Pool(dbConfig);
    
    // Test connection
    const client = await pool.connect();
    client.release();
    isPg = true;
    console.log('[DB] Connected to PostgreSQL successfully!');
    return true;
  } catch (error) {
    console.error('[DB] PostgreSQL connection failed:', error.message);
    console.log('[DB] Falling back to local JSON database...');
    isPg = false;
    
    // Ensure JSON DB exists
    const jsonPath = process.env.JSON_DB_PATH || DEFAULT_JSON_DB_PATH;
    if (!fs.existsSync(jsonPath)) {
      fs.writeFileSync(jsonPath, JSON.stringify({
        users: [],
        transactions: [],
        kyc_docs: [],
        kyc_forms: [],
        audit_logs: []
      }, null, 2));
    }
    return false;
  }
}

// Execute query (PostgreSQL or JSON fallback)
async function query(sql, params = []) {
  if (!isPg) {
    throw new Error('JSON database does not support arbitrary queries');
  }
  return pool.query(sql, params);
}

// Get database type
function isDatabasePostgres() {
  return isPg;
}

// Close database connection
async function closeDatabase() {
  if (pool) {
    await pool.end();
    console.log('[DB] Connection pool closed');
  }
}

module.exports = {
  initDatabase,
  query,
  pool,
  isDatabasePostgres,
  closeDatabase,
  getDbConfig
};
