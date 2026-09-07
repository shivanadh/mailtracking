const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { getDb } = require('./db');
const { getSettings, saveSettings, generateAuthUrl, handleAuthCallback } = require('./googleAuth');
const { sendCampaign } = require('./mailer');
const { syncReplies, simulateReply } = require('./replyPoller');
const { evaluateAutoAssignment, applyAssignment } = require('./assignmentEngine');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// 1x1 Transparent PNG Buffer
const TRANSPARENT_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSU5EUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64'
);

// Format seconds into human readable TAT string
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

// -------------------------------------------------------------
// TRACKING PIXEL ENDPOINT
// -------------------------------------------------------------
app.get('/api/track/pixel/:recipientId.png', async (req, res) => {
  const recipientId = parseInt(req.params.recipientId, 10);
  
  // Always return the pixel image quickly
  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0, private');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.send(TRANSPARENT_PNG);

  // Process logging asynchronously
  if (isNaN(recipientId)) return;

  try {
    const db = await getDb();
    const recipient = await db.get('SELECT * FROM recipients WHERE id = ?', [recipientId]);
    if (!recipient) return;

    const now = new Date().toISOString();
    const nowMs = Date.now();
    const sentMs = new Date(recipient.sent_at).getTime();
    const tatOpenSeconds = Math.max(0, Math.floor((nowMs - sentMs) / 1000));

    const isFirstOpen = !recipient.first_opened_at;
    const newStatus = recipient.status === 'SENT' ? 'OPENED' : recipient.status;

    await db.run(
      `UPDATE recipients 
       SET status = ?,
           first_opened_at = COALESCE(first_opened_at, ?),
           last_opened_at = ?,
           open_count = open_count + 1,
           tat_open_seconds = COALESCE(tat_open_seconds, ?)
       WHERE id = ?`,
      [newStatus, now, now, tatOpenSeconds, recipientId]
    );

    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
    const userAgent = req.headers['user-agent'] || 'Unknown';

    await db.run(
      `INSERT INTO tracking_logs (recipient_id, event_type, timestamp, ip_address, user_agent, details)
       VALUES (?, 'OPEN', ?, ?, ?, ?)`,
      [recipientId, now, ip, userAgent, JSON.stringify({ isFirstOpen, totalOpens: recipient.open_count + 1 })]
    );
  } catch (err) {
    console.error(`Error logging pixel open for recipient ${recipientId}:`, err.message);
  }
});

