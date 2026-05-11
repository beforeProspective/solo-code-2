# Project Management Application

A full-stack project management application with React frontend and PHP Slim Framework backend.

## Features

- User Authentication (JWT) with roles: Owner, Admin, Member
- Projects CRUD
- Milestones management
- Kanban-style Task Board (To Do / In Progress / Completed)
- Task assignment, priority, due dates
- Comments system on tasks
- File attachments upload
- Dashboard statistics
- Activity Log
- Full-text search
- Role-based access control

## Demo Accounts

| Role | Email | Password |
|------|-------|----------|
| Owner | owner@example.com | owner123 |
| Admin | admin@example.com | admin123 |
| Member | member@example.com | member123 |

## Quick Start

### Backend Setup

```bash
cd backend
composer install
php -S localhost:8080 -t public
```

### Frontend Setup

```bash
cd frontend
npm install
npm start
```

### Access the App

- Frontend: http://localhost:3000
- Backend API: http://localhost:8080/api

## API Endpoints

### Auth
- POST /api/auth/login
- POST /api/auth/register
- GET /api/auth/me (Authenticated)

### Dashboard
- GET /api/dashboard/stats
- GET /api/dashboard/activity
- GET /api/users

### Projects
- GET /api/projects
- POST /api/projects
- GET /api/projects/{id}
- PUT /api/projects/{id}
- DELETE /api/projects/{id}
- GET /api/projects/{id}/members
- POST /api/projects/{id}/members
- DELETE /api/projects/{id}/members/{memberId}

### Milestones
- GET /api/projects/{projectId}/milestones
- POST /api/projects/{projectId}/milestones
- PUT /api/milestones/{id}
- DELETE /api/milestones/{id}

### Tasks
- GET /api/projects/{projectId}/tasks
- POST /api/projects/{projectId}/tasks
- GET /api/tasks/{id}
- PUT /api/tasks/{id}
- PATCH /api/tasks/{id}/status
- DELETE /api/tasks/{id}

### Comments
- GET /api/tasks/{taskId}/comments
- POST /api/tasks/{taskId}/comments
- PUT /api/comments/{id}
- DELETE /api/comments/{id}

### Attachments
- GET /api/tasks/{taskId}/attachments
- POST /api/tasks/{taskId}/attachments (multipart/form-data)
- GET /api/attachments/{id}/download
- DELETE /api/attachments/{id}

### Search
- GET /api/search?q=query

## Tech Stack

### Frontend
- React 18
- React Router 6
- Bootstrap 5

### Backend
- PHP 8.0+
- Slim Framework 4
- SQLite Database
- JWT Authentication (firebase/php-jwt)
- CORS Support

## Project Structure

```
backend/
├── public/
│   └── index.php              # Front controller
├── src/
│   ├── Controllers/           # All API controllers
│   ├── Helpers/
│   │   └── AuthHelper.php     # JWT helpers
│   ├── Middleware/
│   │   └── CorsMiddleware.php # CORS handling
│   └── Database.php           # SQLite connection and schema
├── data/
│   └── project.db             # SQLite database (auto-created)
├── uploads/                    # File attachments
├── .env                        # Environment config
└── composer.json

frontend/
├── public/
│   └── index.html
├── src/
│   ├── components/
│   │   ├── Navbar.js          # Top navigation with search
│   │   └── ProtectedRoute.js  # Auth guard
│   ├── contexts/
│   │   └── AuthContext.js     # React Context for auth
│   ├── pages/
│   │   ├── Login.js
│   │   ├── Register.js
│   │   ├── Dashboard.js
│   │   ├── Projects.js
│   │   ├── ProjectDetail.js   # Kanban board, milestones, members
│   │   └── Activity.js
│   ├── services/
│   │   └── api.js             # All API calls
│   ├── App.js
│   └── index.js
├── package.json
└── README.md
```
