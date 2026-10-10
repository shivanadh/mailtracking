const { google } = require('googleapis');
const MailComposer = require('nodemailer/lib/mail-composer');
const { getDb } = require('./db');
const { getSettings, getOAuth2Client } = require('./googleAuth');
const { assignRecipient } = require('./assignmentEngine');

async function sendSingleRecipient({ recipient, campaign, baseUrl, validDeptIds, gmailClient, config }) {
  const db = await getDb();
  const now = new Date().toISOString();
  
  // Build personalized body with tracking pixel
  let personalizedBody = campaign.body.replace(/\{\{\s*name\s*\}\}/gi, recipient.name).replace(/\{\{\s*email\s*\}\}/gi, recipient.email);

  // Tracking pixel tag
  const pixelUrl = `${baseUrl}/api/track/pixel/${recipient.id}.png`;
  const pixelTag = `<img src="${pixelUrl}" width="1" height="1" style="display:none;width:1px;height:1px;" alt="" />`;
  const finalHtml = `${personalizedBody}<br/><br/>${pixelTag}`;

  let threadId = `sim_thread_${recipient.id}_${Date.now()}`;
  let messageId = `sim_msg_${recipient.id}_${Date.now()}`;
  let sendStatus = 'sent';

  if (gmailClient && config.mode === 'oauth') {
    try {
      const composer = new MailComposer({
        from: config.userEmail,
        to: recipient.email,
        subject: campaign.subject,
        html: finalHtml,
        headers: {
          'X-MailTrack-Recipient-ID': String(recipient.id)
        }
      });

      const compiledBuffer = await composer.compile().build();
      const rawBase64 = compiledBuffer
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

      const sendRes = await gmailClient.users.messages.send({
        userId: 'me',
        requestBody: { raw: rawBase64 }
      });

      if (sendRes.data) {
        messageId = sendRes.data.id || messageId;
        threadId = sendRes.data.threadId || threadId;
      }
    } catch (sendErr) {
      console.error(`Error sending email via Gmail API to ${recipient.email}:`, sendErr.message);
      sendStatus = 'failed';
    }
  }

  // Update recipient with thread, message ID, sent_at, and send_status
  await db.run(
    `UPDATE recipients SET gmail_thread_id = ?, gmail_message_id = ?, sent_at = ?, send_status = ? WHERE id = ?`,
    [threadId, messageId, now, sendStatus, recipient.id]
  );

  if (sendStatus === 'sent') {
    // Run auto-assignment engine
    try {
      await assignRecipient(recipient.id, {
        campaignDepartmentIds: validDeptIds,
        subject: campaign.subject
      });
    } catch (assignErr) {
      console.error(`Assignment engine error for recipient ${recipient.id}:`, assignErr.message);
    }
  }
  
  return { threadId, messageId, sendStatus, pixelUrl, sentAt: now };
}

async function sendCampaign({ title, subject, body, recipients, baseUrl, departmentIds, scheduleAt, scheduleTimezone, templateId, followupEnabled, followupDays, followupTemplateId }) {
  const db = await getDb();
  const config = await getSettings();
  const now = new Date().toISOString();

  const campaignStatus = scheduleAt ? 'scheduled' : 'sent';
  const sentAt = scheduleAt ? null : now;

  // Insert Campaign
  const campaignResult = await db.run(
    `INSERT INTO campaigns (title, subject, body, sender_email, sent_at, total_recipients, schedule_at, schedule_timezone, campaign_status, template_id, followup_enabled, followup_days, followup_template_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      title || subject,
      subject,
      body,
      config.userEmail || 'admin@groupmail.com',
      sentAt,
      recipients.length,
      scheduleAt || null,
      scheduleTimezone || null,
      campaignStatus,
      templateId || null,
      followupEnabled ? 1 : 0,
      followupDays || 3,
      followupTemplateId || null,
      now
    ]
  );
  const campaignId = campaignResult.lastID;

  if (scheduleAt) {
    await db.run(
      `INSERT INTO scheduled_jobs (campaign_id, scheduled_at, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
      [campaignId, scheduleAt, 'pending', now, now]
    );
  }

  // Store campaign-department associations
  const validDeptIds = departmentIds || [];
  for (const deptId of validDeptIds) {
    await db.run(
      'INSERT OR IGNORE INTO campaign_departments (campaign_id, department_id) VALUES (?, ?)',
      [campaignId, deptId]
    );
  }

  let oauth2Client = null;
  let gmail = null;

  if (!scheduleAt && config.mode === 'oauth' && config.refreshToken) {
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

    const recStatus = scheduleAt ? 'pending' : 'sent';
    
    // Insert Recipient record first to get recipientId
    const recResult = await db.run(
      `INSERT INTO recipients (campaign_id, email, name, status, send_status, sent_at)
       VALUES (?, ?, ?, 'SENT', ?, ?)`,
      [campaignId, email, name, recStatus, sentAt]
    );
    const recipientId = recResult.lastID;

    let resData = { sendStatus: recStatus, pixelUrl: null, threadId: null, messageId: null, sentAt };

    if (!scheduleAt) {
      resData = await sendSingleRecipient({
        recipient: { id: recipientId, email, name },
        campaign: { id: campaignId, subject, body },
        baseUrl,
        validDeptIds,
        gmailClient: gmail,
        config
      });
    }

    createdRecipients.push({
      id: recipientId,
      campaign_id: campaignId,
      email,
      name,
      status: 'SENT',
      send_status: resData.sendStatus,
      sent_at: resData.sentAt,
      gmail_thread_id: resData.threadId,
      gmail_message_id: resData.messageId,
      pixelUrl: resData.pixelUrl
    });
  }

  return {
    campaignId,
    title: title || subject,
    subject,
    sent_at: sentAt,
    schedule_at: scheduleAt,
    campaign_status: campaignStatus,
    total_recipients: createdRecipients.length,
    recipients: createdRecipients,
    departments: validDeptIds,
    mode: (!scheduleAt && gmail && config.mode === 'oauth') ? 'gmail_oauth' : (scheduleAt ? 'scheduled' : 'simulation')
  };
}

module.exports = { sendCampaign, sendSingleRecipient };
