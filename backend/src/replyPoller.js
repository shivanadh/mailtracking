const { google } = require('googleapis');
const { getDb } = require('./db');
const { getSettings, getOAuth2Client } = require('./googleAuth');

function decodeBase64Url(data) {
  if (!data) return '';
  try {
    const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
    return Buffer.from(base64, 'base64').toString('utf-8');
  } catch (e) {
    return '';
  }
}

function extractMessageBodies(payload) {
  let plainText = '';
  let htmlText = '';

  function walkParts(part) {
    if (!part) return;
    const mimeType = part.mimeType || '';

    if (part.body && part.body.data) {
      const decoded = decodeBase64Url(part.body.data);
      if (mimeType.toLowerCase() === 'text/plain' && !plainText) {
        plainText = decoded;
      } else if (mimeType.toLowerCase() === 'text/html' && !htmlText) {
        htmlText = decoded;
      }
    }

    if (Array.isArray(part.parts)) {
      for (const p of part.parts) {
        walkParts(p);
      }
    }
  }

  walkParts(payload);
  return { plainText, htmlText };
}

function parseSenderInfo(fromHeader, defaultEmail) {
  if (!fromHeader) {
    return { name: defaultEmail ? defaultEmail.split('@')[0] : '', email: defaultEmail || '' };
  }
  const match = fromHeader.match(/^(?:"?([^"<]+)"?\s*)?<?([^>]+)>?$/);
  if (match) {
    const name = (match[1] || '').trim();
    const email = (match[2] || '').trim();
    return {
      name: name || (email ? email.split('@')[0] : ''),
      email: email || defaultEmail
    };
  }
  return { name: fromHeader.split('@')[0], email: fromHeader };
}

