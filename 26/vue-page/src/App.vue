<template>
  <div id="app">
    <header class="header">
      <div class="container header-content">
        <router-link to="/" class="logo">{{ settings.site_name }}</router-link>
        <nav class="nav">
          <router-link to="/">首页</router-link>
          <router-link to="/categories">分类</router-link>
          <router-link to="/tags">标签</router-link>
          <router-link to="/admin" v-if="isLoggedIn">管理后台</router-link>
          <router-link to="/login" v-else>登录</router-link>
        </nav>
      </div>
    </header>
    <main class="main">
      <router-view />
    </main>
    <footer class="footer">
      <div class="container">
        <p>{{ settings.copyright_text }}</p>
        <p v-if="settings.icp_number">{{ settings.icp_number }}</p>
      </div>
    </footer>
  </div>
</template>

<script>
import axios from 'axios'

export default {
  name: 'App',
  data() {
    return {
      settings: {
        site_name: '我的博客',
        copyright_text: '© 2024 我的博客',
        icp_number: ''
      }
    }
  },
  computed: {
    isLoggedIn() {
      return !!localStorage.getItem('admin_token')
    }
  },
  mounted() {
    this.loadSettings()
  },
  methods: {
    async loadSettings() {
      try {
        const res = await axios.get('/api/settings')
        this.settings = res.data
      } catch (e) {
        console.error(e)
      }
    }
  }
}
</script>

<style scoped>
.header {
  background: white;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  position: sticky;
  top: 0;
  z-index: 100;
}

.header-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
  height: 60px;
}

.logo {
  font-size: 24px;
  font-weight: bold;
  color: #409eff;
}

.nav {
  display: flex;
  gap: 30px;
}

.nav a {
  color: #606266;
  font-size: 15px;
  transition: color 0.3s;
}

.nav a:hover,
.nav a.router-link-active {
  color: #409eff;
}

.main {
  min-height: calc(100vh - 140px);
  padding: 30px 0;
}

.footer {
  background: white;
  padding: 30px 0;
  text-align: center;
  color: #909399;
  font-size: 14px;
}

.footer p {
  margin: 5px 0;
}
</style>
