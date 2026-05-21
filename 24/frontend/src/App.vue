<script setup>
import { ref, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'

const router = useRouter()
const route = useRoute()
const user = ref(null)

onMounted(() => {
  const userData = localStorage.getItem('user')
  if (userData) {
    user.value = JSON.parse(userData)
  }
})

const logout = () => {
  localStorage.removeItem('token')
  localStorage.removeItem('user')
  user.value = null
  router.push('/login')
}

const isActive = (path) => route.path === path
</script>

<template>
  <div class="app-container">
    <header class="header">
      <div class="header-content">
        <router-link to="/" class="logo">
          🏨 酒店预订系统
        </router-link>
        <nav class="nav">
          <router-link to="/" :class="{ active: isActive('/') }">首页</router-link>
          <router-link v-if="user" to="/my-bookings" :class="{ active: isActive('/my-bookings') }">我的预订</router-link>
          <template v-if="user">
            <span class="user-info">👤 {{ user.name }}</span>
            <button @click="logout" class="btn btn-outline">退出</button>
          </template>
          <template v-else>
            <router-link to="/login" class="btn btn-outline">登录</router-link>
            <router-link to="/register" class="btn btn-primary">注册</router-link>
          </template>
        </nav>
      </div>
    </header>
    <main class="main">
      <router-view />
    </main>
    <footer class="footer">
      <p>&copy; 2024 酒店预订系统. 保留所有权利.</p>
    </footer>
  </div>
</template>

<style scoped>
.app-container {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.header {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  padding: 1rem 0;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
}

.header-content {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 2rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.logo {
  font-size: 1.5rem;
  font-weight: bold;
  color: white;
  text-decoration: none;
}

.nav {
  display: flex;
  gap: 1.5rem;
  align-items: center;
}

.nav a {
  color: white;
  text-decoration: none;
  opacity: 0.9;
  transition: opacity 0.3s;
}

.nav a:hover,
.nav a.active {
  opacity: 1;
  font-weight: 500;
}

.user-info {
  color: white;
  opacity: 0.9;
}

.main {
  flex: 1;
  background-color: #f8fafc;
}

.footer {
  background-color: #1e293b;
  color: white;
  text-align: center;
  padding: 1.5rem 0;
}

.btn {
  padding: 0.5rem 1rem;
  border-radius: 0.5rem;
  text-decoration: none;
  cursor: pointer;
  border: none;
  font-size: 0.875rem;
  transition: all 0.3s;
}

.btn-primary {
  background-color: white;
  color: #667eea;
}

.btn-primary:hover {
  background-color: #f1f5f9;
}

.btn-outline {
  background: transparent;
  border: 1px solid white;
  color: white;
}

.btn-outline:hover {
  background: rgba(255, 255, 255, 0.1);
}
</style>
