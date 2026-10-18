const { google } = require('googleapis');
const { getDb } = require('./db');
const { sendSingleRecipient, getTestMockGmailClient } = require('./mailer');
const { getSettings, getOAuth2Client } = require('./googleAuth');

const WORKER_ID = `worker_${process.pid}_${Math.random().toString(36).substr(2, 9)}`;
const POLL_INTERVAL_MS = 30000; // 30 seconds

async function processScheduledJobs() {
  const db = await getDb();
  const now = new Date().toISOString();
  // 5 minutes ago for lock expiry
  const staleTime = new Date(Date.now() - 5 * 60000).toISOString();

  try {
    // 1. Lock pending jobs that are due
    const jobs = await db.all(
      `SELECT * FROM scheduled_jobs 
       WHERE status = 'pending' AND scheduled_at <= ? AND (locked_at IS NULL OR locked_at < ?)`,
      [now, staleTime]
    );

    if (!jobs || jobs.length === 0) return;

    for (const job of jobs) {
      // Attempt atomic lock
      const lockResult = await db.run(
        `UPDATE scheduled_jobs 
         SET locked_at = ?, locked_by = ?, status = 'processing', updated_at = ?
         WHERE id = ? AND (locked_at IS NULL OR locked_at = ? OR locked_at < ?)`,
        [now, WORKER_ID, now, job.id, job.locked_at, staleTime]
      );

      if (lockResult.changes === 0) {
        continue; // Someone else grabbed it
      }

      console.log(`[Scheduler] Processing campaign ${job.campaign_id}`);
      
      try {
        const campaign = await db.get('SELECT * FROM campaigns WHERE id = ?', [job.campaign_id]);
        if (!campaign) throw new Error('Campaign not found');

        if (campaign.campaign_status === 'cancelled') {
           await db.run('UPDATE scheduled_jobs SET status = "cancelled", updated_at = ? WHERE id = ?', [now, job.id]);
           continue;
        }

        const recipients = await db.all(
          `SELECT * FROM recipients WHERE campaign_id = ? AND send_status = 'pending'`,
          [job.campaign_id]
        );

        const config = await getSettings();
        let oauth2Client = null;
        let gmail = typeof getTestMockGmailClient === 'function' ? getTestMockGmailClient() : null;

        if (!gmail && config.refreshToken) {
          try {
            oauth2Client = await getOAuth2Client();
            if (oauth2Client) {
              gmail = google.gmail({ version: 'v1', auth: oauth2Client });
            }
          } catch (err) {
            console.warn('Failed to initialize Gmail API client for worker:', err.message);
          }
        }

        if (!gmail) {
          console.warn(`[Scheduler] Gmail disconnected at scheduled time for campaign ${job.campaign_id}. Failing job.`);
          await db.run(
            `UPDATE recipients SET send_status = 'failed', sent_at = NULL WHERE campaign_id = ? AND send_status = 'pending'`,
            [job.campaign_id]
          );
          await db.run('UPDATE campaigns SET campaign_status = "failed", sent_at = NULL WHERE id = ?', [job.campaign_id]);
          await db.run(
            'UPDATE scheduled_jobs SET status = "failed", last_error = "Gmail account disconnected at execution time", updated_at = ? WHERE id = ?',
            [now, job.id]
          );
          continue;
        }

        await db.run('UPDATE campaigns SET campaign_status = "sending" WHERE id = ?', [job.campaign_id]);

        const deptRows = await db.all('SELECT department_id FROM campaign_departments WHERE campaign_id = ?', [job.campaign_id]);
        const validDeptIds = deptRows.map(r => r.department_id);

        const host = process.env.PUBLIC_URL || 'http://localhost:5000'; // simplified
        const baseUrl = process.env.PUBLIC_URL || host;

        let successCount = 0;
        let failCount = 0;

        for (const recipient of recipients) {
          // Mark sending
          await db.run(`UPDATE recipients SET send_status = 'sending' WHERE id = ?`, [recipient.id]);

          const result = await sendSingleRecipient({
            recipient,
            campaign,
            baseUrl,
            validDeptIds,
            gmailClient: gmail,
            config
          });

          if (result.sendStatus === 'sent') {
            successCount++;
          } else {
            failCount++;
          }
        }

        // Finalize campaign accurately without fabricating sent_at if all failed
        const finalStatus = successCount === 0 ? 'failed' : (failCount > 0 ? 'completed_with_errors' : 'sent');
        const finalSentAt = successCount > 0 ? new Date().toISOString() : null;
        await db.run('UPDATE campaigns SET campaign_status = ?, sent_at = ? WHERE id = ?', [finalStatus, finalSentAt, job.campaign_id]);
        await db.run('UPDATE scheduled_jobs SET status = ?, updated_at = ? WHERE id = ?', [successCount > 0 ? 'completed' : 'failed', new Date().toISOString(), job.id]);

        console.log(`[Scheduler] Finished campaign ${job.campaign_id}`);
      } catch (jobErr) {
        console.error(`[Scheduler] Job error for campaign ${job.campaign_id}:`, jobErr);
        await db.run(
          `UPDATE scheduled_jobs SET status = 'pending', last_error = ?, updated_at = ?, locked_at = NULL, locked_by = NULL WHERE id = ?`,
          [jobErr.message, new Date().toISOString(), job.id]
        );
      }
    }
  } catch (err) {
    console.error('[Scheduler] Error in worker loop:', err);
  }
}

