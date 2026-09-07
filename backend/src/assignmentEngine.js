const { getDb } = require('./db');

/**
 * Auto-Assignment Engine for MailPulse
 * Evaluates rules in strict priority order:
 *  1. Account/Customer-Code Mapping (HIGH confidence)
 *  2. Direct Internal-Recipient Match in To/Cc (HIGH confidence)
 *  3. Work Email Signature Match (HIGH confidence)
 *  4. Fallback (Unassigned Queue, NONE confidence)
 *
 * @param {Object} item - Email/recipient details { email, name, subject, body, account_code, to_list, cc_list }
 * @returns {Promise<Object>} Assignment decision { assignee_id, assigned_by, assignment_rule, assignment_reason, assignment_confidence, matching_evidence }
 */
async function evaluateAutoAssignment(item) {
  const db = await getDb();
  const now = new Date().toISOString();

  // Fetch active team members & active account mappings
  const activeMembers = await db.all(
    `SELECT * FROM team_members WHERE active_status = 1`
  );
  const activeMappings = await db.all(
    `SELECT m.*, tm.name as member_name, tm.email as member_email, tm.active_status as member_active
     FROM account_code_mappings m
     JOIN team_members tm ON m.team_member_id = tm.id
     WHERE m.is_active = 1 AND tm.active_status = 1`
  );

  const subject = item.subject || '';
  const body = item.body || '';
  const recipientEmail = (item.email || '').toLowerCase().trim();
  const recipientName = (item.name || '').trim();
  const providedCode = (item.account_code || '').trim().toUpperCase();

  // -------------------------------------------------------------
  // RULE 1: ACCOUNT / CUSTOMER-CODE MAPPING (Priority 1)
  // -------------------------------------------------------------
  let matchedMapping = null;
  let matchedCode = null;

  // 1a. Direct provided account_code property
  if (providedCode) {
    matchedMapping = activeMappings.find(m => m.account_code.toUpperCase() === providedCode);
    if (matchedMapping) matchedCode = providedCode;
  }

  // 1b. Check subject/body for active account codes (e.g. CUST-1001, ACCT-402, BILL-900)
  if (!matchedMapping) {
    for (const mapping of activeMappings) {
      const code = mapping.account_code.toUpperCase();
      // Regex check for [CODE], CODE:, or boundary matched CODE
      const codeRegex = new RegExp(`\\b${code}\\b`, 'i');
      if (codeRegex.test(subject) || codeRegex.test(body) || codeRegex.test(recipientName)) {
        matchedMapping = mapping;
        matchedCode = code;
        break;
      }
    }
  }

  if (matchedMapping) {
    return {
      assignee_id: matchedMapping.team_member_id,
      assigned_at: now,
      assigned_by: 'auto-rule',
      assignment_rule: 'account_code',
      assignment_reason: `Matched Customer Code '${matchedCode}' mapped to ${matchedMapping.member_name} (${matchedMapping.team_name || 'Team'})`,
      assignment_confidence: 'HIGH',
      matching_evidence: JSON.stringify({
        rule: 'account_code',
        code: matchedCode,
        assignee_name: matchedMapping.member_name,
        assignee_email: matchedMapping.member_email
      })
    };
  }

  // -------------------------------------------------------------
  // RULE 2: DIRECT INTERNAL-RECIPIENT MATCH (Priority 2)
  // -------------------------------------------------------------
  // Check if To/Cc list or direct email matches known active work email
  const toCcList = [];
  if (Array.isArray(item.to_list)) toCcList.push(...item.to_list);
  if (Array.isArray(item.cc_list)) toCcList.push(...item.cc_list);
  if (item.direct_to) toCcList.push(item.direct_to);
  // Also check if recipient email itself is an internal work email
  if (recipientEmail) toCcList.push(recipientEmail);

  let directMemberMatch = null;
  for (const rawEmail of toCcList) {
    const cleanEmail = (rawEmail || '').toLowerCase().trim();
    if (!cleanEmail) continue;
    const found = activeMembers.find(m => m.email.toLowerCase() === cleanEmail);
    if (found) {
      directMemberMatch = found;
      break;
    }
  }

  if (directMemberMatch) {
    return {
      assignee_id: directMemberMatch.id,
      assigned_at: now,
      assigned_by: 'auto-rule',
      assignment_rule: 'direct_recipient',
      assignment_reason: `Direct To/Cc match to internal work email ${directMemberMatch.email}`,
      assignment_confidence: 'HIGH',
      matching_evidence: JSON.stringify({
        rule: 'direct_recipient',
        matched_email: directMemberMatch.email,
        assignee_name: directMemberMatch.name
      })
    };
  }

  // -------------------------------------------------------------
  // RULE 3: SIGNATURE MATCHING (Priority 3)
  // -------------------------------------------------------------
  // Extract all email addresses from signature / body
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const foundEmails = (body.match(emailRegex) || [])
    .map(e => e.toLowerCase().trim());

  const matchedSigMembers = [];
  for (const foundEmail of foundEmails) {
    const member = activeMembers.find(m => m.email.toLowerCase() === foundEmail);
    if (member && !matchedSigMembers.some(m => m.id === member.id)) {
      matchedSigMembers.push(member);
    }
  }

  // Auto-assign ONLY if exactly 1 active team member work email is matched (unambiguous)
  if (matchedSigMembers.length === 1) {
    const sigMember = matchedSigMembers[0];
    return {
      assignee_id: sigMember.id,
      assigned_at: now,
      assigned_by: 'auto-rule',
      assignment_rule: 'signature_match',
      assignment_reason: `Exact work email signature match to ${sigMember.email}`,
      assignment_confidence: 'HIGH',
      matching_evidence: JSON.stringify({
        rule: 'signature_match',
        matched_email: sigMember.email,
        assignee_name: sigMember.name
      })
    };
  }

  // If multiple conflicting signature matches found -> log ambiguity and fall back to Unassigned
  let ambiguousReason = null;
  if (matchedSigMembers.length > 1) {
    ambiguousReason = `Ambiguous signature match: multiple team member emails found (${matchedSigMembers.map(m => m.email).join(', ')})`;
  }

  // -------------------------------------------------------------
  // FALLBACK: UNASSIGNED QUEUE
  // -------------------------------------------------------------
  return {
    assignee_id: null,
    assigned_at: now,
    assigned_by: 'auto-rule',
    assignment_rule: 'default_queue',
    assignment_reason: ambiguousReason || 'No rule match; placed in Unassigned queue',
    assignment_confidence: 'NONE',
    matching_evidence: JSON.stringify({
      rule: 'default_queue',
      ambiguity: !!ambiguousReason
    })
  };
}

