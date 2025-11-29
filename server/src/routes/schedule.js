import express from 'express';
import { scheduleGenerator } from '../scheduler.js';
const router = express.Router();

router.post('/generate', async (req, res) => {
  try {
    const db = req.app.locals.db;
    const { startISO, endISO, shiftOverrides = [], esAssignments = [], existingAssignments = [] } = req.body;
    
    // Debug: Log ES assignments received
    console.log('ES Assignments received:', JSON.stringify(esAssignments, null, 2));
    console.log('Existing assignments received:', existingAssignments.length);
    
    const people = (await db.all('SELECT * FROM people')).map(r => ({...r, sameGenderPref: Boolean(r.sameGenderPref), exemptions: JSON.parse(r.exemptions || '[]') }));
    const posts = (await db.all('SELECT * FROM posts')).map(r => ({...r, optional: Boolean(r.optional)}));
    const result = scheduleGenerator(people, posts, startISO, endISO, shiftOverrides, esAssignments, existingAssignments);

    if (result.error) {
      return res.json({ assignments: [], error: result.error });
    }
    // If any assignment is missing a person or post, treat as error
    if (result.assignments.some(a => a.personId == null || a.postId == null)) {
      return res.json({ assignments: [], error: 'not enough manpower' });
    }
    // persist
    await db.run('DELETE FROM assignments');
    for (const a of result.assignments) {
      await db.run(
        'INSERT INTO assignments (personId, postId, day, shiftLabel, startISO, endISO) VALUES (?,?,?,?,?,?)',
        [a.personId, a.postId, a.day, a.shiftLabel, a.start, a.end]
      );
    }
    res.json({ assignments: result.assignments });
  } catch (err) {
    console.error(err);
    res.json({ assignments: [], error: 'not enough manpower' });
  }
});

// Save all assignments (replace entire schedule)
router.post('/save-all', async (req, res) => {
  try {
    const db = req.app.locals.db;
    const { assignments } = req.body;
    
    // Clear existing assignments
    await db.run('DELETE FROM assignments');
    
    // Insert all new assignments
    for (const a of assignments) {
      await db.run(
        'INSERT INTO assignments (personId, postId, day, shiftLabel, startISO, endISO) VALUES (?,?,?,?,?,?)',
        [a.personId, a.postId, a.day, a.shiftLabel, a.start || '', a.end || '']
      );
    }
    
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.json({ ok: false, error: err.message });
  }
});

// Update assignments for a specific cell (post + day + shiftLabel)
router.post('/update-cell', async (req, res) => {
  try {
    const db = req.app.locals.db;
    const { postId, day, shiftLabel, personIds } = req.body;
    
    // Delete existing assignments for this cell
    await db.run(
      'DELETE FROM assignments WHERE postId = ? AND day = ? AND shiftLabel = ?',
      [postId, day, shiftLabel]
    );
    
    // Insert new assignments
    for (const personId of personIds) {
      await db.run(
        'INSERT INTO assignments (personId, postId, day, shiftLabel, startISO, endISO) VALUES (?,?,?,?,?,?)',
        [personId, postId, day, shiftLabel, '', '']
      );
    }
    
    // Return all assignments
    const rows = await db.all('SELECT * FROM assignments');
    res.json({ ok: true, assignments: rows });
  } catch (err) {
    console.error(err);
    res.json({ ok: false, error: err.message });
  }
});

router.get('/last', async (req, res) => {
  const db = req.app.locals.db;
  const rows = await db.all('SELECT * FROM assignments');
  res.json(rows);
});

// Clear all assignments
router.delete('/clear', async (req, res) => {
  try {
    const db = req.app.locals.db;
    await db.run('DELETE FROM assignments');
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.json({ ok: false, error: err.message });
  }
});

export default router;
