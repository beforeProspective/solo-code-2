import { useEffect, useState } from 'react'
import {
  Table,
  Card,
  Tag,
  Button,
  Modal,
  Form,
  Input,
  Select,
  DatePicker,
  Typography,
  Space,
  message,
  Popconfirm,
  Descriptions,
  Divider,
  InputNumber,
  Row,
  Col,
} from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined, UserOutlined, EyeOutlined } from '@ant-design/icons'
import api from '@/utils/api'
import dayjs, { Dayjs } from 'dayjs'
import { useAppSelector } from '@/store'

const { Title } = Typography
const { TextArea } = Input

interface Employee {
  id: number
  employee_code: string
  user: {
    id: number
    name: string
    email: string
    phone: string | null
    role: string
  }
  department: { id: number; name: string } | null
  position: { id: number; title: string } | null
  date_of_joining: string
  date_of_birth: string | null
  gender: string
  marital_status: string | null
  address: string | null
  emergency_contact_name: string | null
  emergency_contact_phone: string | null
  bank_name: string | null
  bank_account: string | null
  id_number: string | null
  status: string
}

interface Department { id: number; name: string }
interface Position { id: number; title: string }

const statusColor: Record<string, string> = {
  active: 'green',
  inactive: 'red',
  on_leave: 'orange',
  terminated: 'default',
}

const statusLabel: Record<string, string> = {
  active: '在职',
  inactive: '离职',
  on_leave: '休假',
  terminated: '已终止',
}

const genderOptions = [
  { value: 'male', label: '男' },
  { value: 'female', label: '女' },
  { value: 'other', label: '其他' },
]

const maritalOptions = [
  { value: 'single', label: '未婚' },
  { value: 'married', label: '已婚' },
  { value: 'divorced', label: '离异' },
  { value: 'widowed', label: '丧偶' },
]