// -------------------------------------------------------------
// CAMPAIGN ENDPOINTS
// -------------------------------------------------------------
app.post('/api/campaigns', async (req, res) => {
  try {
    const { title, subject, body, recipients } = req.body;

    if (!subject || !body || !recipients || !Array.isArray(recipients) || recipients.length === 0) {
      return res.status(400).json({ error: 'Subject, body, and a non-empty list of recipients are required.' });
    }

    const protocol = req.protocol;
    const host = req.get('host');
    const baseUrl = process.env.PUBLIC_URL || `${protocol}://${host}`;

    const result = await sendCampaign({ title, subject, body, recipients, baseUrl });
    res.status(201).json(result);
  } catch (err) {
    console.error('Error creating campaign:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/campaigns', async (req, res) => {
  try {
    const db = await getDb();
    const campaigns = await db.all(`
      SELECT c.*,
        COUNT(r.id) as total_recipients,
        SUM(CASE WHEN r.status IN ('OPENED', 'REPLIED') THEN 1 ELSE 0 END) as opened_count,
        SUM(CASE WHEN r.status = 'REPLIED' THEN 1 ELSE 0 END) as replied_count,
        AVG(r.tat_open_seconds) as avg_tat_open_seconds,
        AVG(r.tat_reply_seconds) as avg_tat_reply_seconds
      FROM campaigns c
      LEFT JOIN recipients r ON c.id = r.campaign_id
      GROUP BY c.id
      ORDER BY c.id DESC
    `);

    const formatted = campaigns.map(c => ({
      ...c,
      avg_tat_open_formatted: formatTAT(c.avg_tat_open_seconds ? Math.round(c.avg_tat_open_seconds) : null),
      avg_tat_reply_formatted: formatTAT(c.avg_tat_reply_seconds ? Math.round(c.avg_tat_reply_seconds) : null),
      open_rate: c.total_recipients ? Math.round(((c.opened_count || 0) / c.total_recipients) * 100) : 0,
      reply_rate: c.total_recipients ? Math.round(((c.replied_count || 0) / c.total_recipients) * 100) : 0
    }));

    res.json(formatted);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/campaigns/:id', async (req, res) => {
  try {
    const campaignId = parseInt(req.params.id, 10);
    const db = await getDb();

    const campaign = await db.get('SELECT * FROM campaigns WHERE id = ?', [campaignId]);
    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    const recipients = await db.all('SELECT * FROM recipients WHERE campaign_id = ? ORDER BY id ASC', [campaignId]);

    const formattedRecipients = recipients.map(r => ({
      ...r,
      tat_open_formatted: formatTAT(r.tat_open_seconds),
      tat_reply_formatted: formatTAT(r.tat_reply_seconds)
    }));

    // Campaign metrics
    const openedCount = recipients.filter(r => r.status === 'OPENED' || r.status === 'REPLIED').length;
    const repliedCount = recipients.filter(r => r.status === 'REPLIED').length;

    const openTats = recipients.filter(r => r.tat_open_seconds !== null).map(r => r.tat_open_seconds);
    const replyTats = recipients.filter(r => r.tat_reply_seconds !== null).map(r => r.tat_reply_seconds);

    const avgTatOpenSec = openTats.length ? Math.round(openTats.reduce((a, b) => a + b, 0) / openTats.length) : null;
    const avgTatReplySec = replyTats.length ? Math.round(replyTats.reduce((a, b) => a + b, 0) / replyTats.length) : null;

    res.json({
      ...campaign,
      recipients: formattedRecipients,
      metrics: {
        total_recipients: recipients.length,
        opened_count: openedCount,
        replied_count: repliedCount,
        open_rate: recipients.length ? Math.round((openedCount / recipients.length) * 100) : 0,
        reply_rate: recipients.length ? Math.round((repliedCount / recipients.length) * 100) : 0,
        avg_tat_open_seconds: avgTatOpenSec,
        avg_tat_open_formatted: formatTAT(avgTatOpenSec),
        avg_tat_reply_seconds: avgTatReplySec,
        avg_tat_reply_formatted: formatTAT(avgTatReplySec)
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/campaigns/:id', async (req, res) => {
  try {
    const campaignId = parseInt(req.params.id, 10);
    const db = await getDb();
    await db.run('DELETE FROM campaigns WHERE id = ?', [campaignId]);
    res.json({ success: true, message: 'Campaign deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// TEAM OVERALL STATS & 48H SLA METRICS ENDPOINT
// -------------------------------------------------------------
app.get('/api/stats/team', async (req, res) => {
  try {
    const db = await getDb();
    const recipients = await db.all('SELECT * FROM recipients');
    const totalReceived = recipients.length;

    const actionedRecipients = recipients.filter(r => r.status === 'REPLIED');
    const pendingRecipients = recipients.filter(r => r.status !== 'REPLIED');

    const totalActioned = actionedRecipients.length;
    const totalPending = pendingRecipients.length;

    const actionedPercent = totalReceived ? Math.round((totalActioned / totalReceived) * 100) : 0;
    const pendingPercent = totalReceived ? Math.round((totalPending / totalReceived) * 100) : 0;

    // Actioned TAT (tat_reply_seconds)
    const actionedTats = actionedRecipients
      .filter(r => r.tat_reply_seconds !== null && r.tat_reply_seconds !== undefined)
      .map(r => r.tat_reply_seconds);
    const avgTatActionedSec = actionedTats.length
      ? Math.round(actionedTats.reduce((a, b) => a + b, 0) / actionedTats.length)
      : null;

    // Pending TAT (Elapsed time from sent_at to now)
    const nowMs = Date.now();
    const pendingTats = pendingRecipients.map(r => {
      const sentMs = new Date(r.sent_at).getTime();
      return Math.max(0, Math.floor((nowMs - sentMs) / 1000));
    });
    const avgTatPendingSec = pendingTats.length
      ? Math.round(pendingTats.reduce((a, b) => a + b, 0) / pendingTats.length)
      : null;

    // 48-Hour SLA (48 * 3600 = 172800 seconds)
    const SLA_LIMIT_SECONDS = 48 * 3600;
    const actionedWithinSla = actionedTats.filter(t => t <= SLA_LIMIT_SECONDS).length;
    const pendingOverSla = pendingTats.filter(t => t > SLA_LIMIT_SECONDS).length;

    const slaComplianceRate = totalActioned
      ? Math.round((actionedWithinSla / totalActioned) * 100)
      : (totalReceived ? 100 : 0);

    res.json({
      total_received: totalReceived,
      total_actioned: totalActioned,
      total_pending: totalPending,
      actioned_percent: actionedPercent,
      pending_percent: pendingPercent,
      avg_tat_actioned_seconds: avgTatActionedSec,
      avg_tat_actioned_formatted: formatTAT(avgTatActionedSec),
      avg_tat_pending_seconds: avgTatPendingSec,
      avg_tat_pending_formatted: formatTAT(avgTatPendingSec),
      sla_target_hours: 48,
      actioned_within_sla_count: actionedWithinSla,
      pending_over_sla_count: pendingOverSla,
      sla_compliance_rate: slaComplianceRate
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// RECIPIENT LOGS FOR ACTIONED VS PENDING DRAWER
// -------------------------------------------------------------
app.get('/api/stats/recipients', async (req, res) => {
  try {
    const { status, search, campaignId, assigneeId } = req.query;
    const db = await getDb();

    let query = `
      SELECT 
        r.*,
        c.subject AS campaign_subject,
        c.title AS campaign_title,
        tm.name AS assignee_name,
        tm.email AS assignee_email,
        tm.team AS assignee_team
      FROM recipients r
      JOIN campaigns c ON r.campaign_id = c.id
      LEFT JOIN team_members tm ON r.assignee_id = tm.id
      WHERE 1=1
    `;
    const params = [];

    if (status === 'actioned') {
      query += ` AND r.status = 'REPLIED'`;
    } else if (status === 'pending') {
      query += ` AND r.status != 'REPLIED'`;
    }

    if (campaignId) {
      query += ` AND r.campaign_id = ?`;
      params.push(parseInt(campaignId, 10));
    }

    if (assigneeId !== undefined && assigneeId !== '') {
      if (assigneeId === 'unassigned' || assigneeId === 'null') {
        query += ` AND r.assignee_id IS NULL`;
      } else {
        query += ` AND r.assignee_id = ?`;
        params.push(parseInt(assigneeId, 10));
      }
    }

    if (search && search.trim()) {
      const searchTerm = `%${search.trim()}%`;
      query += ` AND (r.name LIKE ? OR r.email LIKE ? OR c.subject LIKE ? OR c.title LIKE ? OR tm.name LIKE ?)`;
      params.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
    }

    query += ` ORDER BY r.id DESC`;

    const recipients = await db.all(query, params);

    const allRecipients = await db.all('SELECT status FROM recipients');
    const totalReceived = allRecipients.length;
    const totalActioned = allRecipients.filter(r => r.status === 'REPLIED').length;
    const totalPending = allRecipients.filter(r => r.status !== 'REPLIED').length;

    const SLA_LIMIT_SECONDS = 48 * 3600; // 48 Hours Target
    const SLA_WARNING_SECONDS = 24 * 3600; // 24 Hours

    const nowMs = Date.now();

    const formattedRecipients = recipients.map(r => {
      const sentMs = new Date(r.sent_at).getTime();
      const waitingTatSec = Math.max(0, Math.floor((nowMs - sentMs) / 1000));
      
      let slaStatus = 'ON_TRACK';
      let slaLabel = 'On Track';

      if (r.status === 'REPLIED') {
        const tat = r.tat_reply_seconds ?? waitingTatSec;
        if (tat > SLA_LIMIT_SECONDS) {
          slaStatus = 'BREACHED';
          slaLabel = 'Breached';
        } else {
          slaStatus = 'ON_TRACK';
          slaLabel = 'On Track';
        }
      } else {
        // Pending
        if (waitingTatSec > SLA_LIMIT_SECONDS) {
          slaStatus = 'BREACHED';
          slaLabel = 'Breached (>48h)';
        } else if (waitingTatSec > SLA_WARNING_SECONDS) {
          slaStatus = 'AT_RISK';
          slaLabel = 'At Risk (24-48h)';
        } else {
          slaStatus = 'ON_TRACK';
          slaLabel = 'On Track (<24h)';
        }
      }

      return {
        ...r,
        waiting_tat_seconds: waitingTatSec,
        waiting_tat_formatted: formatTAT(waitingTatSec),
        tat_open_formatted: formatTAT(r.tat_open_seconds),
        tat_reply_formatted: formatTAT(r.tat_reply_seconds),
        sla_status: slaStatus,
        sla_label: slaLabel
      };
    });

    res.json({
      total_received: totalReceived,
      total_actioned: totalActioned,
      total_pending: totalPending,
      filtered_count: formattedRecipients.length,
      recipients: formattedRecipients
    });
  } catch (err) {
    console.error('Error fetching recipient stats:', err);
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// TEAM MEMBERS MANAGEMENT ENDPOINTS
// -------------------------------------------------------------
app.get('/api/team-members', async (req, res) => {
  try {
    const { team, active_status } = req.query;
    const db = await getDb();
    let query = `SELECT * FROM team_members WHERE 1=1`;
    const params = [];

    if (team) {
      query += ` AND team = ?`;
      params.push(team);
    }
    if (active_status !== undefined) {
      query += ` AND active_status = ?`;
      params.push(parseInt(active_status, 10));
    }
    query += ` ORDER BY name ASC`;

    const members = await db.all(query, params);
    res.json(members);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/team-members', async (req, res) => {
  try {
    const { name, email, team, capacity_status } = req.body;
    if (!name || !email) {
      return res.status(400).json({ error: 'Name and email are required.' });
    }
    const db = await getDb();
    const now = new Date().toISOString();

    const result = await db.run(
      `INSERT INTO team_members (name, email, team, active_status, capacity_status, created_at)
       VALUES (?, ?, ?, 1, ?, ?)`,
      [name.trim(), email.trim().toLowerCase(), (team || 'General').trim(), capacity_status || 'AVAILABLE', now]
    );

    const created = await db.get(`SELECT * FROM team_members WHERE id = ?`, [result.lastID]);
    res.status(201).json(created);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/team-members/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { name, email, team, active_status, capacity_status } = req.body;
    const db = await getDb();

    const existing = await db.get(`SELECT * FROM team_members WHERE id = ?`, [id]);
    if (!existing) return res.status(404).json({ error: 'Team member not found' });

    await db.run(
      `UPDATE team_members
       SET name = COALESCE(?, name),
           email = COALESCE(?, email),
           team = COALESCE(?, team),
           active_status = COALESCE(?, active_status),
           capacity_status = COALESCE(?, capacity_status)
       WHERE id = ?`,
      [name, email ? email.toLowerCase() : null, team, active_status, capacity_status, id]
    );

    const updated = await db.get(`SELECT * FROM team_members WHERE id = ?`, [id]);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// ACCOUNT CODE MAPPINGS ENDPOINTS
// -------------------------------------------------------------
app.get('/api/account-mappings', async (req, res) => {
  try {
    const db = await getDb();
    const mappings = await db.all(`
      SELECT m.*, tm.name as member_name, tm.email as member_email
      FROM account_code_mappings m
      LEFT JOIN team_members tm ON m.team_member_id = tm.id
      ORDER BY m.account_code ASC
    `);
    res.json(mappings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/account-mappings', async (req, res) => {
  try {
    const { account_code, team_member_id, team_name, description, is_active } = req.body;
    if (!account_code) {
      return res.status(400).json({ error: 'Account code is required.' });
    }
    const db = await getDb();
    const now = new Date().toISOString();
    const code = account_code.trim().toUpperCase();

    await db.run(
      `INSERT INTO account_code_mappings (account_code, team_member_id, team_name, description, is_active, created_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(account_code) DO UPDATE SET
         team_member_id = excluded.team_member_id,
         team_name = excluded.team_name,
         description = excluded.description,
         is_active = excluded.is_active`,
      [
        code,
        team_member_id ? parseInt(team_member_id, 10) : null,
        team_name || null,
        description || null,
        is_active !== undefined ? (is_active ? 1 : 0) : 1,
        now
      ]
    );

    const mapping = await db.get(`
      SELECT m.*, tm.name as member_name, tm.email as member_email
      FROM account_code_mappings m
      LEFT JOIN team_members tm ON m.team_member_id = tm.id
      WHERE m.account_code = ?`, [code]);

    res.status(201).json(mapping);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/account-mappings/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const db = await getDb();
    await db.run(`DELETE FROM account_code_mappings WHERE id = ?`, [id]);
    res.json({ success: true, message: 'Mapping deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/account-mappings/import', async (req, res) => {
  try {
    const { mappings } = req.body;
    if (!Array.isArray(mappings)) {
      return res.status(400).json({ error: 'Mappings must be an array.' });
    }
    const db = await getDb();
    const now = new Date().toISOString();
    let imported = 0;

    for (const item of mappings) {
      if (!item.account_code) continue;
      const code = item.account_code.trim().toUpperCase();
      
      // Look up member by email if team_member_email is provided
      let memberId = item.team_member_id || null;
      if (!memberId && item.team_member_email) {
        const found = await db.get(`SELECT id FROM team_members WHERE email = ?`, [item.team_member_email.trim().toLowerCase()]);
        if (found) memberId = found.id;
      }

      await db.run(
        `INSERT INTO account_code_mappings (account_code, team_member_id, team_name, description, is_active, created_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(account_code) DO UPDATE SET
           team_member_id = excluded.team_member_id,
           team_name = excluded.team_name,
           description = excluded.description,
           is_active = excluded.is_active`,
        [code, memberId, item.team_name || null, item.description || null, item.is_active !== undefined ? (item.is_active ? 1 : 0) : 1, now]
      );
      imported++;
    }

    res.json({ success: true, count: imported });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// TEAM PERFORMANCE STATISTICS ENDPOINT
// -------------------------------------------------------------
app.get('/api/stats/team-performance', async (req, res) => {
  try {
    const { date_from, date_to, team, campaign_id, status } = req.query;
    const db = await getDb();

    // Fetch team members
    let memberQuery = `SELECT * FROM team_members WHERE 1=1`;
    const memberParams = [];
    if (team) {
      memberQuery += ` AND team = ?`;
      memberParams.push(team);
    }
    memberQuery += ` ORDER BY name ASC`;
    const teamMembers = await db.all(memberQuery, memberParams);

    // Fetch recipients with campaign context
    let recQuery = `
      SELECT r.*, c.subject as campaign_subject
      FROM recipients r
      JOIN campaigns c ON r.campaign_id = c.id
      WHERE 1=1
    `;
    const recParams = [];

    if (campaign_id) {
      recQuery += ` AND r.campaign_id = ?`;
      recParams.push(parseInt(campaign_id, 10));
    }
    if (status === 'actioned') {
      recQuery += ` AND r.status = 'REPLIED'`;
    } else if (status === 'pending') {
      recQuery += ` AND r.status != 'REPLIED'`;
    }
    if (date_from) {
      recQuery += ` AND r.sent_at >= ?`;
      recParams.push(date_from);
    }
    if (date_to) {
      recQuery += ` AND r.sent_at <= ?`;
      recParams.push(date_to);
    }

    const recipients = await db.all(recQuery, recParams);

    const nowMs = Date.now();
    const SLA_LIMIT_SECONDS = 48 * 3600; // 48h SLA
    const SLA_WARNING_SECONDS = 24 * 3600; // 24h SLA Warning

    // Compute metrics per team member
    const memberStats = teamMembers.map(member => {
      const assigned = recipients.filter(r => r.assignee_id === member.id);
      const actioned = assigned.filter(r => r.status === 'REPLIED');
      const pending = assigned.filter(r => r.status !== 'REPLIED');

      let slaAtRiskCount = 0;
      let slaBreachedCount = 0;
      let oldestPendingSec = null;

      pending.forEach(r => {
        const sentMs = new Date(r.sent_at).getTime();
        const elapsedSec = Math.max(0, Math.floor((nowMs - sentMs) / 1000));
        if (oldestPendingSec === null || elapsedSec > oldestPendingSec) {
          oldestPendingSec = elapsedSec;
        }
        if (elapsedSec > SLA_LIMIT_SECONDS) {
          slaBreachedCount++;
        } else if (elapsedSec > SLA_WARNING_SECONDS) {
          slaAtRiskCount++;
        }
      });

      actioned.forEach(r => {
        if (r.tat_reply_seconds > SLA_LIMIT_SECONDS) {
          slaBreachedCount++;
        }
      });

      const actionTats = actioned
        .filter(r => r.tat_reply_seconds !== null && r.tat_reply_seconds !== undefined)
        .map(r => r.tat_reply_seconds);
      const avgActionTatSec = actionTats.length
        ? Math.round(actionTats.reduce((a, b) => a + b, 0) / actionTats.length)
        : null;

      const autoAssignedCount = assigned.filter(r => r.assigned_by === 'auto-rule').length;
      const manualAssignedCount = assigned.filter(r => r.assigned_by !== 'auto-rule').length;
      const completionRate = assigned.length ? Math.round((actioned.length / assigned.length) * 100) : 0;

      return {
        id: member.id,
        name: member.name,
        email: member.email,
        team: member.team,
        active_status: member.active_status,
        capacity_status: member.capacity_status,
        total_assigned: assigned.length,
        pending_count: pending.length,
        actioned_count: actioned.length,
        sla_at_risk_count: slaAtRiskCount,
        sla_breached_count: slaBreachedCount,
        avg_action_tat_seconds: avgActionTatSec,
        avg_action_tat_formatted: formatTAT(avgActionTatSec),
        oldest_pending_seconds: oldestPendingSec,
        oldest_pending_formatted: formatTAT(oldestPendingSec),
        completion_rate: completionRate,
        auto_assigned_count: autoAssignedCount,
        manually_assigned_count: manualAssignedCount,
        has_assignments: assigned.length > 0
      };
    });

    // Unassigned items metrics
    const unassignedItems = recipients.filter(r => !r.assignee_id);
    const unassignedActioned = unassignedItems.filter(r => r.status === 'REPLIED');
    const unassignedPending = unassignedItems.filter(r => r.status !== 'REPLIED');

    let unassignedOldestPendingSec = null;
    let unassignedAtRisk = 0;
    let unassignedBreached = 0;

    unassignedPending.forEach(r => {
      const sentMs = new Date(r.sent_at).getTime();
      const elapsedSec = Math.max(0, Math.floor((nowMs - sentMs) / 1000));
      if (unassignedOldestPendingSec === null || elapsedSec > unassignedOldestPendingSec) {
        unassignedOldestPendingSec = elapsedSec;
      }
      if (elapsedSec > SLA_LIMIT_SECONDS) unassignedBreached++;
      else if (elapsedSec > SLA_WARNING_SECONDS) unassignedAtRisk++;
    });

    const unassignedStat = {
      id: null,
      name: 'Unassigned Queue',
      email: 'unassigned@system',
      team: 'Default Queue',
      active_status: 1,
      capacity_status: 'AVAILABLE',
      total_assigned: unassignedItems.length,
      pending_count: unassignedPending.length,
      actioned_count: unassignedActioned.length,
      sla_at_risk_count: unassignedAtRisk,
      sla_breached_count: unassignedBreached,
      avg_action_tat_seconds: null,
      avg_action_tat_formatted: 'N/A',
      oldest_pending_seconds: unassignedOldestPendingSec,
      oldest_pending_formatted: formatTAT(unassignedOldestPendingSec),
      completion_rate: unassignedItems.length ? Math.round((unassignedActioned.length / unassignedItems.length) * 100) : 0,
      auto_assigned_count: unassignedItems.filter(r => r.assigned_by === 'auto-rule').length,
      manually_assigned_count: unassignedItems.filter(r => r.assigned_by !== 'auto-rule').length,
      has_assignments: unassignedItems.length > 0
    };

    res.json({
      summary: {
        total_team_members: teamMembers.length,
        total_recipients: recipients.length,
        total_unassigned: unassignedItems.length
      },
      team_stats: memberStats,
      unassigned_stat: unassignedStat
    });
  } catch (err) {
    console.error('Error fetching team performance stats:', err);
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// RECIPIENT MANUAL ASSIGNMENT & AUDIT HISTORY ENDPOINTS
// -------------------------------------------------------------
app.post('/api/recipients/:id/assign', async (req, res) => {
  try {
    const recipientId = parseInt(req.params.id, 10);
    const { assignee_id, actor, note } = req.body;
    const db = await getDb();

    const recipient = await db.get(`SELECT * FROM recipients WHERE id = ?`, [recipientId]);
    if (!recipient) return res.status(404).json({ error: 'Recipient not found' });

    let assigneeName = 'Unassigned';
    if (assignee_id) {
      const member = await db.get(`SELECT name FROM team_members WHERE id = ?`, [assignee_id]);
      if (member) assigneeName = member.name;
    }

    const decision = {
      assignee_id: assignee_id || null,
      assigned_at: new Date().toISOString(),
      assigned_by: actor || 'manual',
      assignment_rule: 'manual',
      assignment_reason: `Manually assigned to ${assigneeName}`,
      assignment_confidence: 'HIGH'
    };

    await applyAssignment(recipientId, decision, actor || 'User', note || '');

    const updated = await db.get(`
      SELECT r.*, tm.name as assignee_name, tm.email as assignee_email
      FROM recipients r
      LEFT JOIN team_members tm ON r.assignee_id = tm.id
      WHERE r.id = ?`, [recipientId]);

    res.json({ success: true, recipient: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/recipients/bulk-assign', async (req, res) => {
  try {
    const { recipient_ids, assignee_id, actor, note } = req.body;
    if (!Array.isArray(recipient_ids) || recipient_ids.length === 0) {
      return res.status(400).json({ error: 'recipient_ids array is required.' });
    }
    const db = await getDb();

    let assigneeName = 'Unassigned';
    if (assignee_id) {
      const member = await db.get(`SELECT name FROM team_members WHERE id = ?`, [assignee_id]);
      if (member) assigneeName = member.name;
    }

    const now = new Date().toISOString();
    let updatedCount = 0;

    for (const rid of recipient_ids) {
      const recipientId = parseInt(rid, 10);
      if (isNaN(recipientId)) continue;

      const decision = {
        assignee_id: assignee_id || null,
        assigned_at: now,
        assigned_by: actor || 'manual',
        assignment_rule: 'manual',
        assignment_reason: `Bulk manually assigned to ${assigneeName}`,
        assignment_confidence: 'HIGH'
      };

      await applyAssignment(recipientId, decision, actor || 'User', note || 'Bulk Reassignment');
      updatedCount++;
    }

    res.json({ success: true, count: updatedCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/recipients/:id/history', async (req, res) => {
  try {
    const recipientId = parseInt(req.params.id, 10);
    const db = await getDb();
    const history = await db.all(`
      SELECT h.*, tm1.name as prior_assignee_name, tm2.name as new_assignee_name
      FROM assignment_history h
      LEFT JOIN team_members tm1 ON h.prior_assignee_id = tm1.id
      LEFT JOIN team_members tm2 ON h.new_assignee_id = tm2.id
      WHERE h.recipient_id = ?
      ORDER BY h.id DESC
    `, [recipientId]);

    res.json(history);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/recipients/evaluate-auto-assign', async (req, res) => {
  try {
    const payload = req.body;
    const decision = await evaluateAutoAssignment(payload);
    res.json(decision);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// RECIPIENT TIMELINE LOGS & DEMO SIMULATIONS
// -------------------------------------------------------------
app.get('/api/recipients/:id/logs', async (req, res) => {
  try {
    const recipientId = parseInt(req.params.id, 10);
    const db = await getDb();
    const recipient = await db.get('SELECT * FROM recipients WHERE id = ?', [recipientId]);
    if (!recipient) return res.status(404).json({ error: 'Recipient not found' });

    const logs = await db.all('SELECT * FROM tracking_logs WHERE recipient_id = ? ORDER BY id ASC', [recipientId]);
    res.json({ recipient, logs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/simulate/open', async (req, res) => {
  try {
    const { recipientId, minutesDelay } = req.body;
    const db = await getDb();
    const recipient = await db.get('SELECT * FROM recipients WHERE id = ?', [recipientId]);
    if (!recipient) return res.status(404).json({ error: 'Recipient not found' });

    const sentMs = new Date(recipient.sent_at).getTime();
    let openMs = Date.now();
    if (typeof minutesDelay === 'number' && !isNaN(minutesDelay)) {
      openMs = sentMs + Math.max(0, minutesDelay * 60 * 1000);
    }

    const openTime = new Date(openMs).toISOString();
    const tatOpenSeconds = Math.max(0, Math.floor((openMs - sentMs) / 1000));
    const newStatus = recipient.status === 'SENT' ? 'OPENED' : recipient.status;

    await db.run(
      `UPDATE recipients 
       SET status = ?,
           first_opened_at = COALESCE(first_opened_at, ?),
           last_opened_at = ?,
           open_count = open_count + 1,
           tat_open_seconds = COALESCE(tat_open_seconds, ?)
       WHERE id = ?`,
      [newStatus, openTime, openTime, tatOpenSeconds, recipientId]
    );

    await db.run(
      `INSERT INTO tracking_logs (recipient_id, event_type, timestamp, ip_address, user_agent, details)
       VALUES (?, 'OPEN', ?, '127.0.0.1 (Simulated)', 'Simulated Browser / Mail Client', ?)`,
      [recipientId, openTime, JSON.stringify({ simulated: true, minutesDelay })]
    );

    res.json({
      success: true,
      recipientId,
      first_opened_at: openTime,
      tat_open_seconds: tatOpenSeconds,
      tat_open_formatted: formatTAT(tatOpenSeconds)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/simulate/reply', async (req, res) => {
  try {
    const { recipientId, snippet, minutesDelay } = req.body;
    const result = await simulateReply(recipientId, snippet, minutesDelay);
    res.json({
      success: true,
      ...result,
      tat_reply_formatted: formatTAT(result.tat_reply_seconds)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// REPLY POLLER SYNC ENDPOINT
// -------------------------------------------------------------
app.post('/api/sync/replies', async (req, res) => {
  try {
    const result = await syncReplies();
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// OAUTH & SETTINGS ENDPOINTS
// -------------------------------------------------------------
app.get('/api/settings', async (req, res) => {
  try {
    const settings = await getSettings();
    res.json({
      clientId: settings.clientId,
      clientSecret: settings.clientSecret ? '••••••••' : '',
      hasClientSecret: Boolean(settings.clientSecret),
      redirectUri: settings.redirectUri,
      userEmail: settings.userEmail,
      mode: settings.mode,
      isConnected: Boolean(settings.refreshToken && settings.userEmail)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/settings', async (req, res) => {
  try {
    const { clientId, clientSecret, redirectUri, mode } = req.body;
    const update = {};
    if (clientId !== undefined) update.clientId = clientId;
    if (clientSecret && clientSecret !== '••••••••') update.clientSecret = clientSecret;
    if (redirectUri !== undefined) update.redirectUri = redirectUri;
    if (mode !== undefined) update.mode = mode;

    await saveSettings(update);
    res.json({ success: true, message: 'Settings saved successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/auth/google/url', async (req, res) => {
  try {
    const settings = await getSettings();
    const defaultUri = process.env.REDIRECT_URI || settings.redirectUri || 'https://mailtracking-backend.onrender.com/api/auth/google/callback';
    const redirectUri = req.query.redirectUri || defaultUri;
    const frontendUrl = req.query.frontendUrl || req.get('origin') || req.get('referer') || process.env.FRONTEND_URL || 'https://mailtracking-tau.vercel.app';
    const url = await generateAuthUrl(redirectUri, { frontendUrl });
    res.json({ url, redirectUriUsed: redirectUri });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/auth/google/callback', async (req, res) => {
  try {
    const { code, state } = req.query;
    if (!code) {
      return res.status(400).send('Missing authorization code');
    }
    const settings = await getSettings();
    const callbackRedirectUri = process.env.REDIRECT_URI || settings.redirectUri || 'https://mailtracking-backend.onrender.com/api/auth/google/callback';
    const userInfo = await handleAuthCallback(code, callbackRedirectUri);

    let frontendUrl = process.env.FRONTEND_URL;
    if (!frontendUrl && state) {
      try {
        const parsedState = JSON.parse(state);
        if (parsedState && parsedState.frontendUrl) {
          frontendUrl = parsedState.frontendUrl;
        }
      } catch (e) {
        if (state.startsWith('http://') || state.startsWith('https://')) {
          frontendUrl = state;
        }
      }
    }
    if (!frontendUrl) {
      const origin = req.get('origin') || req.get('referer');
      if (origin) {
        try {
          const parsed = new URL(origin);
          frontendUrl = `${parsed.protocol}//${parsed.host}`;
        } catch (e) {
          frontendUrl = origin;
        }
      } else {
        frontendUrl = 'https://mailtracking-tau.vercel.app';
      }
    }

    res.send(`
      <html>
        <body style="font-family: sans-serif; background: #0f172a; color: #f8fafc; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0;">
          <div style="text-align: center; background: #1e293b; padding: 2rem; border-radius: 1rem; box-shadow: 0 10px 25px rgba(0,0,0,0.5);">
            <h2 style="color: #38bdf8; margin-bottom: 0.5rem;">Google Account Connected!</h2>
            <p style="color: #94a3b8;">Logged in as: <strong>${userInfo.email}</strong></p>
            <p style="margin-top: 1.5rem;"><a href="${frontendUrl}" style="color: #38bdf8; text-decoration: none; background: #0284c7; color: white; padding: 0.75rem 1.5rem; border-radius: 0.5rem;">Return to Dashboard</a></p>
          </div>
          <script>
            setTimeout(() => {
              window.location.href = '${frontendUrl}';
            }, 3000);
          </script>
        </body>
      </html>
    `);
  } catch (err) {
    res.status(500).send(`Authentication Failed: ${err.message}`);
  }
});

// Periodic background reply poller (every 60 seconds)
setInterval(async () => {
  try {
    await syncReplies();
  } catch (e) {
    // silent background catch
  }
}, 60000);

app.listen(PORT, () => {
  console.log(`MailTracking Backend running at http://localhost:${PORT}`);
});
