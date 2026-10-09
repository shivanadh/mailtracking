const { getDb } = require('./db');

/**
 * Auto-Assignment Engine
 * 
 * Strict priority order:
 * 1. Campaign department — campaign was explicitly sent to a department
 * 2. Account code match — exact code found in email metadata/subject/body
 * 3. Signature/employee ID match — exact employee_id found in reply text/subject
 * 4. Email address match — exact recipient email matches a department participant
 * 5. Unassigned — no match found, never guesses
 */

/**
 * Assign a recipient to a department/participant based on strict priority rules.
 * 
 * @param {number} recipientId - The recipient row ID
 * @param {object} options - Optional context
 * @param {number[]} [options.campaignDepartmentIds] - Department IDs explicitly selected for the campaign
 * @param {string} [options.replyText] - Reply body text for signature/code scanning
 * @param {string} [options.subject] - Email subject for code/signature scanning
 * @param {boolean} [options.forceReassign] - If true, reassign even if already assigned
 * @returns {object} Assignment result with source, confidence, departmentId, participantId
 */
async function assignRecipient(recipientId, options = {}) {
  const db = await getDb();
  const now = new Date().toISOString();

  const recipient = await db.get('SELECT * FROM recipients WHERE id = ?', [recipientId]);
  if (!recipient) {
    return { assigned: false, reason: 'Recipient not found' };
  }

  // Check if already assigned (unless forceReassign)
  if (!options.forceReassign) {
    const existing = await db.get(
      'SELECT * FROM recipient_assignments WHERE recipient_id = ? AND assignment_source != ?',
      [recipientId, 'unassigned']
    );
    if (existing) {
      return {
        assigned: true,
        alreadyAssigned: true,
        departmentId: existing.department_id,
        participantId: existing.participant_id,
        source: existing.assignment_source,
        confidence: existing.confidence
      };
    }
  }

  let result = null;

  // Priority 1: Campaign department
  result = await matchCampaignDepartment(db, recipient, options.campaignDepartmentIds);
  if (result) {
    await saveAssignment(db, recipientId, result, now);
    return result;
  }

  // Priority 2: Account code match
  result = await matchAccountCode(db, recipient, options.subject, options.replyText);
  if (result) {
    await saveAssignment(db, recipientId, result, now);
    return result;
  }

  // Priority 3: Signature/employee ID match
  result = await matchSignatureId(db, recipient, options.subject, options.replyText);
  if (result) {
    await saveAssignment(db, recipientId, result, now);
    return result;
  }

  // Priority 4: Email address match
  result = await matchEmailAddress(db, recipient);
  if (result) {
    await saveAssignment(db, recipientId, result, now);
    return result;
  }

  // Priority 5: Unassigned
  const unassigned = {
    assigned: false,
    departmentId: null,
    participantId: null,
    source: 'unassigned',
    confidence: 'none',
    evidence: null
  };
  await saveAssignment(db, recipientId, unassigned, now);
  return unassigned;
}

/**
 * Priority 1: If the campaign was explicitly sent to departments, use the first one.
 */
async function matchCampaignDepartment(db, recipient, campaignDepartmentIds) {
  // Use provided campaign department IDs if available
  let deptIds = campaignDepartmentIds;

  if (!deptIds || deptIds.length === 0) {
    // Look up from campaign_departments table
    const rows = await db.all(
      'SELECT department_id FROM campaign_departments WHERE campaign_id = ?',
      [recipient.campaign_id]
    );
    deptIds = rows.map(r => r.department_id);
  }

  if (!deptIds || deptIds.length === 0) return null;

  // Try to find the specific participant by email within campaign departments
  for (const deptId of deptIds) {
    const participant = await db.get(
      'SELECT * FROM department_participants WHERE department_id = ? AND LOWER(email) = LOWER(?) AND status = ?',
      [deptId, recipient.email, 'active']
    );
    if (participant) {
      return {
        assigned: true,
        departmentId: deptId,
        participantId: participant.id,
        source: 'campaign_dept',
        confidence: 'high',
        evidence: `Campaign sent to department, participant matched by email`
      };
    }
  }

  // If no participant match, still assign to first campaign department
  return {
    assigned: true,
    departmentId: deptIds[0],
    participantId: null,
    source: 'campaign_dept',
    confidence: 'high',
    evidence: `Campaign explicitly sent to department`
  };
}

