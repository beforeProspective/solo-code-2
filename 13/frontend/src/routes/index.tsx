import { createBrowserRouter, Navigate } from 'react-router-dom'
import ProtectedRoute from '@/components/ProtectedRoute'
import AppLayout from '@/components/Layout'
import Login from '@/pages/Login'
import Dashboard from '@/pages/Dashboard'
import EmployeeList from '@/pages/EmployeeList'
import OrgChart from '@/pages/OrgChart'
import AttendanceClock from '@/pages/AttendanceClock'
import AttendanceHistory from '@/pages/AttendanceHistory'
import LeaveRequests from '@/pages/LeaveRequests'
import PerformanceReviews from '@/pages/PerformanceReviews'
import RecruitmentJobs from '@/pages/RecruitmentJobs'
import Applicants from '@/pages/Applicants'
import Interviews from '@/pages/Interviews'
import Announcements from '@/pages/Announcements'
import Notifications from '@/pages/Notifications'
import Documents from '@/pages/Documents'
import Reports from '@/pages/Reports'

const router = createBrowserRouter([
  {
    path: '/login',
    element: <Login />,
  },
  {
    path: '/',
    element: <ProtectedRoute />,
    children: [
      {
        element: <AppLayout />,
        children: [
          {
            index: true,
            element: <Navigate to="/dashboard" replace />,
          },
          {
            path: 'dashboard',
            element: <Dashboard />,
          },
          {
            path: 'employees',
            element: <ProtectedRoute allowedRoles={['admin', 'hr', 'manager']} />,
            children: [
              {
                path: 'list',
                element: <EmployeeList />,
              },
              {
                path: 'org-chart',
                element: <OrgChart />,
              },
            ],
          },
          {
            path: 'attendance',
            children: [
              {
                path: 'clock',
                element: <AttendanceClock />,
              },
              {
                path: 'history',
                element: <AttendanceHistory />,
              },
              {
                path: 'leave',
                element: <LeaveRequests />,
              },
            ],
          },
          {
            path: 'performance',
            element: <PerformanceReviews />,
          },
          {
            path: 'recruitment',
            element: <ProtectedRoute allowedRoles={['admin', 'hr', 'manager']} />,
            children: [
              {
                path: 'jobs',
                element: <RecruitmentJobs />,
              },
              {
                path: 'applicants',
                element: <Applicants />,
              },
              {
                path: 'interviews',
                element: <Interviews />,
              },
            ],
          },
          {
            path: 'announcements',
            element: <Announcements />,
          },
          {
            path: 'notifications',
            element: <Notifications />,
          },
          {
            path: 'documents',
            element: <Documents />,
          },
          {
            path: 'reports',
            element: <ProtectedRoute allowedRoles={['admin', 'hr', 'manager']} />,
            children: [
              {
                index: true,
                element: <Reports />,
              },
            ],
          },
        ],
      },
    ],
  },
  {
    path: '*',
    element: <Navigate to="/dashboard" replace />,
  },
])

export default router
