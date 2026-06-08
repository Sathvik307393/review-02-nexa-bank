-- Apex Banking Portal Database Schema
-- Initialization script for PostgreSQL

-- Users Table
CREATE TABLE IF NOT EXISTS bank_users (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(100) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  balance NUMERIC(15, 2) DEFAULT 1000.00,
  kyc_status VARCHAR(20) DEFAULT 'Pending',
  role VARCHAR(20) DEFAULT 'user',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Transactions Table
CREATE TABLE IF NOT EXISTS bank_transactions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES bank_users(id) ON DELETE CASCADE,
  type VARCHAR(25) NOT NULL,
  amount NUMERIC(15, 2) NOT NULL,
  sender_email VARCHAR(100),
  recipient_email VARCHAR(100),
  remark VARCHAR(255),
  status VARCHAR(20) DEFAULT 'Success',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- KYC Documents Table
CREATE TABLE IF NOT EXISTS bank_kyc_docs (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES bank_users(id) ON DELETE CASCADE,
  file_name VARCHAR(255) NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  file_path VARCHAR(255) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  doc_type VARCHAR(50),
  status VARCHAR(50) DEFAULT 'Pending',
  ocr_details VARCHAR(1000),
  uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- KYC Forms Table
CREATE TABLE IF NOT EXISTS bank_kyc_forms (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES bank_users(id) ON DELETE CASCADE,
  dob VARCHAR(20) NOT NULL,
  address TEXT NOT NULL,
  tax_id VARCHAR(50) NOT NULL,
  income VARCHAR(50) NOT NULL,
  occupation VARCHAR(50) NOT NULL,
  signature_data TEXT NOT NULL,
  submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Audit Logs Table
CREATE TABLE IF NOT EXISTS bank_audit_logs (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES bank_users(id) ON DELETE CASCADE,
  action VARCHAR(50) NOT NULL,
  details TEXT NOT NULL,
  ip_address VARCHAR(50) DEFAULT '127.0.0.1',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create Indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_email ON bank_users(LOWER(email));
CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON bank_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON bank_transactions(created_at);
CREATE INDEX IF NOT EXISTS idx_kyc_docs_user_id ON bank_kyc_docs(user_id);
CREATE INDEX IF NOT EXISTS idx_kyc_forms_user_id ON bank_kyc_forms(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON bank_audit_logs(user_id);

-- Seed admin user
DELETE FROM bank_users WHERE email = 'admin@apex.com';
INSERT INTO bank_users (name, email, password_hash, balance, kyc_status, role, created_at)
VALUES (
  'System Admin',
  'admin@apex.com',
  '$2a$10$vMJhGLhvLAIhBrZl6wUCPe/gF/gx0jDFOjL.tqH92gD3rQjpCkWnm', -- bcrypt hash of 'admin123'
  0,
  'Verified',
  'admin',
  CURRENT_TIMESTAMP
);
