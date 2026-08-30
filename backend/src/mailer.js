const { google } = require('googleapis');
const MailComposer = require('nodemailer/lib/mail-composer');
const { getDb } = require('./db');
const { getSettings, getOAuth2Client } = require('./googleAuth');

async function sendCampaign({ title, subject, body, recipients, baseUrl }) {
  const db = await getDb();
  const config = await getSettings();
  const now = new Date().toISOString();

  // Insert Campaign
  const campaignResult = await db.run(
    `INSERT INTO campaigns (title, subject, body, sender_email, sent_at, total_recipients, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      title || subject,
      subject,
      body,
      config.userEmail || 'admin@groupmail.com',
      now,
      recipients.length,
      now
    ]
  );
  const campaignId = campaignResult.lastID;

  let oauth2Client = null;
  let gmail = null;

  if (config.mode === 'oauth' && config.refreshToken) {
    try {
      oauth2Client = await getOAuth2Client();
      if (oauth2Client) {
        gmail = google.gmail({ version: 'v1', auth: oauth2Client });
      }
    } catch (err) {
      console.warn('Failed to initialize Gmail API client, falling back to simulation mode:', err.message);
    }
  }

  const createdRecipients = [];

  for (const rec of recipients) {
    const email = (rec.email || rec).trim();
    const name = rec.name ? rec.name.trim() : email.split('@')[0];

    // Insert Recipient record first to get recipientId
    const recResult = await db.run(
      `INSERT INTO recipients (campaign_id, email, name, status, sent_at)
       VALUES (?, ?, ?, 'SENT', ?)`,
      [campaignId, email, name, now]
    );
    const recipientId = recResult.lastID;

    // Build personalized body with tracking pixel
    let personalizedBody = body.replace(/\{\{\s*name\s*\}\}/gi, name).replace(/\{\{\s*email\s*\}\}/gi, email);

    // Tracking pixel tag
    const pixelUrl = `${baseUrl}/api/track/pixel/${recipientId}.png`;
    const pixelTag = `<img src="${pixelUrl}" width="1" height="1" style="display:none;width:1px;height:1px;" alt="" />`;
    const finalHtml = `${personalizedBody}<br/><br/>${pixelTag}`;

    let threadId = `sim_thread_${recipientId}_${Date.now()}`;
    let messageId = `sim_msg_${recipientId}_${Date.now()}`;

    if (gmail && config.mode === 'oauth') {
      try {
        // Compile email message using nodemailer MailComposer
        const composer = new MailComposer({
          from: config.userEmail,
          to: email,
          subject: subject,
          html: finalHtml,
          headers: {
            'X-MailTrack-Recipient-ID': String(recipientId)
          }
        });

        const compiledBuffer = await composer.compile().build();
        const rawBase64 = compiledBuffer
          .toString('base64')
          .replace(/\+/g, '-')
          .replace(/\//g, '_')
          .replace(/=+$/, '');

        const sendRes = await gmail.users.messages.send({
          userId: 'me',
          requestBody: {
            raw: rawBase64
          }
        });

        if (sendRes.data) {
          messageId = sendRes.data.id || messageId;
          threadId = sendRes.data.threadId || threadId;
        }
      } catch (sendErr) {
        console.error(`Error sending email via Gmail API to ${email}:`, sendErr.message);
      }
    }

    // Update recipient with thread and message ID
    await db.run(
      `UPDATE recipients SET gmail_thread_id = ?, gmail_message_id = ? WHERE id = ?`,
      [threadId, messageId, recipientId]
    );

    createdRecipients.push({
      id: recipientId,
      campaign_id: campaignId,
      email,
      name,
      status: 'SENT',
      sent_at: now,
      gmail_thread_id: threadId,
      gmail_message_id: messageId,
      pixelUrl
    });
  }

  return {
    campaignId,
    title: title || subject,
    subject,
    sent_at: now,
    total_recipients: createdRecipients.length,
    recipients: createdRecipients,
    mode: (gmail && config.mode === 'oauth') ? 'gmail_oauth' : 'simulation'
  };
}

module.exports = { sendCampaign };
