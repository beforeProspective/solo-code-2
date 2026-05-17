import express from 'express';
import cors from 'cors';
import { initDatabase } from './src/config/filestore.js';
import authRoutes from './src/routes/auth.js';
import feedbackRoutes from './src/routes/feedback.js';

const app = express();
const PORT = 8000;

app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/feedbacks', feedbackRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Feedback API is running' });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

async function startServer() {
  try {
    await initDatabase();
    console.log('Database initialized successfully');
    
    app.listen(PORT, () => {
      console.log(`Server is running on http://localhost:${PORT}`);
      console.log('Default accounts:');
      console.log('  Admin: admin / admin123');
      console.log('  User: user / user123');
    });
  } catch (err) {
    console.error('Failed to initialize database:', err);
    process.exit(1);
  }
}

startServer();
