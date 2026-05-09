import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import Navbar from './components/Navbar';
import ProtectedRoute from './components/ProtectedRoute';
import Home from './pages/Home';
import Login from './pages/Login';
import Register from './pages/Register';
import ToolDetail from './pages/ToolDetail';
import MyBorrowings from './pages/MyBorrowings';
import MyTools from './pages/MyTools';
import DamageReports from './pages/DamageReports';

export default function App() {
  return (
    <AuthProvider>
      <Router>
        <div className="min-h-screen bg-gray-50">
          <Navbar />
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/tools/:id" element={<ToolDetail />} />
            <Route
              path="/my-borrowings"
              element={
                <ProtectedRoute>
                  <MyBorrowings />
                </ProtectedRoute>
              }
            />
            <Route
              path="/my-tools"
              element={
                <ProtectedRoute>
                  <MyTools />
                </ProtectedRoute>
              }
            />
            <Route
              path="/damage-reports"
              element={
                <ProtectedRoute>
                  <DamageReports />
                </ProtectedRoute>
              }
            />
          </Routes>
        </div>
      </Router>
    </AuthProvider>
  );
}
