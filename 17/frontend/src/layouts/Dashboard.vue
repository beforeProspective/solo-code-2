<template>
  <div>
    <nav class="navbar is-primary" role="navigation" aria-label="main navigation">
      <div class="navbar-brand">
        <router-link to="/" class="navbar-item">
          <span class="icon"><i class="fas fa-link"></i></span>
          <span class="ml-2">URL短链接</span>
        </router-link>
        
        <a 
          role="button" 
          class="navbar-burger" 
          :class="{ 'is-active': mobileMenuOpen }"
          @click="mobileMenuOpen = !mobileMenuOpen"
        >
          <span aria-hidden="true"></span>
          <span aria-hidden="true"></span>
          <span aria-hidden="true"></span>
        </a>
      </div>

      <div class="navbar-menu" :class="{ 'is-active': mobileMenuOpen }">
        <div class="navbar-start">
          <router-link to="/" class="navbar-item">
            <span class="icon"><i class="fas fa-chart-line"></i></span>
            <span>仪表盘</span>
          </router-link>
          <router-link to="/links" class="navbar-item">
            <span class="icon"><i class="fas fa-list"></i></span>
            <span>链接管理</span>
          </router-link>
          <router-link to="/stats" class="navbar-item">
            <span class="icon"><i class="fas fa-chart-bar"></i></span>
            <span>统计分析</span>
          </router-link>
          <router-link to="/api-keys" class="navbar-item">
            <span class="icon"><i class="fas fa-key"></i></span>
            <span>API密钥</span>
          </router-link>
          <router-link v-if="authStore.isAdmin" to="/users" class="navbar-item">
            <span class="icon"><i class="fas fa-users"></i></span>
            <span>用户管理</span>
          </router-link>
        </div>

        <div class="navbar-end">
          <div class="navbar-item has-dropdown is-hoverable">
            <a class="navbar-link">
              <span class="icon"><i class="fas fa-user"></i></span>
              <span>{{ authStore.user?.name }}</span>
            </a>
            <div class="navbar-dropdown is-right">
              <a class="navbar-item">
                <span class="icon"><i class="fas fa-envelope"></i></span>
                <span>{{ authStore.user?.email }}</span>
              </a>
              <span class="navbar-item">
                <span class="tag is-small" :class="authStore.isAdmin ? 'is-danger' : 'is-info'">
                  {{ authStore.isAdmin ? '管理员' : '普通用户' }}
                </span>
              </span>
              <hr class="navbar-divider">
              <a class="navbar-item" @click="handleLogout">
                <span class="icon"><i class="fas fa-sign-out-alt"></i></span>
                <span>退出登录</span>
              </a>
            </div>
          </div>
        </div>
      </div>
    </nav>

    <section class="section">
      <div class="container">
        <router-view />
      </div>
    </section>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const authStore = useAuthStore()
const router = useRouter()
const mobileMenuOpen = ref(false)

async function handleLogout() {
  await authStore.logout()
  router.push('/login')
}
</script>
