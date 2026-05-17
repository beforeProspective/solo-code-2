import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dataPath = path.join(__dirname, '../../data.json');

let data = {
  users: [],
  feedbacks: [],
  votes: []
};

function loadData() {
  if (fs.existsSync(dataPath)) {
    try {
      const raw = fs.readFileSync(dataPath, 'utf8');
      data = JSON.parse(raw);
    } catch (e) {
      console.error('Failed to load data:', e);
    }
  }
}

function saveData() {
  fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
}

export function initDatabase() {
  loadData();
  
  if (data.users.length === 0) {
    const hashedAdminPassword = bcrypt.hashSync('admin123', 10);
    const hashedUserPassword = bcrypt.hashSync('user123', 10);
    
    data.users.push(
      { id: 1, username: 'admin', password: hashedAdminPassword, role: 'admin', created_at: new Date().toISOString() },
      { id: 2, username: 'user', password: hashedUserPassword, role: 'user', created_at: new Date().toISOString() }
    );
    
    data.feedbacks.push(
      {
        id: 1,
        title: '添加深色模式支持',
        description: '希望系统能够支持深色模式，在夜间使用时更加护眼。建议可以跟随系统设置自动切换。',
        author_id: 2,
        status: 'planned',
        votes: 15,
        created_at: '2026-05-15T10:30:00Z'
      },
      {
        id: 2,
        title: '支持导出反馈数据为Excel',
        description: '作为管理员，我希望能够将所有反馈数据导出为Excel格式，方便进行离线分析和汇报。',
        author_id: 1,
        status: 'in-progress',
        votes: 8,
        created_at: '2026-05-16T09:00:00Z'
      },
      {
        id: 3,
        title: '增加评论功能',
        description: '希望能够对每个反馈进行评论讨论，方便用户之间交流想法和补充细节。',
        author_id: 2,
        status: 'pending',
        votes: 23,
        created_at: '2026-05-17T08:00:00Z'
      },
      {
        id: 4,
        title: '支持按标签分类',
        description: '建议为反馈添加标签功能，如"UI改进"、"性能优化"、"新功能"等，便于分类管理。',
        author_id: 2,
        status: 'completed',
        votes: 5,
        created_at: '2026-05-10T14:00:00Z'
      },
      {
        id: 5,
        title: '集成第三方登录',
        description: '希望支持微信、GitHub等第三方账号登录，减少用户注册成本。',
        author_id: 1,
        status: 'rejected',
        votes: 3,
        created_at: '2026-05-12T11:00:00Z'
      }
    );
    
    saveData();
  }
}

export function runQuery(sql, params = []) {
  return new Promise((resolve) => {
    const sqlNormalized = sql.replace(/\s+/g, ' ').trim();
    if (sqlNormalized.startsWith('INSERT INTO users')) {
      const [username, password, role] = params;
      const newId = data.users.length > 0 ? Math.max(...data.users.map(u => u.id)) + 1 : 1;
      const newUser = {
        id: newId,
        username,
        password,
        role,
        created_at: new Date().toISOString()
      };
      data.users.push(newUser);
      saveData();
      resolve({ lastID: newId, changes: 1 });
    } else if (sqlNormalized.startsWith('INSERT INTO feedbacks')) {
      const [title, description, author_id] = params;
      const newId = data.feedbacks.length > 0 ? Math.max(...data.feedbacks.map(f => f.id)) + 1 : 1;
      const newFeedback = {
        id: newId,
        title,
        description,
        author_id,
        status: 'pending',
        votes: 0,
        created_at: new Date().toISOString()
      };
      data.feedbacks.push(newFeedback);
      saveData();
      resolve({ lastID: newId, changes: 1 });
    } else if (sqlNormalized.startsWith('INSERT INTO votes')) {
      const [user_id, feedback_id] = params;
      const newId = data.votes.length > 0 ? Math.max(...data.votes.map(v => v.id)) + 1 : 1;
      data.votes.push({
        id: newId,
        user_id,
        feedback_id,
        created_at: new Date().toISOString()
      });
      const feedback = data.feedbacks.find(f => f.id === feedback_id);
      if (feedback) feedback.votes++;
      saveData();
      resolve({ lastID: newId, changes: 1 });
    } else if (sqlNormalized.startsWith('UPDATE feedbacks SET votes = votes + 1')) {
      const [feedback_id] = params;
      const feedback = data.feedbacks.find(f => f.id === feedback_id);
      if (feedback) feedback.votes++;
      saveData();
      resolve({ changes: 1 });
    } else if (sqlNormalized.startsWith('UPDATE feedbacks SET votes = votes - 1')) {
      const [feedback_id] = params;
      const feedback = data.feedbacks.find(f => f.id === feedback_id);
      if (feedback && feedback.votes > 0) feedback.votes--;
      saveData();
      resolve({ changes: 1 });
    } else if (sqlNormalized.startsWith('UPDATE feedbacks SET status')) {
      const [status, feedback_id] = params;
      const feedback = data.feedbacks.find(f => f.id === feedback_id);
      if (feedback) feedback.status = status;
      saveData();
      resolve({ changes: 1 });
    } else if (sqlNormalized.startsWith('DELETE FROM votes')) {
      const [user_id, feedback_id] = params;
      const index = data.votes.findIndex(v => v.user_id === user_id && v.feedback_id === feedback_id);
      if (index !== -1) {
        data.votes.splice(index, 1);
        saveData();
        resolve({ changes: 1 });
      } else {
        resolve({ changes: 0 });
      }
    } else if (sqlNormalized.startsWith('DELETE FROM feedbacks WHERE id')) {
      const [feedback_id] = params;
      const index = data.feedbacks.findIndex(f => f.id === feedback_id);
      if (index !== -1) {
        data.feedbacks.splice(index, 1);
        data.votes = data.votes.filter(v => v.feedback_id !== feedback_id);
        saveData();
        resolve({ changes: 1 });
      } else {
        resolve({ changes: 0 });
      }
    } else {
      resolve({ changes: 0 });
    }
  });
}

