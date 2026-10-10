const express = require('express');
const { getDb } = require('./db');
const router = express.Router();

// -------------------------------------------------------
// LIST TEMPLATES (with optional search, category, status)
// -------------------------------------------------------
router.get('/api/templates', async (req, res) => {
  try {
    const { search, category, status } = req.query;
    const db = await getDb();

    let query = 'SELECT * FROM email_templates WHERE 1=1';
    const params = [];

    if (status && status !== 'all') {
      query += ' AND status = ?';
      params.push(status);
    } else {
      // Exclude archived by default
      query += " AND status != 'archived'";
    }

    if (category && category !== 'all') {
      query += ' AND category = ?';
      params.push(category);
    }

    if (search && search.trim()) {
      const term = `%${search.trim()}%`;
      query += ' AND (name LIKE ? OR subject LIKE ? OR category LIKE ?)';
      params.push(term, term, term);
    }

    query += ' ORDER BY updated_at DESC';

    const templates = await db.all(query, params);

    // Get distinct categories for filter UI
    const categories = await db.all(
      "SELECT DISTINCT category FROM email_templates WHERE category IS NOT NULL AND category != '' ORDER BY category ASC"
    );

    res.json({ templates, categories: categories.map(c => c.category) });
  } catch (err) {
    console.error('Error listing templates:', err);
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------
// GET SINGLE TEMPLATE
// -------------------------------------------------------
router.get('/api/templates/:id', async (req, res) => {
  try {
    const db = await getDb();
    const template = await db.get('SELECT * FROM email_templates WHERE id = ?', [parseInt(req.params.id, 10)]);
    if (!template) return res.status(404).json({ error: 'Template not found' });
    res.json(template);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------
// CREATE TEMPLATE
// -------------------------------------------------------
router.post('/api/templates', async (req, res) => {
  try {
    const { name, subject, body, category, status } = req.body;

    if (!name || !name.trim()) return res.status(400).json({ error: 'Template name is required.' });
    if (name.trim().length > 150) return res.status(400).json({ error: 'Template name must be 150 characters or less.' });
    if (!subject || !subject.trim()) return res.status(400).json({ error: 'Subject is required.' });
    if (!body || !body.trim()) return res.status(400).json({ error: 'Body is required.' });

    const validStatuses = ['draft', 'approved'];
    const templateStatus = validStatuses.includes(status) ? status : 'draft';
    const now = new Date().toISOString();

    const db = await getDb();

    // Check name uniqueness (case-insensitive)
    const existing = await db.get('SELECT id FROM email_templates WHERE LOWER(name) = LOWER(?) AND status != ?', [name.trim(), 'archived']);
    if (existing) return res.status(409).json({ error: 'A template with this name already exists.' });

    const result = await db.run(
      `INSERT INTO email_templates (name, subject, body, category, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [name.trim(), subject.trim(), body.trim(), (category || '').trim() || null, templateStatus, now, now]
    );

    const template = await db.get('SELECT * FROM email_templates WHERE id = ?', [result.lastID]);
    res.status(201).json(template);
  } catch (err) {
    console.error('Error creating template:', err);
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------
// UPDATE TEMPLATE
// -------------------------------------------------------
router.put('/api/templates/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { name, subject, body, category, status } = req.body;
    const db = await getDb();

    const existing = await db.get('SELECT * FROM email_templates WHERE id = ?', [id]);
    if (!existing) return res.status(404).json({ error: 'Template not found' });

    if (name !== undefined) {
      if (!name.trim()) return res.status(400).json({ error: 'Template name cannot be empty.' });
      if (name.trim().length > 150) return res.status(400).json({ error: 'Template name must be 150 characters or less.' });
      // Uniqueness check excluding self
      const dup = await db.get('SELECT id FROM email_templates WHERE LOWER(name) = LOWER(?) AND id != ? AND status != ?', [name.trim(), id, 'archived']);
      if (dup) return res.status(409).json({ error: 'A template with this name already exists.' });
    }

    if (subject !== undefined && !subject.trim()) return res.status(400).json({ error: 'Subject cannot be empty.' });
    if (body !== undefined && !body.trim()) return res.status(400).json({ error: 'Body cannot be empty.' });

    const validStatuses = ['draft', 'approved', 'archived'];
    const now = new Date().toISOString();

    await db.run(
      `UPDATE email_templates
       SET name = ?, subject = ?, body = ?, category = ?, status = ?, updated_at = ?
       WHERE id = ?`,
      [
        (name !== undefined ? name.trim() : existing.name),
        (subject !== undefined ? subject.trim() : existing.subject),
        (body !== undefined ? body.trim() : existing.body),
        (category !== undefined ? ((category || '').trim() || null) : existing.category),
        (status !== undefined && validStatuses.includes(status) ? status : existing.status),
        now,
        id
      ]
    );

    const updated = await db.get('SELECT * FROM email_templates WHERE id = ?', [id]);
    res.json(updated);
  } catch (err) {
    console.error('Error updating template:', err);
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------
// DUPLICATE TEMPLATE
// -------------------------------------------------------
router.post('/api/templates/:id/duplicate', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const db = await getDb();

    const source = await db.get('SELECT * FROM email_templates WHERE id = ?', [id]);
    if (!source) return res.status(404).json({ error: 'Template not found' });

    const now = new Date().toISOString();
    // Generate unique name
    let copyName = `${source.name} (Copy)`;
    let counter = 2;
    while (await db.get('SELECT id FROM email_templates WHERE LOWER(name) = LOWER(?)', [copyName])) {
      copyName = `${source.name} (Copy ${counter})`;
      counter++;
    }

    const result = await db.run(
      `INSERT INTO email_templates (name, subject, body, category, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'draft', ?, ?)`,
      [copyName, source.subject, source.body, source.category, now, now]
    );

    const template = await db.get('SELECT * FROM email_templates WHERE id = ?', [result.lastID]);
    res.status(201).json(template);
  } catch (err) {
    console.error('Error duplicating template:', err);
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------
// ARCHIVE TEMPLATE
// -------------------------------------------------------
router.post('/api/templates/:id/archive', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const db = await getDb();
    const template = await db.get('SELECT * FROM email_templates WHERE id = ?', [id]);
    if (!template) return res.status(404).json({ error: 'Template not found' });

    const now = new Date().toISOString();
    await db.run('UPDATE email_templates SET status = ?, updated_at = ? WHERE id = ?', ['archived', now, id]);
    res.json({ success: true, message: 'Template archived.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------
// RESTORE TEMPLATE
// -------------------------------------------------------
router.post('/api/templates/:id/restore', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const db = await getDb();
    const template = await db.get('SELECT * FROM email_templates WHERE id = ?', [id]);
    if (!template) return res.status(404).json({ error: 'Template not found' });

    const now = new Date().toISOString();
    await db.run('UPDATE email_templates SET status = ?, updated_at = ? WHERE id = ?', ['draft', now, id]);
    res.json({ success: true, message: 'Template restored to draft.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------
// DELETE TEMPLATE (hard delete, only if not used in campaigns)
// -------------------------------------------------------
router.delete('/api/templates/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const db = await getDb();

    const template = await db.get('SELECT * FROM email_templates WHERE id = ?', [id]);
    if (!template) return res.status(404).json({ error: 'Template not found' });

    await db.run('DELETE FROM email_templates WHERE id = ?', [id]);
    res.json({ success: true, message: 'Template deleted permanently.' });
  } catch (err) {
    console.error('Error deleting template:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
