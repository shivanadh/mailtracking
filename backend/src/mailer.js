const { google } = require('googleapis');
const MailComposer = require('nodemailer/lib/mail-composer');
const { getDb } = require('./db');
const { getSettings, getOAuth2Client, checkGmailConnection } = require('./googleAuth');
const { assignRecipient } = require('./assignmentEngine');

// Isolated mock Gmail client for offline automated testing (not an HTTP endpoint)
let testMockGmailClient = null;

function setTestMockGmailClient(mockClient) {
  testMockGmailClient = mockClient;
}

function getTestMockGmailClient() {
  return testMockGmailClient;
}

async function sendSingleRecipient({ recipient, campaign, baseUrl, validDeptIds, gmailClient, config }) {
  const db = await getDb();
  const now = new Date().toISOString();
  
  // Build personalized body with tracking pixel
  let personalizedBody = campaign.body
    .replace(/\{\{\s*name\s*\}\}/gi, recipient.name)
    .replace(/\{\{\s*email\s*\}\}/gi, recipient.email);

  // Tracking pixel tag
  const pixelUrl = `${baseUrl}/api/track/pixel/${recipient.id}.png`;
  const pixelTag = `<img src="${pixelUrl}" width="1" height="1" style="display:none;width:1px;height:1px;" alt="" />`;
  const finalHtml = `${personalizedBody}<br/><br/>${pixelTag}`;

  let threadId = null;
  let messageId = null;
  let sendStatus = 'failed';
  let sentAt = null;
  let sendError = null;

  if (gmailClient) {
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

      if (sendRes && sendRes.data) {
        messageId = sendRes.data.id || null;
        threadId = sendRes.data.threadId || null;
        sendStatus = 'sent';
        sentAt = now;
      } else {
        throw new Error('Gmail API response did not contain message data');
      }
    } catch (sendErr) {
      console.error(`Error sending email via Gmail API to ${recipient.email}:`, sendErr.message);
      sendStatus = 'failed';
      sentAt = null;
      sendError = sendErr.message;
    }
  } else {
    sendError = 'Gmail client is disconnected or uninitialized';
  }

  // Ensure failed sends cannot clear timestamps belonging to already successfully sent recipients
  const finalSentAt = sentAt || recipient.sent_at || null;
  const finalThreadId = threadId || recipient.gmail_thread_id || null;
  const finalMessageId = messageId || recipient.gmail_message_id || null;
  const finalSendStatus = (recipient.sent_at && sendStatus === 'failed') ? (recipient.send_status || 'sent') : sendStatus;

  await db.run(
    `UPDATE recipients 
     SET gmail_thread_id = ?, 
         gmail_message_id = ?, 
         sent_at = ?, 
         send_status = ? 
     WHERE id = ?`,
    [finalThreadId, finalMessageId, finalSentAt, finalSendStatus, recipient.id]
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
  
  return { threadId, messageId, sendStatus, pixelUrl, sentAt, error: sendError };
}

async function sendCampaign({ title, subject, body, recipients, baseUrl, departmentIds, scheduleAt, scheduleTimezone, templateId, followupEnabled, followupDays, followupTemplateId }) {
  const db = await getDb();
  const config = await getSettings();
  const now = new Date().toISOString();

  // Validate Gmail connectivity before accepting Send Now or Schedule Later
  const conn = await checkGmailConnection();
  if (!conn.connected && !testMockGmailClient) {
    throw new Error(conn.reason || 'Gmail account not connected. Please connect your Gmail account in Settings before dispatching.');
  }

  let oauth2Client = null;
  let gmail = testMockGmailClient;

  if (!scheduleAt && !gmail) {
    oauth2Client = await getOAuth2Client();
    if (oauth2Client) {
      gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    }
    if (!gmail) {
      throw new Error('Could not initialize Gmail API client. Please verify Gmail credentials in Settings.');
    }
  }

  const campaignStatus = scheduleAt ? 'scheduled' : 'sending';
  const sentAt = scheduleAt ? null : null; // Will be set only upon successful dispatch

  // Insert Campaign
  const campaignResult = await db.run(
    `INSERT INTO campaigns (title, subject, body, sender_email, sent_at, total_recipients, schedule_at, schedule_timezone, campaign_status, template_id, followup_enabled, followup_days, followup_template_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      title || subject,
      subject,
      body,
      config.userEmail || (conn.connected ? conn.email : 'admin@groupmail.com'),
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

  const createdRecipients = [];
  let successfulSends = 0;
  let failedSends = 0;
  let firstErrorMessage = null;

  for (const rec of recipients) {
    const email = (rec.email || rec).trim();
    const name = rec.name ? rec.name.trim() : email.split('@')[0];

    const initialStatus = scheduleAt ? 'pending' : 'sending';
    
    // Insert Recipient record first to get recipientId
    const recResult = await db.run(
      `INSERT INTO recipients (campaign_id, email, name, status, send_status, sent_at)
       VALUES (?, ?, ?, 'SENT', ?, NULL)`,
      [campaignId, email, name, initialStatus]
    );
    const recipientId = recResult.lastID;

    let resData = { sendStatus: initialStatus, pixelUrl: null, threadId: null, messageId: null, sentAt: null };

    if (!scheduleAt) {
      resData = await sendSingleRecipient({
        recipient: { id: recipientId, email, name },
        campaign: { id: campaignId, subject, body },
        baseUrl,
        validDeptIds,
        gmailClient: gmail,
        config
      });

      if (resData.sendStatus === 'sent') {
        successfulSends++;
      } else {
        failedSends++;
        if (!firstErrorMessage && resData.error) {
          firstErrorMessage = resData.error;
        }
      }
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

  if (!scheduleAt) {
    if (successfulSends === 0 && failedSends > 0) {
      // All sends failed: mark campaign failed and do NOT record sent_at
      await db.run(
        'UPDATE campaigns SET campaign_status = "failed", sent_at = NULL WHERE id = ?',
        [campaignId]
      );
      throw new Error(`Sending failed for all recipients via Gmail: ${firstErrorMessage || 'Unknown Gmail sending error'}`);
    } else {
      const finalCampaignStatus = failedSends > 0 ? 'completed_with_errors' : 'sent';
      const finalSentAt = new Date().toISOString();
      await db.run(
        'UPDATE campaigns SET campaign_status = ?, sent_at = ? WHERE id = ?',
        [finalCampaignStatus, finalSentAt, campaignId]
      );
    }
  }

  return {
    campaignId,
    title: title || subject,
    subject,
    sent_at: scheduleAt ? null : (successfulSends > 0 ? new Date().toISOString() : null),
    schedule_at: scheduleAt,
    campaign_status: scheduleAt ? 'scheduled' : (failedSends > 0 ? 'completed_with_errors' : 'sent'),
    total_recipients: createdRecipients.length,
    recipients: createdRecipients,
    departments: validDeptIds,
    mode: scheduleAt ? 'scheduled' : 'gmail_oauth'
  };
}

module.exports = {
  sendCampaign,
  sendSingleRecipient,
  setTestMockGmailClient,
  getTestMockGmailClient
};
