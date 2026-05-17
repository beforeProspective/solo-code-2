<template>
  <div id="app">
    <nav class="nav">
      <div class="nav-container">
        <h1 class="logo">💬 聊天表单构建器</h1>
        <div class="nav-links">
          <router-link to="/" class="nav-link">流程列表</router-link>
          <router-link to="/chat" class="nav-link">聊天体验</router-link>
        </div>
      </div>
    </nav>
    <main class="main">
      <router-view />
    </main>
  </div>
</template>

<script setup>
</script>

<style scoped>
.nav {
  background: white;
  border-bottom: 1px solid #e5e7eb;
  padding: 0 24px;
}

.nav-container {
  max-width: 1400px;
  margin: 0 auto;
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.logo {
  font-size: 20px;
  font-weight: 600;
  color: #1f2937;
}

.nav-links {
  display: flex;
  gap: 24px;
}

.nav-link {
  color: #6b7280;
  text-decoration: none;
  font-size: 15px;
  padding: 8px 0;
  border-bottom: 2px solid transparent;
}

.nav-link:hover,
.nav-link.router-link-active {
  color: #4f46e5;
  border-bottom-color: #4f46e5;
}

.main {
  max-width: 1400px;
  margin: 0 auto;
  padding: 24px;
}
</style>
