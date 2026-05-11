<?php

namespace App;

use PDO;

class Database
{
    private static ?PDO $pdo = null;

    public static function getConnection(): PDO
    {
        if (self::$pdo === null) {
            $dbPath = __DIR__ . '/../data/project.db';
            self::$pdo = new PDO('sqlite:' . $dbPath);
            self::$pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
            self::$pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
        }
        return self::$pdo;
    }

    public static function init(): void
    {
        $pdo = self::getConnection();
        
        $pdo->exec("CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            name TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'member',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )");
        
        $pdo->exec("CREATE TABLE IF NOT EXISTS projects (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            description TEXT,
            owner_id INTEGER NOT NULL,
            status TEXT DEFAULT 'active',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (owner_id) REFERENCES users(id)
        )");
        
        $pdo->exec("CREATE TABLE IF NOT EXISTS project_members (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            role TEXT DEFAULT 'member',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )");
        
        $pdo->exec("CREATE TABLE IF NOT EXISTS milestones (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            description TEXT,
            due_date DATE,
            status TEXT DEFAULT 'pending',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
        )");
        
        $pdo->exec("CREATE TABLE IF NOT EXISTS tasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id INTEGER NOT NULL,
            milestone_id INTEGER,
            title TEXT NOT NULL,
            description TEXT,
            status TEXT DEFAULT 'todo',
            priority TEXT DEFAULT 'medium',
            assignee_id INTEGER,
            creator_id INTEGER NOT NULL,
            due_date DATE,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
            FOREIGN KEY (milestone_id) REFERENCES milestones(id) ON DELETE SET NULL,
            FOREIGN KEY (assignee_id) REFERENCES users(id) ON DELETE SET NULL,
            FOREIGN KEY (creator_id) REFERENCES users(id)
        )");
        
        $pdo->exec("CREATE TABLE IF NOT EXISTS comments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            task_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            content TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )");
        
        $pdo->exec("CREATE TABLE IF NOT EXISTS attachments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            task_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            filename TEXT NOT NULL,
            original_name TEXT NOT NULL,
            filepath TEXT NOT NULL,
            filesize INTEGER NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )");
        
        $pdo->exec("CREATE TABLE IF NOT EXISTS activity_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            action TEXT NOT NULL,
            target_type TEXT,
            target_id INTEGER,
            details TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )");
        
        $stmt = $pdo->query("SELECT COUNT(*) as count FROM users");
        $result = $stmt->fetch();
        if ($result['count'] == 0) {
            $hashedPassword = password_hash('owner123', PASSWORD_DEFAULT);
            $pdo->exec("INSERT INTO users (email, password, name, role) VALUES 
                ('owner@example.com', '$hashedPassword', 'Owner User', 'owner'),
                ('admin@example.com', '" . password_hash('admin123', PASSWORD_DEFAULT) . "', 'Admin User', 'admin'),
                ('member@example.com', '" . password_hash('member123', PASSWORD_DEFAULT) . "', 'Member User', 'member')");
            
            $pdo->exec("INSERT INTO projects (name, description, owner_id, status) VALUES 
                ('Project Alpha', 'Test project description', 1, 'active'),
                ('Project Beta', 'Another test project', 1, 'active')");
            
            $pdo->exec("INSERT INTO project_members (project_id, user_id, role) VALUES 
                (1, 2, 'admin'),
                (1, 3, 'member'),
                (2, 2, 'member')");
            
            $pdo->exec("INSERT INTO milestones (project_id, name, description, due_date, status) VALUES 
                (1, 'Phase 1', 'Initial phase', '2025-06-30', 'in_progress'),
                (1, 'Phase 2', 'Final phase', '2025-07-31', 'pending')");
            
            $pdo->exec("INSERT INTO tasks (project_id, milestone_id, title, description, status, priority, assignee_id, creator_id, due_date) VALUES 
                (1, 1, 'Setup environment', 'Configure development environment', 'completed', 'high', 2, 1, '2025-05-15'),
                (1, 1, 'Create database schema', 'Design and implement database', 'in_progress', 'high', 3, 1, '2025-05-20'),
                (1, 2, 'User authentication', 'Implement login/register', 'todo', 'medium', 2, 1, '2025-06-01'),
                (2, NULL, 'Task for Beta', 'Simple task', 'todo', 'low', 3, 1, '2025-06-15')");
            
            $pdo->exec("INSERT INTO comments (task_id, user_id, content) VALUES 
                (1, 2, 'Done! Environment is ready.'),
                (2, 3, 'Working on schema design.')");
        }
    }
}