/**
 * Priority 2: Exact account/customer-code match in email metadata, subject, or body.
 */
async function matchAccountCode(db, recipient, subject, replyText) {
  const codes = await db.all(`
    SELECT dac.*, d.status AS dept_status
    FROM department_account_codes dac
    JOIN departments d ON dac.department_id = d.id
    WHERE d.status = 'active'
  `);

  if (codes.length === 0) return null;

  // Build searchable text from available fields (safe — no sensitive content stored)
  const searchText = [
    recipient.email || '',
    recipient.name || '',
    subject || '',
    replyText || '',
    recipient.reply_snippet || ''
  ].join(' ');

  for (const code of codes) {
    // Exact case-insensitive match of the account code anywhere in the text
    if (searchText.toLowerCase().includes(code.account_code.toLowerCase())) {
      return {
        assigned: true,
        departmentId: code.department_id,
        participantId: null,
        source: 'account_code',
        confidence: 'high',
        evidence: `Matched account code: ${code.account_code}`
      };
    }
  }

  return null;
}

/**
 * Priority 3: Exact signature/employee unique ID match in reply text or subject.
 */
async function matchSignatureId(db, recipient, subject, replyText) {
  const participants = await db.all(`
    SELECT dp.*, d.status AS dept_status
    FROM department_participants dp
    JOIN departments d ON dp.department_id = d.id
    WHERE dp.employee_id IS NOT NULL AND dp.employee_id != ''
      AND dp.status = 'active' AND d.status = 'active'
  `);

  if (participants.length === 0) return null;

  const searchText = [
    subject || '',
    replyText || '',
    recipient.reply_snippet || '',
    recipient.latest_reply_body_text || ''
  ].join(' ');

  if (!searchText.trim()) return null;

  for (const p of participants) {
    if (searchText.includes(p.employee_id)) {
      return {
        assigned: true,
        departmentId: p.department_id,
        participantId: p.id,
        source: 'signature_id',
        confidence: 'high',
        evidence: `Matched employee ID: ${p.employee_id}`
      };
    }
  }

  return null;
}

/**
 * Priority 4: Direct email address match against active department participants.
 */
async function matchEmailAddress(db, recipient) {
  const recipientEmail = (recipient.email || '').toLowerCase().trim();
  if (!recipientEmail) return null;

  // Also check reply sender email
  const replyEmail = (recipient.latest_reply_sender_email || '').toLowerCase().trim();

  const emailsToCheck = [recipientEmail];
  if (replyEmail && replyEmail !== recipientEmail) {
    emailsToCheck.push(replyEmail);
  }

  for (const email of emailsToCheck) {
    const participant = await db.get(`
      SELECT dp.*, d.status AS dept_status
      FROM department_participants dp
      JOIN departments d ON dp.department_id = d.id
      WHERE LOWER(dp.email) = ? AND dp.status = 'active' AND d.status = 'active'
    `, [email]);

    if (participant) {
      return {
        assigned: true,
        departmentId: participant.department_id,
        participantId: participant.id,
        source: 'email_match',
        confidence: 'high',
        evidence: `Matched participant email: ${email}`
      };
    }
  }

  return null;
}

/**
 * Save assignment result to the database.
 */
async function saveAssignment(db, recipientId, result, timestamp) {
  // Remove previous assignments for this recipient
  await db.run('DELETE FROM recipient_assignments WHERE recipient_id = ?', [recipientId]);

  await db.run(
    `INSERT INTO recipient_assignments
     (recipient_id, department_id, participant_id, assignment_source, confidence, evidence, assigned_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      recipientId,
      result.departmentId || null,
      result.participantId || null,
      result.source,
      result.confidence,
      result.evidence || null,
      timestamp
    ]
  );

  // Also update denormalized columns on recipients for fast queries
  await db.run(
    'UPDATE recipients SET assigned_department_id = ?, assigned_participant_id = ? WHERE id = ?',
    [result.departmentId || null, result.participantId || null, recipientId]
  );
}

module.exports = { assignRecipient };
