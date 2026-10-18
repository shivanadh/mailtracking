const assert = require('assert');
const { getDb } = require('../src/db');
const { setTestMockGmailClient, sendSingleRecipient } = require('../src/mailer');
const { processThreadMessagesForRecipient } = require('../src/replyPoller');
const app = require('../src/server');

let server;
let BASE_URL;

async function request(path, options = {}) {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, options);
  let data = null;
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    data = await res.json();
  } else {
    data = await res.text();
  }
  return { status: res.status, headers: res.headers, data };
}

async function runRegressionTests() {
  console.log('====================================================');
  console.log('Running MailPulse Real Tracking & Simulation Removal Test Suite');
  console.log('====================================================');

  // Start test server on ephemeral port (isolated in-process testing)
  await new Promise((resolve) => {
    server = app.listen(0, () => {
      const port = server.address().port;
      BASE_URL = `http://localhost:${port}`;
      console.log(`Isolated test server listening at ${BASE_URL}`);
      resolve();
    });
  });

  const db = await getDb();

  try {
    // ------------------------------------------------------------------
    // Suite 1: Disabled Simulation Endpoints (Cannot Mutate Records)
    // ------------------------------------------------------------------
    console.log('\n[Suite 1: Former Simulation Endpoints Permanently Disabled]');
    
    // Seed a dummy recipient in DB
    const dummyCampRes = await db.run(
      `INSERT INTO campaigns (title, subject, body, created_at) VALUES ('Seed Camp', 'Seed', 'Body', datetime('now'))`
    );
    const dummyCampId = dummyCampRes.lastID;
    const dummyRecRes = await db.run(
      `INSERT INTO recipients (campaign_id, email, name, status, send_status, sent_at) VALUES (?, 'dummy@example.com', 'Dummy', 'SENT', 'sent', datetime('now'))`,
      [dummyCampId]
    );
    const dummyRecId = dummyRecRes.lastID;

    // Test POST /api/simulate/open returns 410 Gone
    const simOpenRes = await request('/api/simulate/open', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipientId: dummyRecId, minutesDelay: 5 })
    });
    assert.strictEqual(simOpenRes.status, 410, 'POST /api/simulate/open must return 410 Gone');
    assert.ok(simOpenRes.data.error.includes('permanently removed'), 'Error message must explain removal');

    // Test POST /api/simulate/reply returns 410 Gone
    const simReplyRes = await request('/api/simulate/reply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipientId: dummyRecId, snippet: 'Hello', minutesDelay: 10 })
    });
    assert.strictEqual(simReplyRes.status, 410, 'POST /api/simulate/reply must return 410 Gone');
    assert.ok(simReplyRes.data.error.includes('permanently removed'), 'Error message must explain removal');

    // Verify DB was NOT mutated
    const checkDummy = await db.get('SELECT * FROM recipients WHERE id = ?', [dummyRecId]);
    assert.strictEqual(checkDummy.status, 'SENT', 'Recipient status must NOT be mutated by simulation endpoints');
    assert.strictEqual(checkDummy.first_opened_at, null, 'Recipient first_opened_at must remain null');
    assert.strictEqual(checkDummy.first_replied_at, null, 'Recipient first_replied_at must remain null');
    assert.strictEqual(checkDummy.open_count, 0, 'Recipient open_count must remain 0');
    console.log('  ✓ Former simulation endpoints return 410 Gone and cannot mutate recipient records');

    // ------------------------------------------------------------------
    // Suite 2: Disconnected Gmail Prevents Campaign Creation
    // ------------------------------------------------------------------
    console.log('\n[Suite 2: Disconnected Gmail Validation]');
    // Temporarily ensure no mock client is active
    setTestMockGmailClient(null);

    // Save empty settings in db to simulate disconnected state
    await db.run('DELETE FROM settings WHERE key IN ("clientId", "clientSecret", "refreshToken")');

    const disconnectedRes = await request('/api/campaigns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Disconnected Attempt',
        subject: 'Should Fail',
        body: 'Body',
        recipients: [{ name: 'Test', email: 'test_disconnected@example.com' }]
      })
    });

    assert.strictEqual(disconnectedRes.status, 400, 'Disconnected Gmail must return 400 Bad Request');
    assert.ok(disconnectedRes.data.error.includes('not connected') || disconnectedRes.data.error.includes('disconnected'), 'Actionable error returned');
    console.log('  ✓ Disconnected Gmail account produces an actionable error instead of marking messages sent');

    // ------------------------------------------------------------------
    // Suite 3: Real Gmail Sending Flow (Using Isolated Mock Client for Tests)
    // ------------------------------------------------------------------
    console.log('\n[Suite 3: Offline Isolated Gmail Client Sending]');
    
    // Set isolated mock client: sends mock IDs without touching real Gmail or sending real emails
    const sentMessages = [];
    const mockGmail = {
      users: {
        messages: {
          send: async ({ userId, requestBody }) => {
            const msgId = `gmail_msg_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
            const threadId = `gmail_thread_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
            sentMessages.push({ msgId, threadId, requestBody });
            return {
              data: {
                id: msgId,
                threadId: threadId
              }
            };
          }
        }
      }
    };
    setTestMockGmailClient(mockGmail);

    // Restore test credentials in settings so checkGmailConnection returns true
    await db.run('INSERT OR REPLACE INTO settings (key, value) VALUES ("clientId", "mock-client-id")');
    await db.run('INSERT OR REPLACE INTO settings (key, value) VALUES ("clientSecret", "mock-client-secret")');
    await db.run('INSERT OR REPLACE INTO settings (key, value) VALUES ("refreshToken", "mock-refresh-token")');
    await db.run('INSERT OR REPLACE INTO settings (key, value) VALUES ("userEmail", "sender@test.com")');

    const createRes = await request('/api/campaigns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Regression Test - Open vs Reply',
        subject: `Regression Test ${Date.now()}`,
        body: 'Hello {{name}}, checking open tracking aggregation.',
        recipients: [
          { name: 'Recipient A', email: `reg_a_${Date.now()}@example.com` },
          { name: 'Recipient B', email: `reg_b_${Date.now()}@example.com` }
        ]
      })
    });

    assert.strictEqual(createRes.status, 201, 'Campaign creation should return 201');
    assert.strictEqual(createRes.data.mode, 'gmail_oauth', 'Mode must be real gmail_oauth, never simulation');
    const campaignId = createRes.data.campaignId;
    const recipients = createRes.data.recipients;
    const recipA = recipients[0];
    const recipB = recipients[1];

    assert.ok(recipA.gmail_message_id && !recipA.gmail_message_id.startsWith('sim_msg_'), 'Message ID must be Gmail format');
    assert.ok(recipA.gmail_thread_id && !recipA.gmail_thread_id.startsWith('sim_thread_'), 'Thread ID must be Gmail format');
    assert.strictEqual(recipA.send_status, 'sent', 'send_status must be sent');
    assert.ok(recipA.sent_at, 'sent_at must be populated');
    console.log('  ✓ Campaign created with isolated mock Gmail client (zero real emails dispatched)');

    // ------------------------------------------------------------------
    // Suite 4: Recipient A opened, Recipient B replied without open
    // ------------------------------------------------------------------
    console.log('\n[Suite 4: Open vs Reply Isolation & TAT Logging]');
    
    // Step 1: Recipient A loads tracking pixel
    console.log('Dispatching tracking pixel request for Recipient A...');
    const pixelResA = await request(`/api/track/pixel/${recipA.id}.png`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36' }
    });
    assert.strictEqual(pixelResA.status, 200, 'Pixel request must return 200');

    await new Promise(r => setTimeout(r, 200));

    // Step 2: Recipient B sends real Gmail reply (processed through actual processThreadMessagesForRecipient)
    console.log('Processing detected Gmail reply for Recipient B via thread poller...');
    const replyTimestamp = Date.now() + 15 * 60 * 1000; // 15 mins later
    const replySnippet = 'Thanks for the email! Confirmed our milestones.';
    const replyMockGmail = {
      users: {
        threads: {
          get: async ({ userId, id }) => {
            return {
              data: {
                id,
                messages: [
                  {
                    id: recipB.gmail_message_id,
                    internalDate: String(new Date(recipB.sent_at).getTime()),
                    snippet: 'Sent email',
                    payload: {
                      headers: [
                        { name: 'From', value: 'sender@test.com' },
                        { name: 'Subject', value: `Regression Test` }
                      ],
                      parts: []
                    }
                  },
                  {
                    id: `real_reply_msg_${Date.now()}`,
                    internalDate: String(replyTimestamp),
                    snippet: replySnippet,
                    payload: {
                      headers: [
                        { name: 'From', value: `${recipB.name} <${recipB.email}>` },
                        { name: 'Subject', value: `Re: Regression Test` }
                      ],
                      body: {
                        data: Buffer.from(replySnippet).toString('base64')
                      }
                    }
                  }
                ]
              }
            };
          }
        }
      }
    };

    const replyUpdated = await processThreadMessagesForRecipient(db, replyMockGmail, recipB);
    assert.strictEqual(replyUpdated, true, 'processThreadMessagesForRecipient must successfully detect and record reply');

    // Step 3: Verify campaign-detail metrics
    const detailRes = await request(`/api/campaigns/${campaignId}`);
    assert.strictEqual(detailRes.status, 200);
    const detailData = detailRes.data;

    const rA = detailData.recipients.find(r => r.id === recipA.id);
    const rB = detailData.recipients.find(r => r.id === recipB.id);

    // Recipient A verification
    assert.ok(rA.first_opened_at, 'Recipient A must have first_opened_at populated');
    assert.strictEqual(rA.open_count, 1, 'Recipient A open_count must be 1');
    assert.strictEqual(rA.status, 'OPENED', 'Recipient A status must be OPENED');

    // Recipient B verification: REPLIED alone must NOT count as opened!
    assert.strictEqual(rB.first_opened_at, null, 'Recipient B first_opened_at must remain null');
    assert.strictEqual(rB.open_count, 0, 'Recipient B open_count must remain 0');
    assert.strictEqual(rB.status, 'REPLIED', 'Recipient B status must be REPLIED');
    assert.ok(rB.tat_reply_seconds > 0, 'TAT reply seconds must be computed');
    assert.strictEqual(rB.reply_snippet, replySnippet, 'Reply snippet must match');

    // Campaign metrics
    assert.strictEqual(detailData.metrics.total_recipients, 2, 'total_recipients = 2');
    assert.strictEqual(detailData.metrics.opened_count, 1, 'opened_count = 1 (Recipient A only)');
    assert.strictEqual(detailData.metrics.replied_count, 1, 'replied_count = 1 (Recipient B only)');
    assert.strictEqual(detailData.metrics.open_rate, 50, 'open_rate = 50%');
    assert.strictEqual(detailData.metrics.reply_rate, 50, 'reply_rate = 50%');
    console.log('  ✓ Detail metrics: 2 recipients, 1 tracked open, 1 reply, 50% open rate (replies alone do not count as opens)');

    // Step 4: Verify campaign-list dashboard summary
    const listRes = await request('/api/campaigns');
    assert.strictEqual(listRes.status, 200);
    const summary = listRes.data.find(c => c.id === campaignId);
    assert.strictEqual(summary.opened_count, 1, 'Dashboard opened_count = 1');
    assert.strictEqual(summary.replied_count, 1, 'Dashboard replied_count = 1');
    assert.strictEqual(summary.open_rate, 50, 'Dashboard open_rate = 50%');
    assert.strictEqual(summary.reply_rate, 50, 'Dashboard reply_rate = 50%');
    console.log('  ✓ Dashboard list metrics: accurately reflects 1 open, 1 reply, 50% open rate');

    // ------------------------------------------------------------------
    // Suite 5: Unique Opened Count Deduplication
    // ------------------------------------------------------------------
    console.log('\n[Suite 5: Unique Opened Count Deduplication]');
    for (let i = 2; i <= 5; i++) {
      const res = await request(`/api/track/pixel/${recipA.id}.png`, {
        headers: { 'User-Agent': `Mozilla/5.0 Test-Agent-${i}` }
      });
      assert.strictEqual(res.status, 200);
    }
    await new Promise(r => setTimeout(r, 200));

    const dedupeDetail = await request(`/api/campaigns/${campaignId}`);
    const rADedupe = dedupeDetail.data.recipients.find(r => r.id === recipA.id);
    assert.strictEqual(rADedupe.open_count, 5, 'Recipient A open_count should be 5');
    assert.strictEqual(dedupeDetail.data.metrics.opened_count, 1, 'Unique opened_count remains 1');
    assert.strictEqual(dedupeDetail.data.metrics.open_rate, 50, 'Unique open_rate remains 50%');
    console.log('  ✓ Multiple pixel loads increment open_count but do not increase unique opened_count');

    // ------------------------------------------------------------------
    // Suite 6: Proxy vs Suspected Automation Classification
    // ------------------------------------------------------------------
    console.log('\n[Suite 6: Google Image Proxy vs Suspected Automation Classification]');
    const proxyRes = await request(`/api/track/pixel/${recipA.id}.png`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 (via GoogleImageProxy)'
      }
    });
    assert.strictEqual(proxyRes.status, 200);
    await new Promise(r => setTimeout(r, 200));

    const logsRes = await request(`/api/recipients/${recipA.id}/logs`);
    const latestLog = logsRes.data.logs[logsRes.data.logs.length - 1];
    const details = JSON.parse(latestLog.details);

    assert.strictEqual(details.isGoogleProxy, true, 'isGoogleProxy must be true');
    assert.strictEqual(details.proxyLabel, 'Google image proxy — human open unverified');
    assert.strictEqual(details.isSuspectedAutomated, false, 'isSuspectedAutomated must be false for GoogleImageProxy alone');
    console.log('  ✓ GoogleImageProxy labeled "Google image proxy — human open unverified" without flagging automated scanning');

    // ------------------------------------------------------------------
    // Suite 7: Settings Endpoint Cleanliness
    // ------------------------------------------------------------------
    console.log('\n[Suite 7: Settings Mode Cleanliness]');
    const settingsRes = await request('/api/settings');
    assert.strictEqual(settingsRes.status, 200);
    assert.notStrictEqual(settingsRes.data.mode, 'simulation', 'Mode must never be "simulation"');
    assert.strictEqual(settingsRes.data.isConnected, true, 'isConnected flag is true');
    console.log('  ✓ Settings endpoint reports isConnected and clean non-simulation mode');

    // ------------------------------------------------------------------
    // Suite 8: Failed Sends Cannot Clear Timestamps
    // ------------------------------------------------------------------
    console.log('\n[Suite 8: Failed Sends Cannot Clear Timestamps Of Already Sent Recipients]');
    const originalSentAt = '2026-10-18T05:00:00.000Z';
    const sentRecRes = await db.run(
      `INSERT INTO recipients (campaign_id, email, name, status, send_status, sent_at) 
       VALUES (?, 'already_sent@example.com', 'Sent Person', 'SENT', 'sent', ?)`,
      [dummyCampId, originalSentAt]
    );
    const sentRecId = sentRecRes.lastID;

    // Attempt to re-send with disconnected client
    const failSendResult = await sendSingleRecipient({
      recipient: { id: sentRecId, email: 'already_sent@example.com', name: 'Sent Person', sent_at: originalSentAt, send_status: 'sent' },
      campaign: { id: dummyCampId, subject: 'Retry Subject', body: 'Retry Body' },
      baseUrl: BASE_URL,
      validDeptIds: [],
      gmailClient: null,
      config: { userEmail: 'test@example.com' }
    });

    assert.strictEqual(failSendResult.sendStatus, 'failed', 'Send status should be failed');
    const verifyRecAfterFail = await db.get('SELECT * FROM recipients WHERE id = ?', [sentRecId]);
    assert.strictEqual(verifyRecAfterFail.sent_at, originalSentAt, 'sent_at must NOT be cleared by failed send');
    assert.strictEqual(verifyRecAfterFail.send_status, 'sent', 'send_status must remain sent');
    console.log('  ✓ Failed send attempt did not clear sent_at timestamp of already sent recipient');

    console.log('\n====================================================');
    console.log('Results: All Real Tracking & Simulation Removal Tests Passed!');
    console.log('====================================================\n');
  } finally {
    if (server) {
      server.close();
    }
  }
}

runRegressionTests().then(() => {
  process.exit(0);
}).catch(err => {
  console.error('\n❌ TEST FAILED:', err);
  if (server) server.close();
  process.exit(1);
});
