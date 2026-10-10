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
      sent_at TEXT,
      total_recipients INTEGER DEFAULT 0,
      schedule_at TEXT,
      schedule_timezone TEXT,
      campaign_status TEXT DEFAULT 'sent',
      frozen_recipients TEXT,
      template_id INTEGER,
      followup_enabled INTEGER DEFAULT 0,
      followup_days INTEGER DEFAULT 3,
      followup_template_id INTEGER,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS recipients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id INTEGER NOT NULL,
      email TEXT NOT NULL,
      name TEXT,
      status TEXT NOT NULL DEFAULT 'SENT', -- SENT, OPENED, REPLIED
      send_status TEXT DEFAULT 'pending', -- pending, sending, sent, failed, cancelled
      sent_at TEXT,
      first_opened_at TEXT,
      last_opened_at TEXT,
      open_count INTEGER DEFAULT 0,
      first_replied_at TEXT,
      reply_count INTEGER DEFAULT 0,
      followup_status TEXT DEFAULT 'none', -- none, scheduled, sent, failed
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

    CREATE TABLE IF NOT EXISTS email_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      subject TEXT NOT NULL,
      body TEXT NOT NULL,
      category TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS scheduled_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id INTEGER NOT NULL UNIQUE,
      scheduled_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      locked_at TEXT,
      locked_by TEXT,
      last_error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
    );

    -- Department management tables
    CREATE TABLE IF NOT EXISTS departments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS department_participants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      department_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      employee_id TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      FOREIGN KEY (department_id) REFERENCES departments(id)
    );

    CREATE TABLE IF NOT EXISTS department_account_codes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      department_id INTEGER NOT NULL,
      account_code TEXT NOT NULL,
      description TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (department_id) REFERENCES departments(id),
      UNIQUE(department_id, account_code)
    );

    CREATE TABLE IF NOT EXISTS campaign_departments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id INTEGER NOT NULL,
      department_id INTEGER NOT NULL,
      FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
      FOREIGN KEY (department_id) REFERENCES departments(id),
      UNIQUE(campaign_id, department_id)
    );

    CREATE TABLE IF NOT EXISTS recipient_assignments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recipient_id INTEGER NOT NULL,
      department_id INTEGER,
      participant_id INTEGER,
      assignment_source TEXT NOT NULL,
      confidence TEXT NOT NULL DEFAULT 'high',
      evidence TEXT,
      assigned_at TEXT NOT NULL,
      FOREIGN KEY (recipient_id) REFERENCES recipients(id) ON DELETE CASCADE,
      FOREIGN KEY (department_id) REFERENCES departments(id),
      FOREIGN KEY (participant_id) REFERENCES department_participants(id)
    );
  `);

  // Create indexes (idempotent)
  await dbInstance.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_dp_dept_email
      ON department_participants(department_id, email);
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
  if (!colNames.includes('assigned_department_id')) {
    await dbInstance.exec(`ALTER TABLE recipients ADD COLUMN assigned_department_id INTEGER;`);
  }
  if (!colNames.includes('assigned_participant_id')) {
    await dbInstance.exec(`ALTER TABLE recipients ADD COLUMN assigned_participant_id INTEGER;`);
  }
  if (!colNames.includes('send_status')) {
    await dbInstance.exec(`ALTER TABLE recipients ADD COLUMN send_status TEXT DEFAULT 'pending';`);
    await dbInstance.exec(`UPDATE recipients SET send_status = 'sent' WHERE send_status = 'pending'`); // existing are sent
  }

  const campaignColumns = await dbInstance.all(`PRAGMA table_info(campaigns);`);
  const cColNames = campaignColumns.map(c => c.name);
  if (!cColNames.includes('schedule_at')) await dbInstance.exec(`ALTER TABLE campaigns ADD COLUMN schedule_at TEXT;`);
  if (!cColNames.includes('schedule_timezone')) await dbInstance.exec(`ALTER TABLE campaigns ADD COLUMN schedule_timezone TEXT;`);
  if (!cColNames.includes('campaign_status')) await dbInstance.exec(`ALTER TABLE campaigns ADD COLUMN campaign_status TEXT DEFAULT 'sent';`);
  if (!cColNames.includes('frozen_recipients')) await dbInstance.exec(`ALTER TABLE campaigns ADD COLUMN frozen_recipients TEXT;`);
  if (!cColNames.includes('template_id')) await dbInstance.exec(`ALTER TABLE campaigns ADD COLUMN template_id INTEGER;`);
  if (!cColNames.includes('followup_enabled')) await dbInstance.exec(`ALTER TABLE campaigns ADD COLUMN followup_enabled INTEGER DEFAULT 0;`);
  if (!cColNames.includes('followup_days')) await dbInstance.exec(`ALTER TABLE campaigns ADD COLUMN followup_days INTEGER DEFAULT 3;`);
  if (!cColNames.includes('followup_template_id')) await dbInstance.exec(`ALTER TABLE campaigns ADD COLUMN followup_template_id INTEGER;`);

  if (!colNames.includes('followup_status')) {
    await dbInstance.exec(`ALTER TABLE recipients ADD COLUMN followup_status TEXT DEFAULT 'none';`);
  }

  // Check and remove NOT NULL constraint on campaigns.sent_at
  const cInfo = await dbInstance.all("PRAGMA table_info(campaigns);");
  const cSentAt = cInfo.find(c => c.name === 'sent_at');
  if (cSentAt && cSentAt.notnull === 1) {
    console.log('Migrating campaigns table to allow NULL sent_at...');
    await dbInstance.exec('PRAGMA foreign_keys=off;');
    await dbInstance.exec('BEGIN TRANSACTION;');
    await dbInstance.exec(`
      CREATE TABLE campaigns_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        subject TEXT NOT NULL,
        body TEXT NOT NULL,
        sender_email TEXT,
        sent_at TEXT,
        total_recipients INTEGER DEFAULT 0,
        schedule_at TEXT,
        schedule_timezone TEXT,
        campaign_status TEXT DEFAULT 'sent',
        frozen_recipients TEXT,
        template_id INTEGER,
        followup_enabled INTEGER DEFAULT 0,
        followup_days INTEGER DEFAULT 3,
        followup_template_id INTEGER,
        created_at TEXT NOT NULL
      );
    `);
    const cols = cInfo.map(c => c.name).join(', ');
    await dbInstance.exec(`INSERT INTO campaigns_new (${cols}) SELECT ${cols} FROM campaigns;`);
    await dbInstance.exec('DROP TABLE campaigns;');
    await dbInstance.exec('ALTER TABLE campaigns_new RENAME TO campaigns;');
    await dbInstance.exec('COMMIT;');
    await dbInstance.exec('PRAGMA foreign_keys=on;');
  }

  // Check and remove NOT NULL constraint on recipients.sent_at
  const rInfo = await dbInstance.all("PRAGMA table_info(recipients);");
  const rSentAt = rInfo.find(c => c.name === 'sent_at');
  if (rSentAt && rSentAt.notnull === 1) {
    console.log('Migrating recipients table to allow NULL sent_at...');
    await dbInstance.exec('PRAGMA foreign_keys=off;');
    await dbInstance.exec('BEGIN TRANSACTION;');
    await dbInstance.exec(`
      CREATE TABLE recipients_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        campaign_id INTEGER NOT NULL,
        email TEXT NOT NULL,
        name TEXT,
        status TEXT NOT NULL DEFAULT 'SENT',
        send_status TEXT DEFAULT 'pending',
        sent_at TEXT,
        first_opened_at TEXT,
        last_opened_at TEXT,
        open_count INTEGER DEFAULT 0,
        first_replied_at TEXT,
        reply_count INTEGER DEFAULT 0,
        followup_status TEXT DEFAULT 'none',
        tat_open_seconds INTEGER,
        tat_reply_seconds INTEGER,
        gmail_thread_id TEXT,
        gmail_message_id TEXT,
        reply_snippet TEXT,
        assignee_id INTEGER,
        assigned_at TEXT,
        assigned_by TEXT,
        assignment_rule TEXT,
        assignment_reason TEXT,
        assignment_confidence TEXT,
        matching_evidence TEXT,
        actioned_by INTEGER,
        actioned_at TEXT,
        latest_reply_message_id TEXT,
        latest_reply_sender_name TEXT,
        latest_reply_sender_email TEXT,
        latest_reply_body_text TEXT,
        assigned_department_id INTEGER,
        assigned_participant_id INTEGER,
        FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
      );
    `);
    const cols = rInfo.map(c => c.name).join(', ');
    await dbInstance.exec(`INSERT INTO recipients_new (${cols}) SELECT ${cols} FROM recipients;`);
    await dbInstance.exec('DROP TABLE recipients;');
    await dbInstance.exec('ALTER TABLE recipients_new RENAME TO recipients;');
    await dbInstance.exec('COMMIT;');
    await dbInstance.exec('PRAGMA foreign_keys=on;');
  }

  return dbInstance;
}

module.exports = { getDb };