async function processThreadMessagesForRecipient(db, gmail, recipient) {
  if (!gmail || !recipient.gmail_thread_id || recipient.gmail_thread_id.startsWith('sim_thread_')) {
    return false;
  }

  try {
    const threadRes = await gmail.users.threads.get({
      userId: 'me',
      id: recipient.gmail_thread_id
    });

    const messages = threadRes.data.messages || [];
    const sentTime = new Date(recipient.sent_at).getTime();
    let updated = false;

    // Get existing recorded gmail_message_ids for this recipient to avoid duplicate insertions
    const existingReplies = await db.all(
      'SELECT gmail_message_id FROM recipient_replies WHERE recipient_id = ?',
      [recipient.id]
    );
    const existingMsgIds = new Set(existingReplies.map(r => r.gmail_message_id).filter(Boolean));

    for (const msg of messages) {
      const msgInternalDate = parseInt(msg.internalDate || '0', 10);
      const headers = msg.payload?.headers || [];
      const fromHeader = headers.find(h => h.name.toLowerCase() === 'from')?.value || '';

      if (fromHeader.toLowerCase().includes(recipient.email.toLowerCase()) && msgInternalDate > sentTime) {
        if (existingMsgIds.has(msg.id)) {
          continue; // Already saved this message
        }

        const replyTime = new Date(msgInternalDate).toISOString();
        const tatReplySeconds = Math.max(0, Math.floor((msgInternalDate - sentTime) / 1000));
        const snippet = msg.snippet || 'Reply received';
        const senderInfo = parseSenderInfo(fromHeader, recipient.email);
        const { plainText } = extractMessageBodies(msg.payload);
        const bodyText = plainText || snippet;

        // Persist message in recipient_replies table
        await db.run(
          `INSERT INTO recipient_replies 
           (recipient_id, gmail_message_id, gmail_thread_id, sender_name, sender_email, received_at, body_text, body_html, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            recipient.id,
            msg.id,
            recipient.gmail_thread_id,
            senderInfo.name,
            senderInfo.email,
            replyTime,
            bodyText,
            null,
            new Date().toISOString()
          ]
        );

        // Update recipients table: Preserve first_replied_at & tat_reply_seconds, update latest_reply_*
        await db.run(
          `UPDATE recipients 
           SET status = 'REPLIED',
               first_replied_at = COALESCE(first_replied_at, ?),
               reply_count = reply_count + 1,
               tat_reply_seconds = COALESCE(tat_reply_seconds, ?),
               reply_snippet = ?,
               latest_reply_message_id = ?,
               latest_reply_sender_name = ?,
               latest_reply_sender_email = ?,
               latest_reply_body_text = ?
           WHERE id = ?`,
          [
            replyTime,
            tatReplySeconds,
            snippet,
            msg.id,
            senderInfo.name,
            senderInfo.email,
            bodyText,
            recipient.id
          ]
        );

        await db.run(
          `INSERT INTO tracking_logs (recipient_id, event_type, timestamp, details)
           VALUES (?, 'REPLY', ?, ?)`,
          [recipient.id, replyTime, JSON.stringify({ snippet, messageId: msg.id, threadId: recipient.gmail_thread_id })]
        );

        existingMsgIds.add(msg.id);
        updated = true;
      }
    }
    return updated;
  } catch (err) {
    console.error(`Failed checking thread for recipient ${recipient.email}:`, err.message);
    return false;
  }
}

async function syncReplies() {
  const db = await getDb();
  const config = await getSettings();

  const recipientsToCheck = await db.all(`
    SELECT * FROM recipients WHERE gmail_thread_id IS NOT NULL AND gmail_thread_id NOT LIKE 'sim_thread_%'
  `);

  if (recipientsToCheck.length === 0) {
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

  if (!gmail) {
    return { syncedCount: 0, updated: [] };
  }

  const updated = [];

  for (const recipient of recipientsToCheck) {
    const isUpdated = await processThreadMessagesForRecipient(db, gmail, recipient);
    if (isUpdated) {
      const freshRec = await db.get('SELECT * FROM recipients WHERE id = ?', [recipient.id]);
      updated.push({
        recipientId: freshRec.id,
        email: freshRec.email,
        replyTime: freshRec.first_replied_at,
        tatReplySeconds: freshRec.tat_reply_seconds
      });
    }
  }

  return { syncedCount: updated.length, updated };
}

async function fetchRecipientReplyFromGmail(recipientId) {
  const db = await getDb();
  const recipient = await db.get('SELECT * FROM recipients WHERE id = ?', [recipientId]);
  if (!recipient) {
    throw new Error('Recipient not found');
  }

  // Check if we already have replies saved in DB
  const existingReplies = await db.all(
    'SELECT * FROM recipient_replies WHERE recipient_id = ? ORDER BY id DESC',
    [recipientId]
  );
  if (existingReplies.length > 0) {
    return { recipient, latestReply: existingReplies[0], replies: existingReplies };
  }

  // If no replies in DB and gmail thread exists
  const config = await getSettings();
  if (config.mode === 'oauth' && config.refreshToken && recipient.gmail_thread_id && !recipient.gmail_thread_id.startsWith('sim_thread_')) {
    const oauth2Client = await getOAuth2Client();
    if (oauth2Client) {
      const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
      await processThreadMessagesForRecipient(db, gmail, recipient);
    }
  }

  const freshRecipient = await db.get('SELECT * FROM recipients WHERE id = ?', [recipientId]);
  const freshReplies = await db.all(
    'SELECT * FROM recipient_replies WHERE recipient_id = ? ORDER BY id DESC',
    [recipientId]
  );

  return {
    recipient: freshRecipient,
    latestReply: freshReplies[0] || null,
    replies: freshReplies
  };
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
  const simMsgId = `sim_msg_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  const senderName = recipient.name || recipient.email.split('@')[0];

  await db.run(
    `INSERT INTO recipient_replies 
     (recipient_id, gmail_message_id, gmail_thread_id, sender_name, sender_email, received_at, body_text, body_html, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      recipient.id,
      simMsgId,
      recipient.gmail_thread_id || `sim_thread_${recipient.id}`,
      senderName,
      recipient.email,
      replyTime,
      snippet,
      null,
      new Date().toISOString()
    ]
  );

  await db.run(
    `UPDATE recipients 
     SET status = 'REPLIED',
         first_replied_at = COALESCE(first_replied_at, ?),
         reply_count = reply_count + 1,
         tat_reply_seconds = COALESCE(tat_reply_seconds, ?),
         reply_snippet = ?,
         latest_reply_message_id = ?,
         latest_reply_sender_name = ?,
         latest_reply_sender_email = ?,
         latest_reply_body_text = ?
     WHERE id = ?`,
    [
      replyTime,
      tatReplySeconds,
      snippet,
      simMsgId,
      senderName,
      recipient.email,
      snippet,
      recipient.id
    ]
  );

  await db.run(
    `INSERT INTO tracking_logs (recipient_id, event_type, timestamp, details)
     VALUES (?, 'REPLY', ?, ?)`,
    [recipient.id, replyTime, JSON.stringify({ snippet, messageId: simMsgId, simulated: true })]
  );

  return {
    recipientId,
    email: recipient.email,
    status: 'REPLIED',
    first_replied_at: replyTime,
    tat_reply_seconds: tatReplySeconds,
    snippet,
    latest_reply_sender_name: senderName,
    latest_reply_body_text: snippet
  };
}

module.exports = {
  syncReplies,
  simulateReply,
  fetchRecipientReplyFromGmail,
  extractMessageBodies,
  parseSenderInfo,
  decodeBase64Url
};
