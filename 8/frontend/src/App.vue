<template>
  <div class="min-h-screen bg-gray-50 flex">
    <aside class="w-64 bg-white shadow-lg flex-shrink-0">
      <div class="p-6 border-b">
        <h1 class="text-2xl font-bold text-blue-600">发票系统</h1>
        <p class="text-gray-500 text-sm">Invoice Management</p>
      </div>
      <nav class="p-4 space-y-2">
        <router-link to="/" class="nav-link" :class="active('/')">
          <span>📊</span> 仪表盘
        </router-link>
        <router-link to="/customers" class="nav-link" :class="active('/customers')">
          <span>👥</span> 客户管理
        </router-link>
        <router-link to="/invoices" class="nav-link" :class="active('/invoices')">
          <span>📄</span> 发票列表
        </router-link>
        <router-link to="/invoices/create" class="nav-link" :class="active('/invoices/create')">
          <span>➕</span> 新建发票
        </router-link>
        <router-link to="/reminders" class="nav-link" :class="active('/reminders')">
          <span>🔔</span> 逾期提醒
        </router-link>
      </nav>
    </aside>
    <main class="flex-1 p-8 overflow-auto">
      <router-view />
    </main>
  </div>
</template>

<script setup>
import { useRoute } from 'vue-router'
const route = useRoute()
const active = (path) => route.path === path ? 'bg-blue-50 text-blue-600 border-l-4 border-blue-600' : ''
</script>

<style scoped>
.nav-link {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  border-radius: 6px;
  color: #4b5563;
  text-decoration: none;
  font-weight: 500;
  transition: all 0.2s;
}
.nav-link:hover {
  background: #f9fafb;
  color: #2563eb;
}
</style>
