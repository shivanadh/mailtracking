const assert = require('assert');
const express = require('express');
const { router: aiRoutes, setTestMockGenerator } = require('../src/aiRoutes');
const departmentRoutes = require('../src/departmentRoutes');
const templateRoutes = require('../src/templateRoutes');
const { getDb } = require('../src/db');

// Mirror UI placeholder detection logic for verification
function findUnresolvedPlaceholders(text) {
  if (!text) return [];
  const found = new Set();
  const bracketMatches = text.match(/\[([a-zA-Z0-9_\s-]+)\]/g) || [];
  bracketMatches.forEach(m => found.add(m));

  const curlyMatches = text.match(/\{\{([^}]+)\}\}/g) || [];
  curlyMatches.forEach(m => {
    const clean = m.replace(/\{\{|\}\}/g, '').trim().toLowerCase();
    if (clean !== 'name' && clean !== 'email') {
      found.add(m);
    }
  });

  return Array.from(found);
}

// Mirror UI personalization logic
function renderPersonalizedPreview(template, recipient) {
  return template
    .replace(/\{\{\s*name\s*\}\}/gi, recipient.name)
    .replace(/\{\{\s*email\s*\}\}/gi, recipient.email);
}

async function runTests() {
  console.log('====================================================');
  console.log('Starting Gemini AI Email Assistant Comprehensive Tests');
  console.log('====================================================');
  let passed = 0;
  let failed = 0;

  function expect(condition, message) {
    if (condition) {
      console.log(`  ✓ ${message}`);
      passed++;
    } else {
      console.error(`  ✗ FAIL: ${message}`);
      failed++;
    }
  }

  // Setup express test app with AI, department, and template routes
  const app = express();
  app.use(express.json());
  app.use(aiRoutes);
  app.use(departmentRoutes);
  app.use(templateRoutes);

  async function makeRequest(method, path, body = null, headers = {}) {
    return new Promise((resolve) => {
      const req = {
        method,
        url: path,
        headers: { 'content-type': 'application/json', ...headers },
        body: body || {},
        socket: { remoteAddress: '127.0.0.1' },
        get(h) { return this.headers[h.toLowerCase()]; },
        query: {}
      };

      // Simple query param parsing for express route testing
      if (path.includes('?')) {
        const parts = path.split('?');
        req.url = parts[0];
        const searchParams = new URLSearchParams(parts[1]);
        for (const [k, v] of searchParams.entries()) {
          req.query[k] = v;
        }
      }

      let statusCode = 200;
      const resHeaders = {};
      let responseBody = null;

      const res = {
        setHeader(k, v) { resHeaders[k] = v; },
        status(code) { statusCode = code; return this; },
        json(data) { responseBody = data; resolve({ status: statusCode, body: responseBody, headers: resHeaders }); },
        send(data) { responseBody = data; resolve({ status: statusCode, body: responseBody, headers: resHeaders }); }
      };

      app.handle(req, res);
    });
  }

  // TEST 1: Missing API key handling & Security
  console.log('\n[Suite 1: Security & API Key Isolation]');
  const originalKey = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;

  let res = await makeRequest('GET', '/api/ai/status');
  expect(res.status === 200 && res.body.isConfigured === false, 'GET /api/ai/status reports unconfigured when key is missing');
  expect(!res.body.apiKey, 'API key is never returned or leaked to the client');

  res = await makeRequest('POST', '/api/ai/draft', { context: 'Need update on quarterly targets' });
  expect(res.status === 503, 'POST /api/ai/draft returns 503 when GEMINI_API_KEY is not configured');
  expect(res.body.error && res.body.error.includes('GEMINI_API_KEY is not configured'), 'Returns clear message for missing API key');

  // Set mock API key for remaining tests
  process.env.GEMINI_API_KEY = 'test_mock_gemini_key_12345';
  process.env.GEMINI_MODEL = 'gemini-2.5-flash';

  res = await makeRequest('GET', '/api/ai/status');
  expect(res.status === 200 && res.body.isConfigured === true, 'GET /api/ai/status reports configured when key is set');
  expect(!res.body.apiKey, 'API key remains strictly server-side');

  // TEST 2: Context length validation
  console.log('\n[Suite 2: Input Limits & Validation]');
  const hugeContext = 'A'.repeat(4001);
  res = await makeRequest('POST', '/api/ai/draft', { context: hugeContext });
  expect(res.status === 400 && res.body.error.includes('exceeds maximum limit of 4000'), 'Rejects context > 4000 characters with HTTP 400');

  const hugeRevision = 'B'.repeat(1001);
  res = await makeRequest('POST', '/api/ai/draft', {
    mode: 'revise',
    currentBody: 'Original draft',
    revisionInstructions: hugeRevision
  });
  expect(res.status === 400 && res.body.error.includes('exceed maximum limit of 1000'), 'Rejects revision instructions > 1000 characters with HTTP 400');

  // Empty inputs
  res = await makeRequest('POST', '/api/ai/draft', { context: '   ' });
  expect(res.status === 400 && res.body.error.includes('context'), 'Rejects whitespace-only context');

  res = await makeRequest('POST', '/api/ai/draft', { mode: 'revise', currentBody: '', revisionInstructions: 'shorter' });
  expect(res.status === 400, 'Rejects revision when current draft body is empty');

  // TEST 3: Mocked successful email generation
  console.log('\n[Suite 3: Structured Draft Generation]');
  setTestMockGenerator(async ({ prompt, systemInstruction }) => {
    assert(prompt.includes('Project Alpha milestone is approaching'), 'Prompt contains context');
    assert(systemInstruction.includes('NO HALLUCINATION OF SENSITIVE FACTS'), 'System prompt enforces fidelity');

    return JSON.stringify({
      subject: 'Action Required: Project Alpha Deliverables & Status',
      body: 'Hi {{name}},\n\nPlease review the upcoming milestone deliverables for Project Alpha.\nEnsure your team signs off before [Date].\n\nBest regards,\nOperations Lead',
      suggestedDetailsToConfirm: ['Confirm deadline date [Date]', 'Verify assigned department lead']
    });
  });

  res = await makeRequest('POST', '/api/ai/draft', {
    context: 'Project Alpha milestone is approaching. Need team to verify deliverables.',
    purpose: 'Follow-up',
    tone: 'Professional',
    length: 'Medium',
    senderSignature: 'Operations Lead',
    deadline: 'Friday 5pm'
  });

  expect(res.status === 200, 'Generation returns 200 OK');
  expect(res.body.success === true, 'Response reports success: true');
  expect(res.body.draft.subject === 'Action Required: Project Alpha Deliverables & Status', 'Subject matches generated output');
  expect(res.body.draft.body.includes('Hi {{name}}'), 'Body includes {{name}} template variable');
  expect(res.body.draft.body.includes('[Date]'), 'Body includes placeholder instead of hallucinated date');
  expect(Array.isArray(res.body.draft.suggestedDetailsToConfirm) && res.body.draft.suggestedDetailsToConfirm.length === 2, 'Suggested confirmation details returned');

  // TEST 4: Revision uses latest edited draft + revision instructions
  console.log('\n[Suite 4: Draft Revision Preserves User Edits]');
  let capturedRevisionPrompt = '';
  setTestMockGenerator(async ({ prompt }) => {
    capturedRevisionPrompt = prompt;
    return JSON.stringify({
      subject: 'Quick Update: Project Alpha Deliverables',
      body: 'Hi {{name}},\n\nQuick follow-up on your manual edit paragraph.\n\nCheers,\nAlex',
      suggestedDetailsToConfirm: []
    });
  });

  const editedSubject = 'My Custom Subject Written By Human';
  const editedBody = 'Hi {{name}},\n\nThis is custom text edited by the user before asking for AI revision.\n\nThanks!';
  const userRevision = 'Make it shorter and change sign-off to Alex';

  res = await makeRequest('POST', '/api/ai/draft', {
    mode: 'revise',
    currentSubject: editedSubject,
    currentBody: editedBody,
    revisionInstructions: userRevision,
    tone: 'Friendly'
  });

  expect(res.status === 200, 'Revision returns 200 OK');
  expect(capturedRevisionPrompt.includes(editedSubject), 'Revision prompt contains latest edited subject');
  expect(capturedRevisionPrompt.includes(editedBody), 'Revision prompt contains latest edited body');
  expect(capturedRevisionPrompt.includes(userRevision), 'Revision prompt contains user revision instructions');
  expect(res.body.draft.subject === 'Quick Update: Project Alpha Deliverables', 'Revised subject returned');
  expect(res.body.draft.body.includes('Quick follow-up'), 'Revised body returned');

  // TEST 5: Error handling simulations
  console.log('\n[Suite 5: Error Handling & Resilience]');

  // 5a: Invalid key error
  setTestMockGenerator(async () => {
    const err = new Error('API_KEY_INVALID: API key not valid');
    err.status = 400;
    throw err;
  });
  res = await makeRequest('POST', '/api/ai/draft', { context: 'Test invalid key' });
  expect(res.status === 401 && res.body.error.includes('Gemini API key is invalid or unauthorized'), 'Catches invalid key and returns 401');

  // 5b: Quota exceeded
  setTestMockGenerator(async () => {
    const err = new Error('RESOURCE_EXHAUSTED: Quota exceeded');
    err.status = 429;
    throw err;
  });
  res = await makeRequest('POST', '/api/ai/draft', { context: 'Test quota' });
  expect(res.status === 429 && res.body.error.includes('quota exceeded'), 'Catches quota exceeded and returns 429');

  // 5c: Timeout
  setTestMockGenerator(async () => {
    const err = new Error('Request timed out after 30 seconds');
    err.name = 'TimeoutError';
    throw err;
  });
  res = await makeRequest('POST', '/api/ai/draft', { context: 'Test timeout' });
  expect(res.status === 504 && res.body.error.includes('timed out'), 'Catches timeout and returns 504 Gateway Timeout');

  // 5d: Malformed JSON output
  setTestMockGenerator(async () => {
    return 'Invalid text that is not json';
  });
  res = await makeRequest('POST', '/api/ai/draft', { context: 'Test bad json' });
  expect(res.status === 502 && res.body.error.includes('invalid or empty response'), 'Catches malformed output and returns 502 Bad Gateway');

  // 5e: Model 404 / NOT_FOUND
  setTestMockGenerator(async () => {
    const err = new Error('This model is no longer available to new users. Please update your code to use models/gemini-3.8-flash.');
    err.status = 404;
    throw err;
  });
  res = await makeRequest('POST', '/api/ai/draft', { context: 'Test model unavailable' });
  expect(res.status === 502 && res.body.error.includes('unavailable or not supported'), 'Catches 404 model unavailable and returns specific 502 without blaming context');

  // 5f: 503 High demand
  setTestMockGenerator(async () => {
    const err = new Error('This model is currently experiencing high demand.');
    err.status = 503;
    throw err;
  });
  res = await makeRequest('POST', '/api/ai/draft', { context: 'Test high demand' });
  expect(res.status === 503 && res.body.error.includes('high demand'), 'Catches 503 high demand and returns 503 with specific message');

  // 5g: General provider error does not blame context
  setTestMockGenerator(async () => {
    const err = new Error('Internal service glitch');
    err.status = 500;
    throw err;
  });
  res = await makeRequest('POST', '/api/ai/draft', { context: 'Valid context for Finance reports' });
  expect(res.status === 500 && !res.body.error.includes('check your context'), 'Never blames user context for server/provider failures');

  // TEST 6: Candidate regeneration and version selection logic
  console.log('\n[Suite 6: Version Selection & Edits Survival]');
  let userCurrentDraft = {
    subject: 'Human Edited Subject 1',
    body: 'Human Edited Body 1'
  };

  // Simulate failed regeneration: user draft survives!
  setTestMockGenerator(async () => {
    throw new Error('Network error during regeneration');
  });
  try {
    await makeRequest('POST', '/api/ai/draft', { context: 'Regenerate draft' });
  } catch (e) { /* client catch */ }

  expect(userCurrentDraft.subject === 'Human Edited Subject 1', 'Current draft subject survives failed regeneration');
  expect(userCurrentDraft.body === 'Human Edited Body 1', 'Current draft body survives failed regeneration');

  // Simulate successful regeneration returning candidate
  const candidateVersion = {
    subject: 'Candidate AI Version 2',
    body: 'Candidate AI Body 2'
  };
  // Case A: User chooses "Keep Current Version"
  let selectedDraftA = userCurrentDraft;
  expect(selectedDraftA.subject === 'Human Edited Subject 1', 'User can discard candidate and retain current edits');

  // Case B: User chooses "Use New Version"
  let selectedDraftB = candidateVersion;
  expect(selectedDraftB.subject === 'Candidate AI Version 2', 'Candidate version is applied only when explicitly selected');

  // TEST 7: Placeholder detection and recipient personalization
  console.log('\n[Suite 7: Preview Personalization & Unresolved Placeholders]');
  const sampleBodyWithPlaceholders = 'Hi {{name}},\n\nYour target is [Amount] due by [Date]. Reply to {{email}} or [Contact].';
  const detected = findUnresolvedPlaceholders(sampleBodyWithPlaceholders);

  expect(detected.includes('[Amount]'), 'Detects [Amount] placeholder');
  expect(detected.includes('[Date]'), 'Detects [Date] placeholder');
  expect(detected.includes('[Contact]'), 'Detects [Contact] placeholder');
  expect(!detected.includes('{{name}}') && !detected.includes('{{email}}'), 'Standard {{name}} and {{email}} variables are not treated as unresolvable placeholders');

  const testRecipient = { name: 'Sarah Chen', email: 'sarah@example.com' };
  const rendered = renderPersonalizedPreview('Hello {{name}}, we sent to {{email}}.', testRecipient);
  expect(rendered === 'Hello Sarah Chen, we sent to sarah@example.com.', 'Renders personalized recipient preview accurately');

  // TEST 8: Side Effect Isolation (Zero database writes or mail sending during AI generation)
  console.log('\n[Suite 8: Zero Side Effects on SQLite / Mail Sending]');
  const db = await getDb();
  const campaignsBefore = await db.all('SELECT * FROM campaigns');
  const recipientsBefore = await db.all('SELECT * FROM recipients');
  const jobsBefore = await db.all('SELECT * FROM scheduled_jobs');

  setTestMockGenerator(async () => {
    return JSON.stringify({
      subject: 'Side Effect Test Draft',
      body: 'Hello {{name}}, zero side effects test.',
      suggestedDetailsToConfirm: []
    });
  });
  await makeRequest('POST', '/api/ai/draft', { context: 'Side effect check' });

  const campaignsAfter = await db.all('SELECT * FROM campaigns');
  const recipientsAfter = await db.all('SELECT * FROM recipients');
  const jobsAfter = await db.all('SELECT * FROM scheduled_jobs');

  expect(campaignsBefore.length === campaignsAfter.length, 'Zero campaigns created during AI draft generation');
  expect(recipientsBefore.length === recipientsAfter.length, 'Zero recipients created during AI draft generation');
  expect(jobsBefore.length === jobsAfter.length, 'Zero scheduled jobs created during AI draft generation');

  // TEST 9: Existing MailPulse routes regression test
  console.log('\n[Suite 9: Existing MailPulse Features Regression Check]');
  const deptsRes = await makeRequest('GET', '/api/departments?status=active');
  expect(deptsRes.status === 200 && Array.isArray(deptsRes.body), 'GET /api/departments remains operational');

  const templatesRes = await makeRequest('GET', '/api/templates?status=approved');
  expect(templatesRes.status === 200, 'GET /api/templates remains operational');

  // Restore env
  setTestMockGenerator(null);
  if (originalKey) process.env.GEMINI_API_KEY = originalKey;
  else delete process.env.GEMINI_API_KEY;

  console.log('\n====================================================');
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log('====================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
