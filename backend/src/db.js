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

    CREATE TABLE IF NOT EXISTS recipient_replies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recipient_id INTEGER NOT NULL,
      gmail_message_id TEXT,
      gmail_thread_id TEXT,
      sender_name TEXT,
      sender_email TEXT NOT NULL,
      received_at TEXT NOT NULL,
      body_text TEXT,
      body_html TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (recipient_id) REFERENCES recipients(id) ON DELETE CASCADE
    );
  `);

  // Migration helper to add new columns to recipients table if sqlite database already exists
  const recipientColumns = await dbInstance.all(`PRAGMA table_info(recipients);`);
  const colNames = recipientColumns.map(c => c.name);

  if (!colNames.includes('latest_reply_message_id')) {
    await dbInstance.exec(`ALTER TABLE recipients ADD COLUMN latest_reply_message_id TEXT;`);
  }
  if (!colNames.includes('latest_reply_sender_name')) {
    await dbInstance.exec(`ALTER TABLE recipients ADD COLUMN latest_reply_sender_name TEXT;`);
  }
  if (!colNames.includes('latest_reply_sender_email')) {
    await dbInstance.exec(`ALTER TABLE recipients ADD COLUMN latest_reply_sender_email TEXT;`);
  }
  if (!colNames.includes('latest_reply_body_text')) {
    await dbInstance.exec(`ALTER TABLE recipients ADD COLUMN latest_reply_body_text TEXT;`);
  }

  return dbInstance;
}

module.exports = { getDb };
