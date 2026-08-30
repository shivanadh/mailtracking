const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { getDb } = require('./db');
const { getSettings, saveSettings, generateAuthUrl, handleAuthCallback } = require('./googleAuth');
const { sendCampaign } = require('./mailer');
const { syncReplies, simulateReply } = require('./replyPoller');

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
    const protocol = req.protocol;
    const host = req.get('host');
    const defaultUri = process.env.REDIRECT_URI || `${protocol}://${host}/api/auth/google/callback`;
    const redirectUri = req.query.redirectUri || defaultUri;
    const url = await generateAuthUrl(redirectUri);
    res.json({ url, redirectUriUsed: redirectUri });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/auth/google/callback', async (req, res) => {
  try {
    const { code } = req.query;
    if (!code) {
      return res.status(400).send('Missing authorization code');
    }
    const protocol = req.protocol;
    const host = req.get('host');
    const currentCallbackUrl = process.env.REDIRECT_URI || `${protocol}://${host}/api/auth/google/callback`;
    const userInfo = await handleAuthCallback(code, currentCallbackUrl);
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
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
