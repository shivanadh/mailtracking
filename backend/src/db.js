const path = require('path');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');

let dbInstance = null;

async function getDb() {
  if (dbInstance) return dbInstance;

  const dbPath = path.join(__dirname, '..', 'database.sqlite');
  dbInstance = await open({
    filename: dbPath,
    driver: sqlite3.Database
  });

  // Enable foreign keys
  await dbInstance.run('PRAGMA foreign_keys = ON;');

  // Initialize schema
  await dbInstance.exec(`
    CREATE TABLE IF NOT EXISTS campaigns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      subject TEXT NOT NULL,
      body TEXT NOT NULL,
      sender_email TEXT,
      sent_at TEXT NOT NULL,
      total_recipients INTEGER DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS recipients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id INTEGER NOT NULL,
      email TEXT NOT NULL,
      name TEXT,
      status TEXT NOT NULL DEFAULT 'SENT', -- SENT, OPENED, REPLIED
      sent_at TEXT NOT NULL,
      first_opened_at TEXT,
      last_opened_at TEXT,
      open_count INTEGER DEFAULT 0,
      first_replied_at TEXT,
      reply_count INTEGER DEFAULT 0,
      tat_open_seconds INTEGER,
      tat_reply_seconds INTEGER,
      gmail_thread_id TEXT,
      gmail_message_id TEXT,
      reply_snippet TEXT,
      FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS tracking_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recipient_id INTEGER NOT NULL,
      event_type TEXT NOT NULL, -- OPEN, REPLY
      timestamp TEXT NOT NULL,
      ip_address TEXT,
      user_agent TEXT,
      details TEXT,
      FOREIGN KEY (recipient_id) REFERENCES recipients(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    -- TEAM WORKFLOW TABLES

    CREATE TABLE IF NOT EXISTS team_members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      team TEXT NOT NULL DEFAULT 'General',
      active_status INTEGER DEFAULT 1,
      capacity_status TEXT DEFAULT 'AVAILABLE',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS account_code_mappings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_code TEXT NOT NULL UNIQUE,
      team_member_id INTEGER,
      team_name TEXT,
      description TEXT,
      is_active INTEGER DEFAULT 1,
      created_at TEXT NOT NULL,
      FOREIGN KEY (team_member_id) REFERENCES team_members(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS assignment_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recipient_id INTEGER NOT NULL,
      actor TEXT NOT NULL,
      prior_assignee_id INTEGER,
      new_assignee_id INTEGER,
      assigned_by TEXT NOT NULL,
      assignment_rule TEXT,
      assignment_reason TEXT,
      assignment_confidence TEXT,
      note TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (recipient_id) REFERENCES recipients(id) ON DELETE CASCADE,
      FOREIGN KEY (prior_assignee_id) REFERENCES team_members(id) ON DELETE SET NULL,
      FOREIGN KEY (new_assignee_id) REFERENCES team_members(id) ON DELETE SET NULL
    );
  `);

  // Safely add missing columns to recipients table
  const tableInfo = await dbInstance.all("PRAGMA table_info(recipients)");
  const existingCols = new Set(tableInfo.map(c => c.name));

  const newCols = [
    { name: 'assignee_id', type: 'INTEGER' },
    { name: 'assigned_at', type: 'TEXT' },
    { name: 'assigned_by', type: 'TEXT' },
    { name: 'assignment_rule', type: 'TEXT' },
    { name: 'assignment_reason', type: 'TEXT' },
    { name: 'assignment_confidence', type: 'TEXT' },
    { name: 'matching_evidence', type: 'TEXT' },
    { name: 'actioned_by', type: 'INTEGER' },
    { name: 'actioned_at', type: 'TEXT' }
  ];

  for (const col of newCols) {
    if (!existingCols.has(col.name)) {
      await dbInstance.exec(`ALTER TABLE recipients ADD COLUMN ${col.name} ${col.type};`);
    }
  }

  // Seed default team members if empty
  const teamMemberCount = await dbInstance.get("SELECT COUNT(*) as count FROM team_members");
  if (!teamMemberCount || teamMemberCount.count === 0) {
    const now = new Date().toISOString();
    await dbInstance.run(
      `INSERT INTO team_members (name, email, team, active_status, capacity_status, created_at) VALUES 
       ('Alex Rivera', 'alex.rivera@company.com', 'Support', 1, 'AVAILABLE', ?),
       ('Sarah Chen', 'sarah.chen@company.com', 'Sales', 1, 'AVAILABLE', ?),
       ('David Kim', 'david.kim@company.com', 'Billing', 1, 'AVAILABLE', ?)`,
      [now, now, now]
    );

    // Seed default account mappings
    const alex = await dbInstance.get("SELECT id FROM team_members WHERE email = 'alex.rivera@company.com'");
    const sarah = await dbInstance.get("SELECT id FROM team_members WHERE email = 'sarah.chen@company.com'");
    const david = await dbInstance.get("SELECT id FROM team_members WHERE email = 'david.kim@company.com'");

    if (alex) {
      await dbInstance.run(
        `INSERT OR IGNORE INTO account_code_mappings (account_code, team_member_id, team_name, description, created_at) VALUES 
         ('CUST-1001', ?, 'Support', 'Enterprise Support Account', ?)`,
        [alex.id, now]
      );
    }
    if (sarah) {
      await dbInstance.run(
        `INSERT OR IGNORE INTO account_code_mappings (account_code, team_member_id, team_name, description, created_at) VALUES 
         ('ACCT-402', ?, 'Sales', 'Strategic VIP Client', ?)`,
        [sarah.id, now]
      );
    }
    if (david) {
      await dbInstance.run(
        `INSERT OR IGNORE INTO account_code_mappings (account_code, team_member_id, team_name, description, created_at) VALUES 
         ('BILL-900', ?, 'Billing', 'Billing Accounts Department', ?)`,
        [david.id, now]
      );
    }
  }

  return dbInstance;
}

module.exports = { getDb };
