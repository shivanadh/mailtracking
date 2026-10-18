const assert = require('assert');
const http = require('http');
const xlsx = require('xlsx');

function request(url, options = {}) {
  return new Promise((resolve, reject) => {
    http.get(url, options, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const bodyBuffer = Buffer.concat(chunks);
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          buffer: bodyBuffer,
          text: bodyBuffer.toString('utf-8')
        });
      });
    }).on('error', reject);
  });
}

async function runTests() {
  console.log('\n====================================================');
  console.log('Running Report Export Test Suite (CSV & XLSX)');
  console.log('====================================================');

  const baseUrl = 'http://localhost:5000';

  // 1. Dashboard summary export as CSV
  {
    console.log('\n[Suite 1: Dashboard All-Campaigns Export - CSV]');
    const res = await request(`${baseUrl}/api/campaigns/export?format=csv`);
    assert.strictEqual(res.statusCode, 200, `Expected 200, got ${res.statusCode}`);
    assert.match(res.headers['content-type'], /text\/csv/, 'Expected text/csv content type');
    assert.match(res.headers['content-disposition'], /mailpulse_all_campaigns_summary\.csv/, 'Expected filename in Content-Disposition');
    assert.match(res.headers['access-control-expose-headers'], /Content-Disposition/i, 'Expected exposed Content-Disposition');
    assert.ok(res.text.includes('Campaign ID'), 'Expected Campaign ID header in CSV');
    assert.ok(res.text.includes('Tracked Opens'), 'Expected Tracked Opens in CSV');
    assert.ok(res.text.includes('Reply Rate'), 'Expected Reply Rate in CSV');
    console.log('  ✓ Dashboard CSV export returns 200 with valid headers and CSV columns');
  }

  // 2. Dashboard summary export as XLSX
  {
    console.log('\n[Suite 2: Dashboard All-Campaigns Export - XLSX]');
    const res = await request(`${baseUrl}/api/campaigns/export?format=xlsx`);
    assert.strictEqual(res.statusCode, 200, `Expected 200, got ${res.statusCode}`);
    assert.match(res.headers['content-type'], /spreadsheetml/, 'Expected spreadsheetml content type');
    assert.match(res.headers['content-disposition'], /mailpulse_all_campaigns_summary\.xlsx/, 'Expected XLSX filename in Content-Disposition');
    assert.match(res.headers['access-control-expose-headers'], /Content-Disposition/i, 'Expected exposed Content-Disposition');
    
    // Parse XLSX from buffer
    const wb = xlsx.read(res.buffer, { type: 'buffer' });
    assert.ok(wb.SheetNames.includes('Campaigns Summary'), 'Expected "Campaigns Summary" sheet in workbook');
    console.log('  ✓ Dashboard XLSX export returns 200 with valid workbook structure');
  }

  // 3. Campaign Detail export as CSV (Campaign 1)
  {
    console.log('\n[Suite 3: Campaign Detail Export - CSV (All Records)]');
    const res = await request(`${baseUrl}/api/campaigns/1/export?format=csv`);
    assert.strictEqual(res.statusCode, 200, `Expected 200, got ${res.statusCode}`);
    assert.match(res.headers['content-type'], /text\/csv/, 'Expected text/csv content type');
    assert.match(res.headers['content-disposition'], /campaign_1_report\.csv/, 'Expected campaign_1_report.csv filename');
    assert.match(res.headers['access-control-expose-headers'], /Content-Disposition/i, 'Expected exposed Content-Disposition');
    assert.ok(res.text.includes('Email'), 'Expected Email column in CSV');
    assert.ok(res.text.includes('Tracked Open Count'), 'Expected Tracked Open Count in CSV');
    assert.ok(res.text.includes('TAT Open'), 'Expected TAT Open in CSV');
    console.log('  ✓ Campaign detail CSV export returns 200 with recipient rows and TAT columns');
  }

  // 4. Campaign Detail export with Status Filter
  {
    console.log('\n[Suite 4: Campaign Detail Export with Filter (REPLIED / OPENED)]');
    const res = await request(`${baseUrl}/api/campaigns/1/export?format=csv&status=REPLIED`);
    assert.strictEqual(res.statusCode, 200, `Expected 200, got ${res.statusCode}`);
    assert.match(res.headers['content-disposition'], /campaign_1_report_replied\.csv/, 'Expected status suffix in filename');
    console.log('  ✓ Campaign detail export with status filter appends filter suffix to filename');
  }

  // 5. Campaign Detail export as XLSX
  {
    console.log('\n[Suite 5: Campaign Detail Export - XLSX]');
    const res = await request(`${baseUrl}/api/campaigns/1/export?format=xlsx`);
    assert.strictEqual(res.statusCode, 200, `Expected 200, got ${res.statusCode}`);
    assert.match(res.headers['content-type'], /spreadsheetml/, 'Expected spreadsheetml content type');
    assert.match(res.headers['content-disposition'], /campaign_1_report\.xlsx/, 'Expected XLSX filename in Content-Disposition');
    
    const wb = xlsx.read(res.buffer, { type: 'buffer' });
    assert.ok(wb.SheetNames.includes('Summary'), 'Expected "Summary" sheet in workbook');
    assert.ok(wb.SheetNames.includes('Recipients'), 'Expected "Recipients" sheet in workbook');
    console.log('  ✓ Campaign detail XLSX export contains Summary and Recipients sheets');
  }

  // 6. Non-existent campaign export error handling (404)
  {
    console.log('\n[Suite 6: Non-Existent Campaign Error Handling]');
    const res = await request(`${baseUrl}/api/campaigns/999999/export`);
    assert.strictEqual(res.statusCode, 404, `Expected 404, got ${res.statusCode}`);
    assert.match(res.headers['content-type'], /application\/json/, 'Expected application/json error response');
    const json = JSON.parse(res.text);
    assert.strictEqual(json.error, 'Campaign not found', 'Expected Campaign not found error message');
    console.log('  ✓ Non-existent campaign returns 404 JSON error (never invalid file download)');
  }

  // 7. Formula injection sanitization check
  {
    console.log('\n[Suite 7: Spreadsheet Formula Injection Sanitization]');
    const { getDb } = require('../src/db');
    const db = await getDb();
    
    // Insert a test campaign with malicious formula trigger in subject
    const result = await db.run(
      'INSERT INTO campaigns (title, subject, body, campaign_status, created_at) VALUES (?, ?, ?, ?, ?)',
      ['=1+1_test_label', '@SUM(A1:A10)', 'Safe body', 'sent', new Date().toISOString()]
    );
    const testCampaignId = result.lastID;

    // Insert recipients with formula triggers
    await db.run(
      'INSERT INTO recipients (campaign_id, name, email, status, first_opened_at, open_count) VALUES (?, ?, ?, ?, ?, ?)',
      [testCampaignId, '+Attacker', '-danger@example.com', 'OPENED', new Date().toISOString(), 1]
    );

    const resCsv = await request(`${baseUrl}/api/campaigns/${testCampaignId}/export?format=csv`);
    assert.strictEqual(resCsv.statusCode, 200);
    // Ensure cells starting with =, +, -, @ are escaped with '
    assert.ok(resCsv.text.includes("'+Attacker"), 'Expected +Attacker to be escaped with single quote');
    assert.ok(resCsv.text.includes("'-danger@example.com"), 'Expected -danger to be escaped with single quote');

    // Also check XLSX
    const resXlsx = await request(`${baseUrl}/api/campaigns/${testCampaignId}/export?format=xlsx`);
    assert.strictEqual(resXlsx.statusCode, 200);
    const wb = xlsx.read(resXlsx.buffer, { type: 'buffer' });
    const recipientsSheet = xlsx.utils.sheet_to_json(wb.Sheets['Recipients']);
    assert.strictEqual(recipientsSheet[0]['Name'], "'+Attacker", 'XLSX Name should be sanitized against formula injection');
    assert.strictEqual(recipientsSheet[0]['Email'], "'-danger@example.com", 'XLSX Email should be sanitized against formula injection');

    // Clean up test campaign and recipients
    await db.run('DELETE FROM recipients WHERE campaign_id = ?', [testCampaignId]);
    await db.run('DELETE FROM campaigns WHERE id = ?', [testCampaignId]);
    console.log('  ✓ Formulas starting with =, +, -, @ are safely escaped in both CSV and XLSX');
  }

  // 8. Opened filtering uses recorded open evidence, including replied recipients
  {
    console.log('\n[Suite 8: Opened Filter Includes Replied Recipients with Open Evidence]');
    const { getDb } = require('../src/db');
    const db = await getDb();

    // Create a temporary test campaign
    const campResult = await db.run(
      'INSERT INTO campaigns (title, subject, body, campaign_status, created_at) VALUES (?, ?, ?, ?, ?)',
      ['Open Filter Test', 'Open Filter Subject', 'Body', 'sent', new Date().toISOString()]
    );
    const testCampId = campResult.lastID;

    // Recipient A: Opened but not replied (status = 'OPENED', first_opened_at set)
    await db.run(
      'INSERT INTO recipients (campaign_id, name, email, status, first_opened_at, open_count) VALUES (?, ?, ?, ?, ?, ?)',
      [testCampId, 'Rec A', 'reca@example.com', 'OPENED', new Date().toISOString(), 1]
    );

    // Recipient B: Replied AND had opened (status = 'REPLIED', first_opened_at set, first_replied_at set)
    await db.run(
      'INSERT INTO recipients (campaign_id, name, email, status, first_opened_at, open_count, first_replied_at, reply_count) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [testCampId, 'Rec B', 'recb@example.com', 'REPLIED', new Date().toISOString(), 1, new Date().toISOString(), 1]
    );

    // Recipient C: Replied without recorded open (status = 'REPLIED', first_opened_at = NULL)
    await db.run(
      'INSERT INTO recipients (campaign_id, name, email, status, first_opened_at, open_count, first_replied_at, reply_count) VALUES (?, ?, ?, ?, NULL, 0, ?, ?)',
      [testCampId, 'Rec C', 'recc@example.com', 'REPLIED', new Date().toISOString(), 1]
    );

    // Export with ?status=OPENED
    const res = await request(`${baseUrl}/api/campaigns/${testCampId}/export?format=csv&status=OPENED`);
    assert.strictEqual(res.statusCode, 200);
    
    // Recipient A should be present
    assert.ok(res.text.includes('reca@example.com'), 'Expected Recipient A in OPENED export');
    // Recipient B (replied but opened) MUST be present
    assert.ok(res.text.includes('recb@example.com'), 'Expected Recipient B (replied + opened) in OPENED export');
    // Recipient C (replied but never opened) MUST NOT be present
    assert.ok(!res.text.includes('recc@example.com'), 'Expected Recipient C (no open evidence) to be excluded from OPENED export');

    // Clean up
    await db.run('DELETE FROM recipients WHERE campaign_id = ?', [testCampId]);
    await db.run('DELETE FROM campaigns WHERE id = ?', [testCampId]);
    console.log('  ✓ OPENED filter correctly includes recipients with open evidence even if later replied');
  }

  console.log('\n====================================================');
  console.log('Results: All Report Export Tests Passed!');
  console.log('====================================================\n');
}

runTests().catch(err => {
  console.error('\n❌ Test Suite Failed:', err);
  process.exit(1);
});
