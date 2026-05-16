<template>
  <div class="page-container">
    <nav class="navbar" role="navigation" aria-label="main navigation">
      <div class="navbar-brand">
        <a class="navbar-item has-text-weight-bold">
          <o-icon icon="folder-open" pack="fas"></o-icon>
          &nbsp;多用户文件管理器
        </a>
      </div>
      
      <div class="navbar-menu">
        <div class="navbar-start">
          <router-link to="/" class="navbar-item">
            <o-icon icon="home" pack="fas"></o-icon>&nbsp;文件管理
          </router-link>
          <router-link to="/admin" class="navbar-item is-active">
            <o-icon icon="users-cog" pack="fas"></o-icon>&nbsp;用户管理
          </router-link>
        </div>
        
        <div class="navbar-end">
          <div class="navbar-item">
            <span class="tag is-info">
              {{ authStore.user?.username }} ({{ roleLabel }})
            </span>
          </div>
          <div class="navbar-item">
            <o-button variant="danger" size="small" @click="logout">
              <o-icon icon="sign-out-alt" pack="fas"></o-icon>&nbsp;退出
            </o-button>
          </div>
        </div>
      </div>
    </nav>
    
    <div class="content-wrapper">
      <h2 class="title" style="margin-bottom: 20px;">用户管理</h2>
      <UserManagement />
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import UserManagement from '../components/UserManagement.vue'

const router = useRouter()
const authStore = useAuthStore()

const roleLabel = computed(() => {
  const roles = {
    admin: '管理员',
    user: '普通用户',
    viewer: '只读用户'
  }
  return roles[authStore.user?.role] || authStore.user?.role
})

function logout() {
  authStore.logout()
  router.push('/login')
}
</script>
