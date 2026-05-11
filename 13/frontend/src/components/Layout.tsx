import { useState, useEffect } from 'react'
import { useNavigate, Outlet, useLocation } from 'react-router-dom'
import { Layout, Menu, Dropdown, Avatar, Badge, Typography, Space, Button } from 'antd'
import {
  DashboardOutlined,
  TeamOutlined,
  CalendarOutlined,
  FileTextOutlined,
  BellOutlined,
  FolderOpenOutlined,
  BarChartOutlined,
  UserOutlined,
  LogoutOutlined,
  SettingOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  BulbOutlined,
} from '@ant-design/icons'
import type { MenuProps } from 'antd'


import { useAppDispatch, useAppSelector } from '@/store'
import { logout } from '@/store/slices/authSlice'
import { fetchUnreadCount } from '@/store/slices/notificationSlice'

const { Header, Sider, Content } = Layout
const { Title } = Typography

const AppLayout = () => {
  const [collapsed, setCollapsed] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()
  const dispatch = useAppDispatch()
  const { user } = useAppSelector((state) => state.auth)
  const { unreadCount } = useAppSelector((state) => state.notifications)

  useEffect(() => {
    if (user) {
      dispatch(fetchUnreadCount())
    }
  }, [user, dispatch])

  const getMenuItems = (): MenuProps['items'] => {
    const baseItems = [
      {
        key: '/dashboard',
        icon: <DashboardOutlined />,
        label: '仪表盘',
        onClick: () => navigate('/dashboard'),
      },
      {
        key: '/attendance',
        icon: <CalendarOutlined />,
        label: '考勤管理',
        children: [
          { key: '/attendance/clock', label: '打卡', onClick: () => navigate('/attendance/clock') },
          { key: '/attendance/history', label: '考勤记录', onClick: () => navigate('/attendance/history') },
          { key: '/attendance/leave', label: '请假申请', onClick: () => navigate('/attendance/leave') },
        ],
      },
      {
        key: '/performance',
        icon: <FileTextOutlined />,
        label: '绩效评估',
        onClick: () => navigate('/performance'),
      },
      {
        key: '/announcements',
        icon: <BulbOutlined />,
        label: '公告通知',
        onClick: () => navigate('/announcements'),
      },
      {
        key: '/documents',
        icon: <FolderOpenOutlined />,
        label: '文档管理',
        onClick: () => navigate('/documents'),
      },
    ]

    if (user && ['admin', 'hr', 'manager'].includes(user.role)) {
      baseItems.splice(1, 0, {
        key: '/employees',
        icon: <TeamOutlined />,
        label: '员工管理',
        children: [
          { key: '/employees/list', label: '员工列表', onClick: () => navigate('/employees/list') },
          { key: '/employees/org-chart', label: '组织结构图', onClick: () => navigate('/employees/org-chart') },
        ],
      })

      baseItems.push({
        key: '/recruitment',
        icon: <BarChartOutlined />,
        label: '招聘管理',
        children: [
          { key: '/recruitment/jobs', label: '职位发布', onClick: () => navigate('/recruitment/jobs') },
          { key: '/recruitment/applicants', label: '简历管理', onClick: () => navigate('/recruitment/applicants') },
          { key: '/recruitment/interviews', label: '面试安排', onClick: () => navigate('/recruitment/interviews') },
        ],
      })
    }

    if (user && ['admin', 'hr', 'manager'].includes(user.role)) {
      baseItems.push({
        key: '/reports',
        icon: <BarChartOutlined />,
        label: '报表中心',
        onClick: () => navigate('/reports'),
      })
    }

    return baseItems
  }

  const selectedKeys = [location.pathname]
  const openKeys = location.pathname.split('/').filter((_, i) => i < 3).map((_, i, arr) =>
    '/' + arr.slice(0, i + 1).join('/')
  ).slice(0, -1)

  const handleLogout = async () => {
    await dispatch(logout())
    navigate('/login')
  }

  const userMenu: MenuProps['items'] = [
    {
      key: 'profile',
      icon: <UserOutlined />,
      label: '个人资料',
      onClick: () => navigate('/profile'),
    },
    {
      key: 'settings',
      icon: <SettingOutlined />,
      label: '设置',
      onClick: () => navigate('/settings'),
    },
    {
      type: 'divider',
    },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: '退出登录',
      onClick: handleLogout,
    },
  ]

  const roleLabels: Record<string, string> = {
    admin: '系统管理员',
    hr: 'HR经理',
    manager: '部门经理',
    employee: '员工',
  }

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        trigger={null}
        collapsible
        collapsed={collapsed}
        width={240}
        theme="dark"
      >
        <div style={{
          height: 64,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'rgba(255, 255, 255, 0.1)',
          margin: 16,
          borderRadius: 4,
        }}>
          <Title level={4} style={{ color: 'white', margin: 0 }}>
            {collapsed ? 'HR' : 'HR管理系统'}
          </Title>
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={selectedKeys}
          defaultOpenKeys={openKeys.filter(k => k.length > 1)}
          items={getMenuItems()}
        />
      </Sider>
      <Layout>
        <Header style={{
          padding: '0 24px',
          background: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
        }}>
          <Button
            type="text"
            icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            onClick={() => setCollapsed(!collapsed)}
            style={{ fontSize: '16px', width: 64, height: 64 }}
          />

          <Space size={24}>
            <Badge count={unreadCount} dot>
              <Button type="text" icon={<BellOutlined />} onClick={() => navigate('/notifications')} />
            </Badge>

            <Dropdown menu={{ items: userMenu }} placement="bottomRight">
              <Space style={{ cursor: 'pointer' }}>
                <Avatar icon={<UserOutlined />} />
                <span>
                  {user?.name}
                  <br />
                  <small style={{ color: '#999' }}>{roleLabels[user?.role || 'employee']}</small>
                </span>
              </Space>
            </Dropdown>
          </Space>
        </Header>
        <Content style={{
          margin: '24px',
          padding: 24,
          background: '#fff',
          borderRadius: 8,
          minHeight: 280,
        }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  )
}

export default AppLayout