export function getQuery(sql, params = []) {
  return new Promise((resolve) => {
    const sqlNormalized = sql.replace(/\s+/g, ' ').trim();
    if (sqlNormalized.startsWith('SELECT * FROM users WHERE username')) {
      const [username] = params;
      resolve(data.users.find(u => u.username === username) || undefined);
    } else if (sqlNormalized.startsWith('SELECT COUNT(*) as count FROM users')) {
      resolve({ count: data.users.length });
    } else if (sqlNormalized.startsWith('SELECT * FROM feedbacks WHERE id')) {
      const [id] = params;
      const feedback = data.feedbacks.find(f => f.id === Number(id));
      if (feedback) {
        const author = data.users.find(u => u.id === feedback.author_id);
        resolve({ ...feedback, author_name: author ? author.username : '匿名' });
      } else {
        resolve(undefined);
      }
    } else if (sqlNormalized.startsWith('SELECT * FROM votes WHERE user_id')) {
      const [user_id, feedback_id] = params;
      resolve(data.votes.find(v => v.user_id === user_id && v.feedback_id === feedback_id) || undefined);
    } else if (sqlNormalized.startsWith('SELECT f.*, u.username as author_name FROM feedbacks f LEFT JOIN users u ON f.author_id = u.id WHERE f.id')) {
      const [id] = params;
      const feedback = data.feedbacks.find(f => f.id === Number(id));
      if (feedback) {
        const author = data.users.find(u => u.id === feedback.author_id);
        resolve({ ...feedback, author_name: author ? author.username : '匿名' });
      } else {
        resolve(undefined);
      }
    } else {
      resolve(undefined);
    }
  });
}

export function allQuery(sql, params = []) {
  return new Promise((resolve) => {
    const sqlNormalized = sql.replace(/\s+/g, ' ').trim();
    if (sqlNormalized.startsWith('SELECT f.*, u.username as author_name FROM feedbacks f')) {
      let results = data.feedbacks.map(f => {
        const author = data.users.find(u => u.id === f.author_id);
        return { ...f, author_name: author ? author.username : '匿名' };
      });
      
      if (params.length > 0 && params[0] !== 'all') {
        results = results.filter(f => f.status === params[0]);
      }
      
      if (sqlNormalized.includes('ORDER BY f.votes DESC')) {
        results.sort((a, b) => b.votes - a.votes);
      } else if (sqlNormalized.includes('ORDER BY f.created_at DESC')) {
        results.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      }
      
      resolve(results);
    } else {
      resolve([]);
    }
  });
}

export default {
  initDatabase,
  runQuery,
  getQuery,
  allQuery
};