const EmployeeList = () => {
  const [data, setData] = useState<Employee[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [positions, setPositions] = useState<Position[]>([])
  const [loading, setLoading] = useState(false)
  const [modalVisible, setModalVisible] = useState(false)
  const [detailVisible, setDetailVisible] = useState(false)
  const [editingItem, setEditingItem] = useState<Employee | null>(null)
  const [selectedItem, setSelectedItem] = useState<Employee | null>(null)
  const [form] = Form.useForm()
  const { user } = useAppSelector((state) => state.auth)

  const canManage = user && ['admin', 'hr'].includes(user.role)

  const fetchData = async () => {
    setLoading(true)
    try {
      const [empRes, deptRes, posRes] = await Promise.all([
        api.get('/employees'),
        api.get('/departments'),
        api.get('/positions'),
      ])
      setData(empRes.data.data || empRes.data)
      setDepartments(deptRes.data.data || deptRes.data)
      setPositions(posRes.data.data || posRes.data)
    } catch (error) {
      message.error('获取数据失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  const handleAdd = () => {
    setEditingItem(null)
    form.resetFields()
    setModalVisible(true)
  }

  const handleEdit = (item: Employee) => {
    setEditingItem(item)
    form.setFieldsValue({
      name: item.user.name,
      email: item.user.email,
      phone: item.user.phone,
      role: item.user.role,
      department_id: item.department?.id,
      position_id: item.position?.id,
      date_of_joining: item.date_of_joining ? dayjs(item.date_of_joining) : null,
      date_of_birth: item.date_of_birth ? dayjs(item.date_of_birth) : null,
      gender: item.gender,
      marital_status: item.marital_status,
      address: item.address,
      emergency_contact_name: item.emergency_contact_name,
      emergency_contact_phone: item.emergency_contact_phone,
      bank_name: item.bank_name,
      bank_account: item.bank_account,
      id_number: item.id_number,
      status: item.status,
    })
    setModalVisible(true)
  }

  const handleSubmit = async (values: any) => {
    try {
      const payload = {
        name: values.name,
        email: values.email,
        phone: values.phone || null,
        role: values.role,
        password: values.password || 'password123',
        department_id: values.department_id,
        position_id: values.position_id,
        date_of_joining: values.date_of_joining?.format('YYYY-MM-DD'),
        date_of_birth: values.date_of_birth?.format('YYYY-MM-DD'),
        gender: values.gender,
        marital_status: values.marital_status || null,
        address: values.address || null,
        emergency_contact_name: values.emergency_contact_name || null,
        emergency_contact_phone: values.emergency_contact_phone || null,
        bank_name: values.bank_name || null,
        bank_account: values.bank_account || null,
        id_number: values.id_number || null,
        status: values.status || 'active',
      }

      if (editingItem) {
        await api.put(`/employees/${editingItem.id}`, payload)
        message.success('员工信息更新成功')
      } else {
        await api.post('/employees', payload)
        message.success('员工创建成功')
      }

      setModalVisible(false)
      fetchData()
    } catch (error: any) {
      message.error(error.response?.data?.message || '操作失败')
    }
  }

  const handleDelete = async (id: number) => {
    try {
      await api.delete(`/employees/${id}`)
      message.success('员工已删除')
      fetchData()
    } catch (error: any) {
      message.error(error.response?.data?.message || '删除失败')
    }
  }

  const columns = [
    {
      title: '员工编号',
      dataIndex: 'employee_code',
      key: 'employee_code',
    },
    {
      title: '姓名',
      dataIndex: ['user', 'name'],
      key: 'name',
    },
    {
      title: '邮箱',
      dataIndex: ['user', 'email'],
      key: 'email',
    },
    {
      title: '部门',
      dataIndex: ['department', 'name'],
      key: 'department',
      render: (v: string) => v || '-',
    },
    {
      title: '职位',
      dataIndex: ['position', 'title'],
      key: 'position',
      render: (v: string) => v || '-',
    },
    {
      title: '入职日期',
      dataIndex: 'date_of_joining',
      key: 'date_of_joining',
      render: (v: string) => v ? dayjs(v).format('YYYY-MM-DD') : '-',
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (v: string) => <Tag color={statusColor[v]}>{statusLabel[v]}</Tag>,
    },
    {
      title: '操作',
      key: 'action',
      render: (_: any, record: Employee) => (
        <Space>
          <Button
            type="link"
            icon={<EyeOutlined />}
            onClick={() => {
              setSelectedItem(record)
              setDetailVisible(true)
            }}
          >
            查看
          </Button>
          {canManage && (
            <>
              <Button type="link" icon={<EditOutlined />} onClick={() => handleEdit(record)}>
                编辑
              </Button>
              <Popconfirm title="确定删除此员工？" onConfirm={() => handleDelete(record.id)}>
                <Button type="link" danger icon={<DeleteOutlined />}>删除</Button>
              </Popconfirm>
            </>
          )}
        </Space>
      ),
    },
  ]

  return (
    <div>
      <Title level={3}>员工列表</Title>

      <Card>
        <Space style={{ marginBottom: 16 }}>
          {canManage && (
            <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
              添加员工
            </Button>
          )}
        </Space>

        <Table
          columns={columns}
          dataSource={data}
          rowKey="id"
          loading={loading}
          pagination={{ showSizeChanger: true, showQuickJumper: true }}
        />
      </Card>

      <Modal
        title={editingItem ? '编辑员工' : '添加员工'}
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        onOk={() => form.submit()}
        okText="保存"
        cancelText="取消"
        width={800}
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Divider orientation="left">基本信息</Divider>
          <Row gutter={16}>
            <Col xs={24} lg={8}>
              <Form.Item name="name" label="姓名" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} lg={8}>
              <Form.Item name="email" label="邮箱" rules={[{ required: true, type: 'email' }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} lg={8}>
              <Form.Item name="phone" label="手机号">
                <Input />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col xs={24} lg={8}>
              <Form.Item name="role" label="角色" rules={[{ required: true }]}>
                <Select options={[
                  { value: 'employee', label: '员工' },
                  { value: 'manager', label: '经理' },
                  { value: 'hr', label: 'HR' },
                  { value: 'admin', label: '管理员' },
                ]} />
              </Form.Item>
            </Col>
            <Col xs={24} lg={8}>
              <Form.Item name="department_id" label="部门">
                <Select
                  options={departments.map(d => ({ value: d.id, label: d.name }))}
                  placeholder="选择部门"
                />
              </Form.Item>
            </Col>
            <Col xs={24} lg={8}>
              <Form.Item name="position_id" label="职位">
                <Select
                  options={positions.map(p => ({ value: p.id, label: p.title }))}
                  placeholder="选择职位"
                />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col xs={24} lg={8}>
              <Form.Item name="date_of_joining" label="入职日期">
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={24} lg={8}>
              <Form.Item name="gender" label="性别">
                <Select options={genderOptions} />
              </Form.Item>
            </Col>
            <Col xs={24} lg={8}>
              <Form.Item name="marital_status" label="婚姻状况">
                <Select options={maritalOptions} />
              </Form.Item>
            </Col>
          </Row>

          <Divider orientation="left">其他信息</Divider>
          <Row gutter={16}>
            <Col xs={24} lg={12}>
              <Form.Item name="address" label="地址">
                <TextArea rows={2} />
              </Form.Item>
            </Col>
            <Col xs={24} lg={12}>
              <Form.Item name="id_number" label="身份证号">
                <Input />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col xs={24} lg={8}>
              <Form.Item name="emergency_contact_name" label="紧急联系人">
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} lg={8}>
              <Form.Item name="emergency_contact_phone" label="紧急联系电话">
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} lg={8}>
              <Form.Item name="status" label="状态">
                <Select options={[
                  { value: 'active', label: '在职' },
                  { value: 'inactive', label: '离职' },
                  { value: 'on_leave', label: '休假' },
                  { value: 'terminated', label: '已终止' },
                ]} />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col xs={24} lg={12}>
              <Form.Item name="bank_name" label="开户行">
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} lg={12}>
              <Form.Item name="bank_account" label="银行账号">
                <Input />
              </Form.Item>
            </Col>
          </Row>

          {!editingItem && (
            <Form.Item name="password" label="初始密码" rules={[{ required: true, min: 6 }]}>
              <Input.Password placeholder="设置初始密码 (至少6位)" />
            </Form.Item>
          )}
        </Form>
      </Modal>

      <Modal
        title="员工详情"
        open={detailVisible}
        onCancel={() => setDetailVisible(false)}
        footer={null}
        width={800}
      >
        {selectedItem && (
          <Descriptions bordered column={2}>
            <Descriptions.Item label="员工编号">{selectedItem.employee_code}</Descriptions.Item>
            <Descriptions.Item label="姓名">{selectedItem.user.name}</Descriptions.Item>
            <Descriptions.Item label="邮箱">{selectedItem.user.email}</Descriptions.Item>
            <Descriptions.Item label="手机号">{selectedItem.user.phone || '-'}</Descriptions.Item>
            <Descriptions.Item label="部门">{selectedItem.department?.name || '-'}</Descriptions.Item>
            <Descriptions.Item label="职位">{selectedItem.position?.title || '-'}</Descriptions.Item>
            <Descriptions.Item label="入职日期">{selectedItem.date_of_joining}</Descriptions.Item>
            <Descriptions.Item label="性别">{genderOptions.find(g => g.value === selectedItem.gender)?.label}</Descriptions.Item>
            <Descriptions.Item label="婚姻状况">{selectedItem.marital_status || '-'}</Descriptions.Item>
            <Descriptions.Item label="状态">
              <Tag color={statusColor[selectedItem.status]}>{statusLabel[selectedItem.status]}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="身份证号" span={2}>{selectedItem.id_number || '-'}</Descriptions.Item>
            <Descriptions.Item label="地址" span={2}>{selectedItem.address || '-'}</Descriptions.Item>
            <Descriptions.Item label="紧急联系人">{selectedItem.emergency_contact_name || '-'}</Descriptions.Item>
            <Descriptions.Item label="紧急联系电话">{selectedItem.emergency_contact_phone || '-'}</Descriptions.Item>
          </Descriptions>
        )}
      </Modal>
    </div>
  )
}

export default EmployeeList