async function processFollowups() {
  const db = await getDb();
  const now = new Date().toISOString();

  try {
    const campaigns = await db.all(`SELECT * FROM campaigns WHERE followup_enabled = 1 AND campaign_status IN ('sent', 'completed_with_errors')`);

    for (const campaign of campaigns) {
      if (!campaign.followup_template_id) continue;
      
      const template = await db.get('SELECT * FROM email_templates WHERE id = ?', [campaign.followup_template_id]);
      if (!template) continue;

      const recipients = await db.all(`
        SELECT * FROM recipients 
        WHERE campaign_id = ? 
        AND status IN ('SENT', 'OPENED') 
        AND followup_status = 'none'
        AND sent_at IS NOT NULL
      `, [campaign.id]);

      if (recipients.length === 0) continue;

      const config = await getSettings();
      let oauth2Client = null;
      let gmail = typeof getTestMockGmailClient === 'function' ? getTestMockGmailClient() : null;

      if (!gmail && config.refreshToken) {
        try {
          oauth2Client = await getOAuth2Client();
          if (oauth2Client) {
            gmail = google.gmail({ version: 'v1', auth: oauth2Client });
          }
        } catch (err) {
          console.warn('Failed to initialize Gmail API client for followup worker:', err.message);
        }
      }

      if (!gmail) {
        console.warn('[Scheduler] Gmail disconnected, skipping followup dispatch');
        continue;
      }
      
      const host = process.env.PUBLIC_URL || 'http://localhost:5000';
      const baseUrl = process.env.PUBLIC_URL || host;

      for (const recipient of recipients) {
        const sentTime = new Date(recipient.sent_at).getTime();
        const daysPassed = (Date.now() - sentTime) / (1000 * 60 * 60 * 24);
        
        if (daysPassed >= campaign.followup_days) {
          console.log(`[Scheduler] Sending followup to ${recipient.email} for campaign ${campaign.id}`);
          
          await db.run(`UPDATE recipients SET followup_status = 'sending' WHERE id = ?`, [recipient.id]);

          let sendStatus = 'failed';
          
          if (recipient.gmail_thread_id) {
            try {
              const MailComposer = require('nodemailer/lib/mail-composer');
              const personalizedBody = template.body.replace(/\{\{\s*name\s*\}\}/gi, recipient.name).replace(/\{\{\s*email\s*\}\}/gi, recipient.email);
              const pixelUrl = `${baseUrl}/api/track/pixel/${recipient.id}.png`;
              const pixelTag = `<img src="${pixelUrl}" width="1" height="1" style="display:none;width:1px;height:1px;" alt="" />`;
              const finalHtml = `${personalizedBody}<br/><br/>${pixelTag}`;

              const composer = new MailComposer({
                from: config.userEmail,
                to: recipient.email,
                subject: template.subject,
                html: finalHtml,
                inReplyTo: recipient.gmail_message_id,
                references: [recipient.gmail_message_id],
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

              await gmail.users.messages.send({
                userId: 'me',
                requestBody: { 
                   raw: rawBase64,
                   threadId: recipient.gmail_thread_id 
                }
              });
              sendStatus = 'sent';
            } catch (err) {
              console.error(`Error sending followup to ${recipient.email}:`, err.message);
              sendStatus = 'failed';
            }
          }

          await db.run(`UPDATE recipients SET followup_status = ? WHERE id = ?`, [sendStatus, recipient.id]);
        }
      }
    }
  } catch (err) {
    console.error('[Scheduler] Error in followup loop:', err);
  }
}

let intervalId = null;
let followupIntervalId = null;

function startScheduler() {
  if (intervalId) return;
  console.log(`[Scheduler] Starting background worker (ID: ${WORKER_ID})`);
  intervalId = setInterval(processScheduledJobs, POLL_INTERVAL_MS);
  followupIntervalId = setInterval(processFollowups, 60000); // Check followups every minute
  // Run once immediately
  setTimeout(processScheduledJobs, 1000);
  setTimeout(processFollowups, 2000);
}

function stopScheduler() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    console.log('[Scheduler] Stopped background worker');
  }
  if (followupIntervalId) {
    clearInterval(followupIntervalId);
    followupIntervalId = null;
  }
}

module.exports = { startScheduler, stopScheduler };
