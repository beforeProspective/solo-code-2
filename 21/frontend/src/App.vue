<template>
  <div class="app-container">
    <el-container>
      <el-header class="header">
        <div class="logo">
          <el-icon :size="32" color="#409EFF"><Document /></el-icon>
          <h1>电子合同签署平台</h1>
        </div>
        <nav class="nav">
          <router-link to="/" class="nav-link">
            <el-icon><House /></el-icon>
            首页
          </router-link>
          <router-link to="/contracts" class="nav-link">
            <el-icon><Document /></el-icon>
            合同管理
          </router-link>
          <router-link to="/upload" class="nav-link">
            <el-icon><Upload /></el-icon>
            上传合同
          </router-link>
        </nav>
      </el-header>
      <el-main class="main-content">
        <router-view />
      </el-main>
    </el-container>
  </div>
</template>

<script setup>
</script>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: 'Microsoft YaHei', sans-serif;
  background-color: #f5f7fa;
}

.app-container {
  min-height: 100vh;
}

.header {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 40px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
}

.logo {
  display: flex;
  align-items: center;
  gap: 12px;
  color: white;
}

.logo h1 {
  font-size: 24px;
  font-weight: 600;
  color: white;
}

.nav {
  display: flex;
  gap: 30px;
}

.nav-link {
  color: white;
  text-decoration: none;
  font-size: 16px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  border-radius: 6px;
  transition: all 0.3s;
}

.nav-link:hover {
  background: rgba(255, 255, 255, 0.2);
}

.router-link-active {
  background: rgba(255, 255, 255, 0.3);
}

.main-content {
  padding: 30px;
}
</style>
