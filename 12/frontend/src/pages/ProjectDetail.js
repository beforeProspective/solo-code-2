import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { projectAPI, milestoneAPI, taskAPI, commentAPI, attachmentAPI, dashboardAPI } from '../services/api';
import { useAuth } from '../contexts/AuthContext';

const ProjectDetail = () => {
  const { id } = useParams();
  const { user } = useAuth();
  const [project, setProject] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [milestones, setMilestones] = useState([]);
  const [members, setMembers] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('board');
  const [selectedTask, setSelectedTask] = useState(null);
  const [taskComments, setTaskComments] = useState([]);
  const [taskAttachments, setTaskAttachments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [showMilestoneModal, setShowMilestoneModal] = useState(false);
  const [showMemberModal, setShowMemberModal] = useState(false);
  const [taskForm, setTaskForm] = useState({ title: '', description: '', status: 'todo', priority: 'medium', milestone_id: '', assignee_id: '', due_date: '' });
  const [milestoneForm, setMilestoneForm] = useState({ name: '', description: '', due_date: '' });
  const [memberForm, setMemberForm] = useState({ email: '', role: 'member' });

  const loadData = async () => {
    setLoading(true);
    try {
      const [proj, taskList, milestoneList, memberList, users] = await Promise.all([
        projectAPI.get(id),
        taskAPI.getAll(id),
        milestoneAPI.getAll(id),
        projectAPI.getMembers(id),
        dashboardAPI.getUsers()
      ]);
      setProject(proj);
      setTasks(taskList);
      setMilestones(milestoneList);
      setMembers(memberList);
      setAllUsers(users);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [id]);

  const tasksByStatus = (status) => tasks.filter(t => t.status === status);

  const handleTaskSubmit = async (e) => {
    e.preventDefault();
    try {
      await taskAPI.create(id, taskForm);
      setShowTaskModal(false);
      setTaskForm({ title: '', description: '', status: 'todo', priority: 'medium', milestone_id: '', assignee_id: '', due_date: '' });
      loadData();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleMilestoneSubmit = async (e) => {
    e.preventDefault();
    try {
      await milestoneAPI.create(id, milestoneForm);
      setShowMilestoneModal(false);
      setMilestoneForm({ name: '', description: '', due_date: '' });
      loadData();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleMemberSubmit = async (e) => {
    e.preventDefault();
    try {
      await projectAPI.addMember(id, memberForm.email, memberForm.role);
      setShowMemberModal(false);
      setMemberForm({ email: '', role: 'member' });
      loadData();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleStatusChange = async (taskId, newStatus) => {
    await taskAPI.updateStatus(taskId, newStatus);
    loadData();
  };

  const handleTaskClick = async (task) => {
    setSelectedTask(task);
    const [comments, attachments] = await Promise.all([
      commentAPI.getAll(task.id),
      attachmentAPI.getAll(task.id)
    ]);
    setTaskComments(comments);
    setTaskAttachments(attachments);
  };

  const handleAddComment = async (e) => {
    e.preventDefault();
    if (!newComment.trim()) return;
    await commentAPI.create(selectedTask.id, newComment);
    setNewComment('');
    const comments = await commentAPI.getAll(selectedTask.id);
    setTaskComments(comments);
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    await attachmentAPI.create(selectedTask.id, file);
    const attachments = await attachmentAPI.getAll(selectedTask.id);
    setTaskAttachments(attachments);
  };

  const handleRemoveMember = async (memberId) => {
    if (window.confirm('Remove this member?')) {
      await projectAPI.removeMember(id, memberId);
      loadData();
    }
  };

  const handleDeleteMilestone = async (milestoneId, name) => {
    if (window.confirm(`Delete milestone "${name}"?`)) {
      await milestoneAPI.delete(milestoneId);
      loadData();
    }
  };

  const handleDeleteTask = async (taskId, title) => {
    if (window.confirm(`Delete task "${title}"?`)) {
      await taskAPI.delete(taskId);
      loadData();
      if (selectedTask?.id === taskId) setSelectedTask(null);
    }
  };

  if (loading) return <div className="text-center mt-5"><div className="spinner-border"></div></div>;
  if (!project) return <div className="text-center mt-5">Project not found</div>;

  const columns = [
    { status: 'todo', title: 'To Do', color: 'secondary' },
    { status: 'in_progress', title: 'In Progress', color: 'warning' },
    { status: 'completed', title: 'Completed', color: 'success' }
  ];

  const priorityBadge = (priority) => {
    const colors = { high: 'bg-danger', medium: 'bg-warning', low: 'bg-info' };
    return <span className={`badge ${colors[priority] || 'bg-secondary'}`}>{priority}</span>;
  };

  return (
    <div className="container">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
          <Link to="/projects" className="text-decoration-none">← Back to Projects</Link>
          <h2>{project.name}</h2>
          <p className="text-muted">{project.description}</p>
        </div>
        <div className="d-flex gap-2">
          <button className="btn btn-primary" onClick={() => setShowTaskModal(true)}>+ Add Task</button>
          <button className="btn btn-success" onClick={() => setShowMilestoneModal(true)}>+ Milestone</button>
          <button className="btn btn-info text-white" onClick={() => setShowMemberModal(true)}>+ Member</button>
        </div>
      </div>

      <ul className="nav nav-tabs mb-3">
        <li className="nav-item">
          <button className={`nav-link ${activeTab === 'board' ? 'active' : ''}`} onClick={() => setActiveTab('board')}>
            Task Board
          </button>
        </li>
        <li className="nav-item">
          <button className={`nav-link ${activeTab === 'milestones' ? 'active' : ''}`} onClick={() => setActiveTab('milestones')}>
            Milestones
          </button>
        </li>
        <li className="nav-item">
          <button className={`nav-link ${activeTab === 'members' ? 'active' : ''}`} onClick={() => setActiveTab('members')}>
            Members
          </button>
        </li>
      </ul>

      {activeTab === 'board' && (
        <div className="row g-3">
          {columns.map(col => (
            <div key={col.status} className="col-md-4">
              <div className="card">
                <div className={`card-header bg-${col.color} text-white d-flex justify-content-between`}>
                  <h6 className="mb-0">{col.title}</h6>
                  <span className="badge bg-white text-dark">{tasksByStatus(col.status).length}</span>
                </div>
                <div className="card-body p-2" style={{ minHeight: '300px' }}>
                  {tasksByStatus(col.status).map(task => (
                    <div
                      key={task.id}
                      className="card mb-2 shadow-sm cursor-pointer"
                      style={{ cursor: 'pointer' }}
                      onClick={() => handleTaskClick(task)}
                    >
                      <div className="card-body p-3">
                        <div className="d-flex justify-content-between align-items-start mb-2">
                          <h6 className="mb-0">{task.title}</h6>
                          {priorityBadge(task.priority)}
                        </div>
                        {task.due_date && <small className="text-muted">Due: {task.due_date}</small>}
                        {task.assignee_name && (
                          <div className="mt-2">
                            <small className="text-muted">Assigned: {task.assignee_name}</small>
                          </div>
                        )}
                        <div className="mt-2 d-flex justify-content-between align-items-center">
                          <select
                            className="form-select form-select-sm"
                            style={{ width: '150px' }}
                            value={task.status}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => handleStatusChange(task.id, e.target.value)}
                          >
                            <option value="todo">To Do</option>
                            <option value="in_progress">In Progress</option>
                            <option value="completed">Completed</option>
                          </select>
                          <button
                            className="btn btn-sm btn-outline-danger"
                            onClick={(e) => { e.stopPropagation(); handleDeleteTask(task.id, task.title); }}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'milestones' && (
        <div className="row">
          {milestones.length === 0 ? (
            <div className="text-center py-5 text-muted">
              <h5>No milestones yet</h5>
            </div>
          ) : (
            milestones.map(ms => (
              <div key={ms.id} className="col-md-6 mb-3">
                <div className="card">
                  <div className="card-body">
                    <div className="d-flex justify-content-between">
                      <h5>{ms.name}</h5>
                      <button className="btn btn-sm btn-outline-danger" onClick={() => handleDeleteMilestone(ms.id, ms.name)}>Delete</button>
                    </div>
                    <p className="text-muted">{ms.description}</p>
                    <div className="mb-2">
                      <span className={`badge ${ms.status === 'completed' ? 'bg-success' : ms.status === 'in_progress' ? 'bg-warning' : 'bg-secondary'}`}>
                        {ms.status}
                      </span>
                      {ms.due_date && <span className="text-muted ms-2">Due: {ms.due_date}</span>}
                    </div>
                    <div className="progress">
                      <div 
                        className="progress-bar bg-success"
                        style={{ width: `${ms.task_count > 0 ? (ms.completed_tasks / ms.task_count) * 100 : 0}%` }}
                      >
                        {ms.completed_tasks || 0}/{ms.task_count || 0} tasks
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {activeTab === 'members' && (
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {members.map(m => (
              <tr key={m.id}>
                <td>{m.name}</td>
                <td>{m.email}</td>
                <td><span className="badge bg-primary">{m.project_role}</span></td>
                <td>
                  <button 
                    className="btn btn-sm btn-outline-danger"
                    onClick={() => handleRemoveMember(m.id)}
                    disabled={m.project_role === 'owner'}
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {selectedTask && (
        <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog modal-lg">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">{selectedTask.title}</h5>
                <button type="button" className="btn-close" onClick={() => setSelectedTask(null)}></button>
              </div>
              <div className="modal-body">
                <div className="row mb-3">
                  <div className="col-md-6">
                    <p className="mb-1"><strong>Status:</strong> <span className="badge bg-info">{selectedTask.status}</span></p>
                    <p className="mb-1"><strong>Priority:</strong> {priorityBadge(selectedTask.priority)}</p>
                  </div>
                  <div className="col-md-6">
                    <p className="mb-1"><strong>Assignee:</strong> {selectedTask.assignee_name || 'Unassigned'}</p>
                    <p className="mb-1"><strong>Due:</strong> {selectedTask.due_date || 'Not set'}</p>
                    {selectedTask.milestone_name && <p><strong>Milestone:</strong> {selectedTask.milestone_name}</p>}
                  </div>
                </div>
                
                {selectedTask.description && (
                  <div className="mb-4">
                    <h6>Description</h6>
                    <p className="text-muted">{selectedTask.description}</p>
                  </div>
                )}

                <div className="mb-4">
                  <h6>Comments ({taskComments.length})</h6>
                  <form onSubmit={handleAddComment} className="mb-3">
                    <div className="input-group">
                      <input
                        type="text"
                        className="form-control"
                        placeholder="Add a comment..."
                        value={newComment}
                        onChange={(e) => setNewComment(e.target.value)}
                      />
                      <button className="btn btn-primary">Post</button>
                    </div>
                  </form>
                  <div className="list-group">
                    {taskComments.map(c => (
                      <div key={c.id} className="list-group-item">
                        <div className="d-flex justify-content-between">
                          <strong>{c.user_name}</strong>
                          <small className="text-muted">{c.created_at}</small>
                        </div>
                        <p className="mb-0">{c.content}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <h6>Attachments ({taskAttachments.length})</h6>
                  <div className="mb-3">
                    <input type="file" className="form-control" onChange={handleFileUpload} />
                  </div>
                  <div className="list-group">
                    {taskAttachments.map(a => (
                      <div key={a.id} className="list-group-item d-flex justify-content-between align-items-center">
                        <a href={attachmentAPI.download(a.id)} className="text-decoration-none">
                          <i className="bi bi-file-earmark"></i> {a.original_name}
                        </a>
                        <button className="btn btn-sm btn-outline-danger">Delete</button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {showTaskModal && (
        <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Add Task</h5>
                <button type="button" className="btn-close" onClick={() => setShowTaskModal(false)}></button>
              </div>
              <form onSubmit={handleTaskSubmit}>
                <div className="modal-body">
                  <div className="mb-3">
                    <label className="form-label">Title</label>
                    <input type="text" className="form-control" value={taskForm.title} onChange={(e) => setTaskForm({...taskForm, title: e.target.value})} required />
                  </div>
                  <div className="mb-3">
                    <label className="form-label">Description</label>
                    <textarea className="form-control" rows={2} value={taskForm.description} onChange={(e) => setTaskForm({...taskForm, description: e.target.value})} />
                  </div>
                  <div className="row">
                    <div className="col-md-6 mb-3">
                      <label className="form-label">Priority</label>
                      <select className="form-select" value={taskForm.priority} onChange={(e) => setTaskForm({...taskForm, priority: e.target.value})}>
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                      </select>
                    </div>
                    <div className="col-md-6 mb-3">
                      <label className="form-label">Milestone</label>
                      <select className="form-select" value={taskForm.milestone_id} onChange={(e) => setTaskForm({...taskForm, milestone_id: e.target.value || null})}>
                        <option value="">None</option>
                        {milestones.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="row">
                    <div className="col-md-6 mb-3">
                      <label className="form-label">Assignee</label>
                      <select className="form-select" value={taskForm.assignee_id} onChange={(e) => setTaskForm({...taskForm, assignee_id: e.target.value || null})}>
                        <option value="">Unassigned</option>
                        {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                      </select>
                    </div>
                    <div className="col-md-6 mb-3">
                      <label className="form-label">Due Date</label>
                      <input type="date" className="form-control" value={taskForm.due_date} onChange={(e) => setTaskForm({...taskForm, due_date: e.target.value})} />
                    </div>
                  </div>
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-secondary" onClick={() => setShowTaskModal(false)}>Cancel</button>
                  <button type="submit" className="btn btn-primary">Create</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {showMilestoneModal && (
        <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Add Milestone</h5>
                <button type="button" className="btn-close" onClick={() => setShowMilestoneModal(false)}></button>
              </div>
              <form onSubmit={handleMilestoneSubmit}>
                <div className="modal-body">
                  <div className="mb-3">
                    <label className="form-label">Name</label>
                    <input type="text" className="form-control" value={milestoneForm.name} onChange={(e) => setMilestoneForm({...milestoneForm, name: e.target.value})} required />
                  </div>
                  <div className="mb-3">
                    <label className="form-label">Description</label>
                    <textarea className="form-control" rows={2} value={milestoneForm.description} onChange={(e) => setMilestoneForm({...milestoneForm, description: e.target.value})} />
                  </div>
                  <div className="mb-3">
                    <label className="form-label">Due Date</label>
                    <input type="date" className="form-control" value={milestoneForm.due_date} onChange={(e) => setMilestoneForm({...milestoneForm, due_date: e.target.value})} />
                  </div>
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-secondary" onClick={() => setShowMilestoneModal(false)}>Cancel</button>
                  <button type="submit" className="btn btn-primary">Create</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {showMemberModal && (
        <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Add Member</h5>
                <button type="button" className="btn-close" onClick={() => setShowMemberModal(false)}></button>
              </div>
              <form onSubmit={handleMemberSubmit}>
                <div className="modal-body">
                  <div className="mb-3">
                    <label className="form-label">User Email</label>
                    <input type="email" className="form-control" value={memberForm.email} onChange={(e) => setMemberForm({...memberForm, email: e.target.value})} required />
                    <small className="text-muted">Enter email of existing user</small>
                  </div>
                  <div className="mb-3">
                    <label className="form-label">Role</label>
                    <select className="form-select" value={memberForm.role} onChange={(e) => setMemberForm({...memberForm, role: e.target.value})}>
                      <option value="member">Member</option>
                      <option value="admin">Admin</option>
                    </select>
                  </div>
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-secondary" onClick={() => setShowMemberModal(false)}>Cancel</button>
                  <button type="submit" className="btn btn-primary">Add</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProjectDetail;
