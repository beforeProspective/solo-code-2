import express from 'express';
import { getQuery, allQuery, runQuery } from '../config/filestore.js';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const { status, sortBy = 'votes', order = 'desc' } = req.query;
    
    let query = `
      SELECT f.*, u.username as author_name
      FROM feedbacks f
      LEFT JOIN users u ON f.author_id = u.id
    `;
    
    const params = [];
    
    if (status && status !== 'all') {
      query += ' WHERE f.status = ?';
      params.push(status);
    }
    
    const validSortFields = ['votes', 'created_at'];
    const sortField = validSortFields.includes(sortBy) ? sortBy : 'votes';
    const sortOrder = order === 'asc' ? 'ASC' : 'DESC';
    
    query += ` ORDER BY f.${sortField} ${sortOrder}`;
    
    const feedbacks = await allQuery(query, params);
    
    res.json(feedbacks);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const feedback = await getQuery(`
      SELECT f.*, u.username as author_name
      FROM feedbacks f
      LEFT JOIN users u ON f.author_id = u.id
      WHERE f.id = ?
    `, [req.params.id]);
    
    if (!feedback) {
      return res.status(404).json({ error: 'Feedback not found' });
    }
    
    res.json(feedback);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/', authenticateToken, async (req, res) => {
  try {
    const { title, description } = req.body;
    
    if (!title || !description) {
      return res.status(400).json({ error: 'Title and description are required' });
    }
    
    const result = await runQuery(`
      INSERT INTO feedbacks (title, description, author_id)
      VALUES (?, ?, ?)
    `, [title, description, req.user.id]);
    
    const feedback = await getQuery(`
      SELECT f.*, u.username as author_name
      FROM feedbacks f
      LEFT JOIN users u ON f.author_id = u.id
      WHERE f.id = ?
    `, [result.lastID]);
    
    res.status(201).json(feedback);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/:id/vote', authenticateToken, async (req, res) => {
  try {
    const feedbackId = req.params.id;
    const userId = req.user.id;
    
    const feedback = await getQuery('SELECT * FROM feedbacks WHERE id = ?', [feedbackId]);
    
    if (!feedback) {
      return res.status(404).json({ error: 'Feedback not found' });
    }
    
    const existingVote = await getQuery(
      'SELECT * FROM votes WHERE user_id = ? AND feedback_id = ?',
      [userId, feedbackId]
    );
    
    if (existingVote) {
      return res.status(400).json({ error: 'You have already voted for this feedback' });
    }
    
    await runQuery('INSERT INTO votes (user_id, feedback_id) VALUES (?, ?)', [userId, feedbackId]);
    await runQuery('UPDATE feedbacks SET votes = votes + 1 WHERE id = ?', [feedbackId]);
    
    const updatedFeedback = await getQuery(`
      SELECT f.*, u.username as author_name
      FROM feedbacks f
      LEFT JOIN users u ON f.author_id = u.id
      WHERE f.id = ?
    `, [feedbackId]);
    
    res.json(updatedFeedback);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/:id/vote', authenticateToken, async (req, res) => {
  try {
    const feedbackId = req.params.id;
    const userId = req.user.id;
    
    const existingVote = await getQuery(
      'SELECT * FROM votes WHERE user_id = ? AND feedback_id = ?',
      [userId, feedbackId]
    );
    
    if (!existingVote) {
      return res.status(400).json({ error: 'You have not voted for this feedback' });
    }
    
    await runQuery('DELETE FROM votes WHERE user_id = ? AND feedback_id = ?', [userId, feedbackId]);
    await runQuery('UPDATE feedbacks SET votes = votes - 1 WHERE id = ?', [feedbackId]);
    
    const updatedFeedback = await getQuery(`
      SELECT f.*, u.username as author_name
      FROM feedbacks f
      LEFT JOIN users u ON f.author_id = u.id
      WHERE f.id = ?
    `, [feedbackId]);
    
    res.json(updatedFeedback);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id/voted', authenticateToken, async (req, res) => {
  try {
    const feedbackId = req.params.id;
    const userId = req.user.id;
    
    const vote = await getQuery(
      'SELECT * FROM votes WHERE user_id = ? AND feedback_id = ?',
      [userId, feedbackId]
    );
    
    res.json({ voted: !!vote });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/:id/status', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { status } = req.body;
    const feedbackId = req.params.id;
    
    const validStatuses = ['pending', 'planned', 'in-progress', 'completed', 'rejected'];
    
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    
    const feedback = await getQuery('SELECT * FROM feedbacks WHERE id = ?', [feedbackId]);
    
    if (!feedback) {
      return res.status(404).json({ error: 'Feedback not found' });
    }
    
    await runQuery('UPDATE feedbacks SET status = ? WHERE id = ?', [status, feedbackId]);
    
    const updatedFeedback = await getQuery(`
      SELECT f.*, u.username as author_name
      FROM feedbacks f
      LEFT JOIN users u ON f.author_id = u.id
      WHERE f.id = ?
    `, [feedbackId]);
    
    res.json(updatedFeedback);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const feedbackId = req.params.id;
    
    const feedback = await getQuery('SELECT * FROM feedbacks WHERE id = ?', [feedbackId]);
    
    if (!feedback) {
      return res.status(404).json({ error: 'Feedback not found' });
    }
    
    await runQuery('DELETE FROM votes WHERE feedback_id = ?', [feedbackId]);
    await runQuery('DELETE FROM feedbacks WHERE id = ?', [feedbackId]);
    
    res.json({ message: 'Feedback deleted successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