/**
 * Persist an assignment change to the database and log to assignment_history audit trail
 */
async function applyAssignment(recipientId, decision, actor = 'auto-rule', note = '') {
  const db = await getDb();
  const now = new Date().toISOString();

  // Get current recipient state for audit history
  const current = await db.get(`SELECT assignee_id FROM recipients WHERE id = ?`, [recipientId]);
  const priorAssigneeId = current ? current.assignee_id : null;

  // Update recipients table
  await db.run(
    `UPDATE recipients 
     SET assignee_id = ?,
         assigned_at = ?,
         assigned_by = ?,
         assignment_rule = ?,
         assignment_reason = ?,
         assignment_confidence = ?,
         matching_evidence = ?
     WHERE id = ?`,
    [
      decision.assignee_id || null,
      decision.assigned_at || now,
      decision.assigned_by || actor,
      decision.assignment_rule || 'manual',
      decision.assignment_reason || null,
      decision.assignment_confidence || 'HIGH',
      decision.matching_evidence || null,
      recipientId
    ]
  );

  // Insert entry into assignment_history audit trail
  await db.run(
    `INSERT INTO assignment_history (
       recipient_id, actor, prior_assignee_id, new_assignee_id,
       assigned_by, assignment_rule, assignment_reason, assignment_confidence, note, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      recipientId,
      actor,
      priorAssigneeId,
      decision.assignee_id || null,
      decision.assigned_by || actor,
      decision.assignment_rule || null,
      decision.assignment_reason || null,
      decision.assignment_confidence || 'HIGH',
      note || null,
      now
    ]
  );
}

module.exports = {
  evaluateAutoAssignment,
  applyAssignment
};
