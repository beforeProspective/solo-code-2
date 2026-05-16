<template>
  <div>
    <div class="level">
      <div class="level-left">
        <h1 class="title">用户管理</h1>
      </div>
      <div class="level-right">
        <button class="button is-primary" @click="showCreateModal = true">
          <span class="icon"><i class="fas fa-plus"></i></span>
          <span>创建用户</span>
        </button>
      </div>
    </div>

    <div v-if="error" class="notification is-danger">
      {{ error }}
    </div>

    <div class="card">
      <div class="card-content">
        <div v-if="loading" class="has-text-centered py-4">加载中...</div>
        <div v-else-if="users.length > 0" class="table-container">
          <table class="table is-fullwidth is-hoverable">
            <thead>
              <tr>
                <th>ID</th>
                <th>姓名</th>
                <th>邮箱</th>
                <th>角色</th>
                <th>状态</th>
                <th>创建时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="user in users" :key="user.id">
                <td>{{ user.id }}</td>
                <td>{{ user.name }}</td>
                <td>{{ user.email }}</td>
                <td>
                  <span class="tag" :class="user.role === 'admin' ? 'is-danger' : 'is-info'">
                    {{ user.role === 'admin' ? '管理员' : '普通用户' }}
                  </span>
                </td>
                <td>
                  <span class="tag" :class="user.active ? 'is-success' : 'is-danger'">
                    {{ user.active ? '启用' : '禁用' }}
                  </span>
                </td>
                <td>{{ formatDate(user.created_at) }}</td>
                <td>
                  <div class="buttons are-small">
                    <button 
                      class="button" 
                      @click="editUser(user)"
                    >
                      <span class="icon"><i class="fas fa-edit"></i></span>
                    </button>
                    <button 
                      class="button is-danger" 
                      @click="deleteUser(user.id)"
                      :disabled="user.id === currentUserId"
                    >
                      <span class="icon"><i class="fas fa-trash"></i></span>
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-else class="has-text-centered py-4 has-text-grey">
          暂无用户
        </div>
      </div>
    </div>

    <div class="modal" :class="{ 'is-active': showCreateModal }">
      <div class="modal-background" @click="showCreateModal = false"></div>
      <div class="modal-card">
        <header class="modal-card-head">
          <p class="modal-card-title">{{ editingUser ? '编辑用户' : '创建用户' }}</p>
          <button class="delete" aria-label="close" @click="closeModal"></button>
        </header>
        <section class="modal-card-body">
          <div class="field">
            <label class="label">姓名</label>
            <div class="control">
              <input 
                v-model="form.name" 
                type="text" 
                class="input" 
                placeholder="用户姓名"
              />
            </div>
          </div>

          <div class="field">
            <label class="label">邮箱</label>
            <div class="control">
              <input 
                v-model="form.email" 
                type="email" 
                class="input" 
                placeholder="user@example.com"
              />
            </div>
          </div>

          <div v-if="!editingUser" class="field">
            <label class="label">密码</label>
            <div class="control">
              <input 
                v-model="form.password" 
                type="password" 
                class="input" 
                placeholder="至少6位密码"
              />
            </div>
          </div>

          <div v-if="editingUser" class="field">
            <label class="label">新密码（留空不修改）</label>
            <div class="control">
              <input 
                v-model="form.password" 
                type="password" 
                class="input" 
                placeholder="至少6位密码"
              />
            </div>
          </div>

          <div class="field">
            <label class="label">角色</label>
            <div class="control">
              <div class="select">
                <select v-model="form.role">
                  <option value="user">普通用户</option>
                  <option value="admin">管理员</option>
                </select>
              </div>
            </div>
          </div>

          <div class="field">
            <label class="label">状态</label>
            <div class="control">
              <label class="checkbox">
                <input type="checkbox" v-model="form.active" />
                启用账号
              </label>
            </div>
          </div>
        </section>
        <footer class="modal-card-foot">
          <button 
            class="button is-primary" 
            @click="saveUser"
            :disabled="saving"
          >
            <span v-if="saving">保存中...</span>
            <span v-else>保存</span>
          </button>
          <button class="button" @click="closeModal">取消</button>
        </footer>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import { usersService } from '@/services/links'
import { useAuthStore } from '@/stores/auth'

const authStore = useAuthStore()
const currentUserId = computed(() => authStore.user?.id)

const users = ref([])
const loading = ref(true)
const error = ref('')
const showCreateModal = ref(false)
const saving = ref(false)
const editingUser = ref(null)

const form = ref({
  name: '',
  email: '',
  password: '',
  role: 'user',
  active: true
})

function formatDate(dateStr) {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleDateString('zh-CN')
}

async function loadUsers() {
  try {
    loading.value = true
    error.value = ''
    const response = await usersService.getAll()
    users.value = response.data.data || response.data
  } catch (e) {
    error.value = e.response?.data?.error || '加载失败'
  } finally {
    loading.value = false
  }
}

function editUser(user) {
  editingUser.value = user
  form.value = {
    name: user.name,
    email: user.email,
    password: '',
    role: user.role,
    active: user.active
  }
  showCreateModal.value = true
}

function closeModal() {
  showCreateModal.value = false
  editingUser.value = null
  form.value = {
    name: '',
    email: '',
    password: '',
    role: 'user',
    active: true
  }
}

async function saveUser() {
  if (!form.value.name || !form.value.email) {
    alert('请填写完整信息')
    return
  }

  if (!editingUser.value && !form.value.password) {
    alert('请输入密码')
    return
  }

  try {
    saving.value = true
    const data = { ...form.value }
    if (!data.password) delete data.password

    if (editingUser.value) {
      await usersService.update(editingUser.value.id, data)
    } else {
      await usersService.create(data)
    }
    
    closeModal()
    loadUsers()
  } catch (e) {
    alert(e.response?.data?.error || '保存失败')
  } finally {
    saving.value = false
  }
}

async function deleteUser(id) {
  if (!confirm('确定要删除这个用户吗？删除后将无法恢复。')) return
  
  try {
    await usersService.delete(id)
    loadUsers()
  } catch (e) {
    error.value = e.response?.data?.error || '删除失败'
  }
}

onMounted(() => {
  loadUsers()
})
</script>
