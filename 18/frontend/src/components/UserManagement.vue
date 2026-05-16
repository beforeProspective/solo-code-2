<template>
  <div>
    <div style="margin-bottom: 20px;">
      <o-button variant="primary" @click="showAddModal = true">
        <o-icon icon="user-plus" pack="fas"></o-icon>&nbsp;添加用户
      </o-button>
    </div>
    
    <o-table :data="users" :loading="loading">
      <o-table-column field="id" label="ID" width="80"></o-table-column>
      <o-table-column field="username" label="用户名"></o-table-column>
      <o-table-column field="email" label="邮箱"></o-table-column>
      <o-table-column field="role" label="角色">
        <template #default="props">
          <o-tag :variant="getRoleType(props.row.role)">{{ getRoleLabel(props.row.role) }}</o-tag>
        </template>
      </o-table-column>
      <o-table-column field="storage_adapter" label="存储适配器">
        <template #default="props">
          <o-tag variant="info">{{ props.row.storage_adapter }}</o-tag>
        </template>
      </o-table-column>
      <o-table-column field="created_at" label="创建时间"></o-table-column>
      <o-table-column label="操作" width="280">
        <template #default="props">
          <o-button size="small" variant="warning" @click="editUser(props.row)">
            <o-icon icon="edit" pack="fas"></o-icon>&nbsp;编辑
          </o-button>
          <o-button size="small" variant="danger" @click="deleteUser(props.row)" :disabled="props.row.id === currentUserId">
            <o-icon icon="trash" pack="fas"></o-icon>&nbsp;删除
          </o-button>
        </template>
      </o-table-column>
    </o-table>
    
    <o-modal v-model:active="showAddModal" title="添加用户" width="500">
      <o-field label="用户名">
        <o-input v-model="newUser.username"></o-input>
      </o-field>
      <o-field label="邮箱">
        <o-input v-model="newUser.email" type="email"></o-input>
      </o-field>
      <o-field label="密码">
        <o-input v-model="newUser.password" type="password" password-reveal></o-input>
      </o-field>
      <o-field label="角色">
        <o-select v-model="newUser.role">
          <option value="user">普通用户</option>
          <option value="admin">管理员</option>
          <option value="viewer">只读用户</option>
        </o-select>
      </o-field>
      <template #footer>
        <o-button @click="showAddModal = false">取消</o-button>
        <o-button variant="primary" @click="addUser">确定</o-button>
      </template>
    </o-modal>
    
    <o-modal v-model:active="showEditModal" title="编辑用户" width="500">
      <o-field label="角色">
        <o-select v-model="editForm.role">
          <option value="user">普通用户</option>
          <option value="admin">管理员</option>
          <option value="viewer">只读用户</option>
        </o-select>
      </o-field>
      <o-field label="新密码（留空则不修改）">
        <o-input v-model="editForm.password" type="password" password-reveal></o-input>
      </o-field>
      <o-field label="存储适配器">
        <o-select v-model="editForm.storage_adapter">
          <option value="local">本地存储</option>
          <option value="s3">S3</option>
          <option value="dropbox">Dropbox</option>
          <option value="ftp">FTP</option>
        </o-select>
      </o-field>
      <template #footer>
        <o-button @click="showEditModal = false">取消</o-button>
        <o-button variant="primary" @click="saveEdit">保存</o-button>
      </template>
    </o-modal>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import { useAuthStore } from '../stores/auth'
import api from '../api'

const authStore = useAuthStore()

const users = ref([])
const loading = ref(false)
const showAddModal = ref(false)
const showEditModal = ref(false)
const editingUser = ref(null)

const newUser = ref({
  username: '',
  email: '',
  password: '',
  role: 'user'
})

const editForm = ref({
  role: 'user',
  password: '',
  storage_adapter: 'local'
})

const currentUserId = computed(() => authStore.user?.id)

function getRoleLabel(role) {
  const labels = {
    admin: '管理员',
    user: '普通用户',
    viewer: '只读用户'
  }
  return labels[role] || role
}

function getRoleType(role) {
  const types = {
    admin: 'danger',
    user: 'primary',
    viewer: 'warning'
  }
  return types[role] || 'light'
}

async function fetchUsers() {
  loading.value = true
  try {
    const response = await api.get('/admin?action=list')
    users.value = response.data.users
  } catch (e) {
    console.error('Failed to fetch users:', e)
  } finally {
    loading.value = false
  }
}

async function addUser() {
  if (!newUser.value.username || !newUser.value.email || !newUser.value.password) {
    alert('请填写完整信息')
    return
  }
  if (newUser.value.password.length < 6) {
    alert('密码至少6位')
    return
  }
  
  try {
    await api.post('/admin?action=create', newUser.value)
    showAddModal.value = false
    newUser.value = { username: '', email: '', password: '', role: 'user' }
    fetchUsers()
  } catch (e) {
    alert(e.response?.data?.error || '添加失败')
  }
}

function editUser(user) {
  editingUser.value = user
  editForm.value = {
    role: user.role,
    password: '',
    storage_adapter: user.storage_adapter
  }
  showEditModal.value = true
}

async function saveEdit() {
  if (!editingUser.value) return
  
  const data = {
    id: editingUser.value.id,
    role: editForm.value.role,
    storage_adapter: editForm.value.storage_adapter
  }
  if (editForm.value.password) {
    data.password = editForm.value.password
  }
  
  try {
    await api.post('/admin?action=update', data)
    showEditModal.value = false
    editingUser.value = null
    fetchUsers()
  } catch (e) {
    alert(e.response?.data?.error || '更新失败')
  }
}

async function deleteUser(user) {
  if (!confirm(`确定要删除用户 "${user.username}" 吗？`)) return
  try {
    await api.delete(`/admin?id=${user.id}`)
    fetchUsers()
  } catch (e) {
    alert(e.response?.data?.error || '删除失败')
  }
}

onMounted(() => {
  fetchUsers()
})
</script>
