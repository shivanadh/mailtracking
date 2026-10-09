const express = require('express');
const { getDb } = require('./db');

const router = express.Router();

// Email validation regex
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Format seconds into human readable TAT string (same as server.js)
function formatTAT(seconds) {
  if (seconds === null || seconds === undefined) return 'N/A';
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  if (mins < 60) {
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  }
  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  if (hours < 24) {
    return `${hours}h ${remMins}m`;
  }
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  return `${days}d ${remHours}h`;
}

// =============================================================
// DEPARTMENT CRUD
// =============================================================

// GET /api/departments - List all departments
router.get('/api/departments', async (req, res) => {
  try {
    const db = await getDb();
    const { status } = req.query;

    let query = `
      SELECT d.*,
        (SELECT COUNT(*) FROM department_participants dp WHERE dp.department_id = d.id AND dp.status = 'active') AS active_participant_count,
        (SELECT COUNT(*) FROM department_participants dp WHERE dp.department_id = d.id) AS total_participant_count,
        (SELECT COUNT(DISTINCT cd.campaign_id) FROM campaign_departments cd WHERE cd.department_id = d.id) AS campaign_count
      FROM departments d
    `;
    const params = [];

    if (status && (status === 'active' || status === 'archived')) {
      query += ' WHERE d.status = ?';
      params.push(status);
    }

    query += ' ORDER BY d.created_at DESC';

    const departments = await db.all(query, params);
    res.json(departments);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/departments - Create a department
router.post('/api/departments', async (req, res) => {
  try {
    const { name, description } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Department name is required.' });
    }

    const trimmedName = name.trim();
    if (trimmedName.length > 100) {
      return res.status(400).json({ error: 'Department name must be 100 characters or less.' });
    }

    const db = await getDb();

    // Check uniqueness
    const existing = await db.get('SELECT id FROM departments WHERE LOWER(name) = LOWER(?)', [trimmedName]);
    if (existing) {
      return res.status(409).json({ error: 'A department with this name already exists.' });
    }

    const now = new Date().toISOString();
    const result = await db.run(
      'INSERT INTO departments (name, description, status, created_at) VALUES (?, ?, ?, ?)',
      [trimmedName, (description || '').trim() || null, 'active', now]
    );

    const department = await db.get('SELECT * FROM departments WHERE id = ?', [result.lastID]);
    res.status(201).json(department);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/departments/:id - Get department detail
router.get('/api/departments/:id', async (req, res) => {
  try {
    const db = await getDb();
    const deptId = parseInt(req.params.id, 10);

    const department = await db.get('SELECT * FROM departments WHERE id = ?', [deptId]);
    if (!department) {
      return res.status(404).json({ error: 'Department not found.' });
    }

    const participants = await db.all(
      'SELECT * FROM department_participants WHERE department_id = ? ORDER BY name ASC',
      [deptId]
    );

    const accountCodes = await db.all(
      'SELECT * FROM department_account_codes WHERE department_id = ? ORDER BY account_code ASC',
      [deptId]
    );

    const campaignCount = await db.get(
      'SELECT COUNT(DISTINCT campaign_id) AS count FROM campaign_departments WHERE department_id = ?',
      [deptId]
    );

    res.json({
      ...department,
      participants,
      account_codes: accountCodes,
      active_participant_count: participants.filter(p => p.status === 'active').length,
      total_participant_count: participants.length,
      campaign_count: campaignCount.count
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/departments/:id - Edit department name/description
router.put('/api/departments/:id', async (req, res) => {
  try {
    const db = await getDb();
    const deptId = parseInt(req.params.id, 10);
    const { name, description } = req.body;

    const department = await db.get('SELECT * FROM departments WHERE id = ?', [deptId]);
    if (!department) {
      return res.status(404).json({ error: 'Department not found.' });
    }

    if (name !== undefined) {
      const trimmedName = (name || '').trim();
      if (!trimmedName) {
        return res.status(400).json({ error: 'Department name cannot be empty.' });
      }
      if (trimmedName.length > 100) {
        return res.status(400).json({ error: 'Department name must be 100 characters or less.' });
      }
      // Check uniqueness (excluding self)
      const existing = await db.get(
        'SELECT id FROM departments WHERE LOWER(name) = LOWER(?) AND id != ?',
        [trimmedName, deptId]
      );
      if (existing) {
        return res.status(409).json({ error: 'A department with this name already exists.' });
      }
    }

    await db.run(
      'UPDATE departments SET name = COALESCE(?, name), description = COALESCE(?, description) WHERE id = ?',
      [
        name !== undefined ? name.trim() : null,
        description !== undefined ? (description || '').trim() || null : undefined,
        deptId
      ]
    );

    // Manual update for description allowing null
    if (description !== undefined) {
      await db.run('UPDATE departments SET description = ? WHERE id = ?', [(description || '').trim() || null, deptId]);
    }
    if (name !== undefined) {
      await db.run('UPDATE departments SET name = ? WHERE id = ?', [name.trim(), deptId]);
    }

    const updated = await db.get('SELECT * FROM departments WHERE id = ?', [deptId]);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/departments/:id/archive - Archive a department
router.post('/api/departments/:id/archive', async (req, res) => {
  try {
    const db = await getDb();
    const deptId = parseInt(req.params.id, 10);

    const department = await db.get('SELECT * FROM departments WHERE id = ?', [deptId]);
    if (!department) {
      return res.status(404).json({ error: 'Department not found.' });
    }

    await db.run('UPDATE departments SET status = ? WHERE id = ?', ['archived', deptId]);
    res.json({ success: true, message: 'Department archived successfully.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/departments/:id/restore - Restore an archived department
router.post('/api/departments/:id/restore', async (req, res) => {
  try {
    const db = await getDb();
    const deptId = parseInt(req.params.id, 10);

    const department = await db.get('SELECT * FROM departments WHERE id = ?', [deptId]);
    if (!department) {
      return res.status(404).json({ error: 'Department not found.' });
    }

    await db.run('UPDATE departments SET status = ? WHERE id = ?', ['active', deptId]);
    res.json({ success: true, message: 'Department restored successfully.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/departments/:id - Delete department (only if no campaign history)
router.delete('/api/departments/:id', async (req, res) => {
  try {
    const db = await getDb();
    const deptId = parseInt(req.params.id, 10);

    const department = await db.get('SELECT * FROM departments WHERE id = ?', [deptId]);
    if (!department) {
      return res.status(404).json({ error: 'Department not found.' });
    }

    // Check for campaign history
    const campaignLink = await db.get(
      'SELECT id FROM campaign_departments WHERE department_id = ?',
      [deptId]
    );
    if (campaignLink) {
      return res.status(409).json({
        error: 'This department has campaign history and cannot be deleted. Please archive it instead.',
        hasCampaignHistory: true
      });
    }

    // Safe to delete — no campaign history
    await db.run('DELETE FROM department_account_codes WHERE department_id = ?', [deptId]);
    await db.run('DELETE FROM department_participants WHERE department_id = ?', [deptId]);
    await db.run('DELETE FROM departments WHERE id = ?', [deptId]);

    res.json({ success: true, message: 'Department deleted successfully.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =============================================================
// PARTICIPANT CRUD
// =============================================================

// GET /api/departments/:id/participants
router.get('/api/departments/:id/participants', async (req, res) => {
  try {
    const db = await getDb();
    const deptId = parseInt(req.params.id, 10);

    const department = await db.get('SELECT id FROM departments WHERE id = ?', [deptId]);
    if (!department) {
      return res.status(404).json({ error: 'Department not found.' });
    }

    const participants = await db.all(
      'SELECT * FROM department_participants WHERE department_id = ? ORDER BY name ASC',
      [deptId]
    );
    res.json(participants);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/departments/:id/participants - Add participant
router.post('/api/departments/:id/participants', async (req, res) => {
  try {
    const db = await getDb();
    const deptId = parseInt(req.params.id, 10);
    const { name, email, employee_id } = req.body;

    const department = await db.get('SELECT id FROM departments WHERE id = ?', [deptId]);
    if (!department) {
      return res.status(404).json({ error: 'Department not found.' });
    }

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Participant name is required.' });
    }
    if (!email || !email.trim()) {
      return res.status(400).json({ error: 'Participant email is required.' });
    }

    const trimmedEmail = email.trim().toLowerCase();
    if (!EMAIL_REGEX.test(trimmedEmail)) {
      return res.status(400).json({ error: 'Invalid email address format.' });
    }

    // Check uniqueness within department
    const existing = await db.get(
      'SELECT id FROM department_participants WHERE department_id = ? AND LOWER(email) = ?',
      [deptId, trimmedEmail]
    );
    if (existing) {
      return res.status(409).json({ error: 'A participant with this email already exists in this department.' });
    }

    const now = new Date().toISOString();
    const result = await db.run(
      `INSERT INTO department_participants (department_id, name, email, employee_id, status, created_at)
       VALUES (?, ?, ?, ?, 'active', ?)`,
      [deptId, name.trim(), trimmedEmail, (employee_id || '').trim() || null, now]
    );

    const participant = await db.get('SELECT * FROM department_participants WHERE id = ?', [result.lastID]);
    res.status(201).json(participant);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/departments/:id/participants/:pid - Edit participant
router.put('/api/departments/:id/participants/:pid', async (req, res) => {
  try {
    const db = await getDb();
    const deptId = parseInt(req.params.id, 10);
    const pid = parseInt(req.params.pid, 10);
    const { name, email, employee_id, status } = req.body;

    const participant = await db.get(
      'SELECT * FROM department_participants WHERE id = ? AND department_id = ?',
      [pid, deptId]
    );
    if (!participant) {
      return res.status(404).json({ error: 'Participant not found in this department.' });
    }

    if (email !== undefined) {
      const trimmedEmail = (email || '').trim().toLowerCase();
      if (!trimmedEmail || !EMAIL_REGEX.test(trimmedEmail)) {
        return res.status(400).json({ error: 'Invalid email address format.' });
      }
      // Check uniqueness (excluding self)
      const existing = await db.get(
        'SELECT id FROM department_participants WHERE department_id = ? AND LOWER(email) = ? AND id != ?',
        [deptId, trimmedEmail, pid]
      );
      if (existing) {
        return res.status(409).json({ error: 'A participant with this email already exists in this department.' });
      }
    }

    if (name !== undefined && (!name || !name.trim())) {
      return res.status(400).json({ error: 'Participant name cannot be empty.' });
    }

    if (status !== undefined && status !== 'active' && status !== 'inactive') {
      return res.status(400).json({ error: 'Status must be "active" or "inactive".' });
    }

    // Build update
    const updates = {};
    if (name !== undefined) updates.name = name.trim();
    if (email !== undefined) updates.email = email.trim().toLowerCase();
    if (employee_id !== undefined) updates.employee_id = employee_id.trim() || null;
    if (status !== undefined) updates.status = status;

    const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
    const values = Object.values(updates);
    values.push(pid);

    await db.run(`UPDATE department_participants SET ${setClauses} WHERE id = ?`, values);

    const updated = await db.get('SELECT * FROM department_participants WHERE id = ?', [pid]);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/departments/:id/participants/:pid - Remove participant
router.delete('/api/departments/:id/participants/:pid', async (req, res) => {
  try {
    const db = await getDb();
    const deptId = parseInt(req.params.id, 10);
    const pid = parseInt(req.params.pid, 10);

    const participant = await db.get(
      'SELECT * FROM department_participants WHERE id = ? AND department_id = ?',
      [pid, deptId]
    );
    if (!participant) {
      return res.status(404).json({ error: 'Participant not found in this department.' });
    }

    // Do NOT delete — just remove from department. Historical assignments are preserved.
    await db.run('DELETE FROM department_participants WHERE id = ?', [pid]);
    res.json({ success: true, message: 'Participant removed from department.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =============================================================
// ACCOUNT CODE CRUD
// =============================================================

// GET /api/departments/:id/account-codes
router.get('/api/departments/:id/account-codes', async (req, res) => {
  try {
    const db = await getDb();
    const deptId = parseInt(req.params.id, 10);

    const codes = await db.all(
      'SELECT * FROM department_account_codes WHERE department_id = ? ORDER BY account_code ASC',
      [deptId]
    );
    res.json(codes);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/departments/:id/account-codes - Add account code
router.post('/api/departments/:id/account-codes', async (req, res) => {
  try {
    const db = await getDb();
    const deptId = parseInt(req.params.id, 10);
    const { account_code, description } = req.body;

    const department = await db.get('SELECT id FROM departments WHERE id = ?', [deptId]);
    if (!department) {
      return res.status(404).json({ error: 'Department not found.' });
    }

    if (!account_code || !account_code.trim()) {
      return res.status(400).json({ error: 'Account code is required.' });
    }

    const trimmedCode = account_code.trim();

    // Check uniqueness
    const existing = await db.get(
      'SELECT id FROM department_account_codes WHERE department_id = ? AND LOWER(account_code) = LOWER(?)',
      [deptId, trimmedCode]
    );
    if (existing) {
      return res.status(409).json({ error: 'This account code already exists for this department.' });
    }

    const now = new Date().toISOString();
    const result = await db.run(
      'INSERT INTO department_account_codes (department_id, account_code, description, created_at) VALUES (?, ?, ?, ?)',
      [deptId, trimmedCode, (description || '').trim() || null, now]
    );

    const code = await db.get('SELECT * FROM department_account_codes WHERE id = ?', [result.lastID]);
    res.status(201).json(code);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/departments/:id/account-codes/:cid
router.delete('/api/departments/:id/account-codes/:cid', async (req, res) => {
  try {
    const db = await getDb();
    const cid = parseInt(req.params.cid, 10);
    const deptId = parseInt(req.params.id, 10);

    const code = await db.get(
      'SELECT * FROM department_account_codes WHERE id = ? AND department_id = ?',
      [cid, deptId]
    );
    if (!code) {
      return res.status(404).json({ error: 'Account code not found.' });
    }

    await db.run('DELETE FROM department_account_codes WHERE id = ?', [cid]);
    res.json({ success: true, message: 'Account code removed.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =============================================================
// DEPARTMENT STATS / REPORTING
// =============================================================

router.get('/api/departments/:id/stats', async (req, res) => {
  try {
    const db = await getDb();
    const deptId = parseInt(req.params.id, 10);

    const department = await db.get('SELECT * FROM departments WHERE id = ?', [deptId]);
    if (!department) {
      return res.status(404).json({ error: 'Department not found.' });
    }

    // Get campaigns linked to this department
    const campaigns = await db.all(`
      SELECT c.* FROM campaigns c
      JOIN campaign_departments cd ON c.id = cd.campaign_id
      WHERE cd.department_id = ?
      ORDER BY c.sent_at DESC
    `, [deptId]);

    // Get all recipients assigned to this department
    const recipients = await db.all(`
      SELECT r.*, c.subject AS campaign_subject, c.title AS campaign_title
      FROM recipients r
      JOIN campaigns c ON r.campaign_id = c.id
      WHERE r.assigned_department_id = ?
      ORDER BY r.sent_at DESC
    `, [deptId]);

    const participants = await db.all(
      'SELECT * FROM department_participants WHERE department_id = ? ORDER BY name ASC',
      [deptId]
    );

    const totalRecipients = recipients.length;
    const actionedCount = recipients.filter(r => r.status === 'REPLIED').length;
    const pendingCount = totalRecipients - actionedCount;

    // Average reply TAT
    const replyTats = recipients
      .filter(r => r.tat_reply_seconds !== null && r.tat_reply_seconds !== undefined)
      .map(r => r.tat_reply_seconds);
    const avgReplyTatSec = replyTats.length
      ? Math.round(replyTats.reduce((a, b) => a + b, 0) / replyTats.length)
      : null;

    // SLA breached
    const SLA_LIMIT_SECONDS = 48 * 3600;
    const nowMs = Date.now();

    let slaBreachedCount = 0;
    for (const r of recipients) {
      if (r.status === 'REPLIED') {
        if (r.tat_reply_seconds && r.tat_reply_seconds > SLA_LIMIT_SECONDS) slaBreachedCount++;
      } else {
        const waitSec = Math.max(0, Math.floor((nowMs - new Date(r.sent_at).getTime()) / 1000));
        if (waitSec > SLA_LIMIT_SECONDS) slaBreachedCount++;
      }
    }

    // Assignment breakdown
    const assignmentBreakdown = await db.all(`
      SELECT assignment_source, COUNT(*) AS count
      FROM recipient_assignments ra
      JOIN recipients r ON ra.recipient_id = r.id
      WHERE r.assigned_department_id = ? OR (ra.department_id = ?)
      GROUP BY assignment_source
    `, [deptId, deptId]);

    res.json({
      department,
      participants,
      campaigns: campaigns.map(c => ({ id: c.id, title: c.title, subject: c.subject, sent_at: c.sent_at })),
      stats: {
        total_recipients: totalRecipients,
        actioned_count: actionedCount,
        pending_count: pendingCount,
        avg_reply_tat_seconds: avgReplyTatSec,
        avg_reply_tat_formatted: formatTAT(avgReplyTatSec),
        sla_breached_count: slaBreachedCount,
        assignment_breakdown: assignmentBreakdown
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =============================================================
// PARTICIPANT DETAIL LOGS
// =============================================================

router.get('/api/departments/:id/participants/:pid/logs', async (req, res) => {
  try {
    const db = await getDb();
    const pid = parseInt(req.params.pid, 10);

    const participant = await db.get('SELECT * FROM department_participants WHERE id = ?', [pid]);
    if (!participant) {
      return res.status(404).json({ error: 'Participant not found.' });
    }

    // Find all recipients assigned to this participant
    const recipients = await db.all(`
      SELECT r.*, c.subject AS campaign_subject, c.title AS campaign_title,
             ra.assignment_source, ra.confidence, ra.evidence
      FROM recipients r
      JOIN campaigns c ON r.campaign_id = c.id
      LEFT JOIN recipient_assignments ra ON ra.recipient_id = r.id
      WHERE r.assigned_participant_id = ?
      ORDER BY r.sent_at DESC
    `, [pid]);

    const nowMs = Date.now();
    const formattedRecipients = recipients.map(r => {
      const sentMs = new Date(r.sent_at).getTime();
      const waitingTatSec = Math.max(0, Math.floor((nowMs - sentMs) / 1000));
      return {
        ...r,
        waiting_tat_seconds: waitingTatSec,
        waiting_tat_formatted: formatTAT(waitingTatSec),
        tat_open_formatted: formatTAT(r.tat_open_seconds),
        tat_reply_formatted: formatTAT(r.tat_reply_seconds)
      };
    });

    res.json({
      participant,
      recipients: formattedRecipients
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
