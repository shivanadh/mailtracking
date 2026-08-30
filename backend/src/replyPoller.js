const { google } = require('googleapis');
const { getDb } = require('./db');
const { getSettings, getOAuth2Client } = require('./googleAuth');

async function syncReplies() {
  const db = await getDb();
  const config = await getSettings();

  const activeRecipients = await db.all(`
    SELECT * FROM recipients WHERE status != 'REPLIED'
  `);

  if (activeRecipients.length === 0) {
    return { syncedCount: 0, updated: [] };
  }

  let oauth2Client = null;
  let gmail = null;

  if (config.mode === 'oauth' && config.refreshToken) {
    try {
      oauth2Client = await getOAuth2Client();
      if (oauth2Client) {
        gmail = google.gmail({ version: 'v1', auth: oauth2Client });
      }
    } catch (err) {
      console.warn('Failed to connect Gmail API for reply polling:', err.message);
    }
  }

  const updated = [];

  for (const recipient of activeRecipients) {
    // If we have Gmail API connected and a valid real threadId
    if (gmail && recipient.gmail_thread_id && !recipient.gmail_thread_id.startsWith('sim_thread_')) {
      try {
        const threadRes = await gmail.users.threads.get({
          userId: 'me',
          id: recipient.gmail_thread_id
        });

        const messages = threadRes.data.messages || [];
        // Look for messages sent by the recipient email after sent_at
        const sentTime = new Date(recipient.sent_at).getTime();

        for (const msg of messages) {
          const msgInternalDate = parseInt(msg.internalDate || '0', 10);
          const headers = msg.payload?.headers || [];
          const fromHeader = headers.find(h => h.name.toLowerCase() === 'from')?.value || '';

          if (fromHeader.toLowerCase().includes(recipient.email.toLowerCase()) && msgInternalDate > sentTime) {
            const replyTime = new Date(msgInternalDate).toISOString();
            const tatReplySeconds = Math.max(0, Math.floor((msgInternalDate - sentTime) / 1000));
            const snippet = msg.snippet || 'Reply received';

            await db.run(
              `UPDATE recipients 
               SET status = 'REPLIED',
                   first_replied_at = COALESCE(first_replied_at, ?),
                   reply_count = reply_count + 1,
                   tat_reply_seconds = COALESCE(tat_reply_seconds, ?),
                   reply_snippet = ?
               WHERE id = ?`,
              [replyTime, tatReplySeconds, snippet, recipient.id]
            );

            await db.run(
              `INSERT INTO tracking_logs (recipient_id, event_type, timestamp, details)
               VALUES (?, 'REPLY', ?, ?)`,
              [recipient.id, replyTime, JSON.stringify({ snippet, threadId: recipient.gmail_thread_id })]
            );

            updated.push({ recipientId: recipient.id, email: recipient.email, replyTime, tatReplySeconds });
            break;
          }
        }
      } catch (err) {
        console.error(`Failed checking thread for recipient ${recipient.email}:`, err.message);
      }
    }
  }

  return { syncedCount: updated.length, updated };
}

async function simulateReply(recipientId, customSnippet, customMinutesDelay) {
  const db = await getDb();
  const recipient = await db.get('SELECT * FROM recipients WHERE id = ?', [recipientId]);

  if (!recipient) {
    throw new Error('Recipient not found');
  }

  const sentTime = new Date(recipient.sent_at).getTime();
  let replyTimeMs = Date.now();

  if (typeof customMinutesDelay === 'number' && !isNaN(customMinutesDelay)) {
    replyTimeMs = sentTime + Math.max(0, customMinutesDelay * 60 * 1000);
  }

  const replyTime = new Date(replyTimeMs).toISOString();
  const tatReplySeconds = Math.max(0, Math.floor((replyTimeMs - sentTime) / 1000));
  const snippet = customSnippet || 'Thanks for the email! I have received it.';

  await db.run(
    `UPDATE recipients 
     SET status = 'REPLIED',
         first_replied_at = COALESCE(first_replied_at, ?),
         reply_count = reply_count + 1,
         tat_reply_seconds = COALESCE(tat_reply_seconds, ?),
         reply_snippet = ?
     WHERE id = ?`,
    [replyTime, tatReplySeconds, snippet, recipient.id]
  );

  await db.run(
    `INSERT INTO tracking_logs (recipient_id, event_type, timestamp, details)
     VALUES (?, 'REPLY', ?, ?)`,
    [recipient.id, replyTime, JSON.stringify({ snippet, simulated: true })]
  );

  return {
    recipientId,
    email: recipient.email,
    status: 'REPLIED',
    first_replied_at: replyTime,
    tat_reply_seconds: tatReplySeconds,
    snippet
  };
}

module.exports = { syncReplies, simulateReply };
