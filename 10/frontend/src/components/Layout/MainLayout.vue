<template>
  <div class="layout-container">
    <Sidebar 
      v-model:visible="sidebarVisible" 
      :baseZIndex="1000" 
      position="left" 
      :showCloseIcon="false"
      :style="{ width: '250px' }"
    >
      <div class="sidebar-content">
        <div class="sidebar-header">
          <i class="pi pi-microchip" style="font-size: 2rem; margin-right: 0.5rem;"></i>
          <span>电子元器件管理</span>
        </div>
        
        <Menu :model="menuItems" class="sidebar-menu" />
      </div>
    </Sidebar>
    
    <div class="main-content">
      <div class="top-bar">
        <Button 
          icon="pi pi-bars" 
          text 
          @click="sidebarVisible = true"
          class="menu-toggle"
        />
        
        <div class="top-bar-spacer"></div>
        
        <div class="top-bar-actions">
          <Badge v-if="lowStockCount > 0" :value="lowStockCount" severity="danger">
            <Button 
              icon="pi pi-bell" 
              text 
              @click="showLowStock = true"
              class="notification-btn"
            />
          </Badge>
          <Button 
            v-else
            icon="pi pi-bell" 
            text
            class="notification-btn"
          />
          
          <div class="user-dropdown">
            <Button 
              :label="authStore.user?.username" 
              icon="pi pi-user"
              text
              @click="userMenuVisible = !userMenuVisible"
            />
            
            <OverlayPanel 
              v-model:visible="userMenuVisible" 
              :showCloseIcon="false"
              class="user-menu"
            >
              <div class="user-info">
                <div class="user-avatar">
                  <i class="pi pi-user" style="font-size: 2rem;"></i>
                </div>
                <div class="user-details">
                  <div class="username">{{ authStore.user?.username }}</div>
                  <div class="user-role">{{ authStore.user?.role === 'admin' ? '管理员' : '普通用户' }}</div>
                </div>
              </div>
              <Divider />
              <Button 
                label="退出登录" 
                icon="pi pi-sign-out" 
                text 
                severity="danger"
                @click="handleLogout"
                class="w-full"
              />
            </OverlayPanel>
          </div>
        </div>
      </div>
      
      <div class="content-area">
        <router-view />
      </div>
    </div>
    
    <Dialog 
      v-model:visible="showLowStock" 
      header="低库存告警" 
      :style="{ width: '600px' }"
      :modal="true"
    >
      <DataTable :value="lowStockItems" :loading="loadingLowStock" stripedRows>
        <Column field="name" header="元件名称" />
        <Column field="quantity" header="当前库存" />
        <Column field="min_stock" header="最低库存" />
        <Column field="location" header="位置" />
      </DataTable>
    </Dialog>
    
    <Toast />
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useToast } from 'primevue/usetoast'
import { statsApi } from '@/api'
import Sidebar from 'primevue/sidebar'
import Menu from 'primevue/menu'
import Button from 'primevue/button'
import Badge from 'primevue/badge'
import OverlayPanel from 'primevue/overlaypanel'
import Divider from 'primevue/divider'
import Dialog from 'primevue/dialog'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Toast from 'primevue/toast'

const authStore = useAuthStore()
const router = useRouter()
const toast = useToast()

const sidebarVisible = ref(false)
const userMenuVisible = ref(false)
const showLowStock = ref(false)
const lowStockItems = ref([])
const lowStockCount = ref(0)
const loadingLowStock = ref(false)

const menuItems = [
  {
    label: '仪表盘',
    icon: 'pi pi-home',
    command: () => router.push('/')
  },
  {
    label: '元件管理',
    icon: 'pi pi-microchip',
    command: () => router.push('/components')
  },
  {
    label: '供应商',
    icon: 'pi pi-building',
    command: () => router.push('/suppliers')
  },
  {
    label: 'BOM管理',
    icon: 'pi pi-list-check',
    command: () => router.push('/boms')
  },
  {
    label: '库存概览',
    icon: 'pi pi-box',
    command: () => router.push('/inventory')
  },
  {
    label: '统计分析',
    icon: 'pi pi-chart-bar',
    command: () => router.push('/stats')
  }
]

const loadLowStock = async () => {
  loadingLowStock.value = true
  try {
    const response = await statsApi.getLowStock()
    lowStockItems.value = response.data.data
    lowStockCount.value = response.data.count
  } catch (error) {
    console.error('Failed to load low stock:', error)
  } finally {
    loadingLowStock.value = false
  }
}

const handleLogout = () => {
  authStore.logout()
  userMenuVisible.value = false
  toast.add({ severity: 'info', summary: '已退出登录', life: 2000 })
  router.push('/login')
}

onMounted(() => {
  loadLowStock()
})
</script>

<style scoped>
.layout-container {
  min-height: 100vh;
  display: flex;
  background: #f8f9fa;
}

.sidebar-content {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.sidebar-header {
  padding: 1.5rem;
  font-size: 1.25rem;
  font-weight: bold;
  color: #495057;
  display: flex;
  align-items: center;
  border-bottom: 1px solid #e9ecef;
}

.sidebar-menu {
  flex: 1;
  padding: 0.5rem;
}

.sidebar-menu .p-menuitem {
  margin-bottom: 0.25rem;
}

.main-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.top-bar {
  background: white;
  height: 60px;
  display: flex;
  align-items: center;
  padding: 0 1rem;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
  z-index: 100;
}

.menu-toggle {
  margin-right: 1rem;
}

.top-bar-spacer {
  flex: 1;
}

.top-bar-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.notification-btn {
  position: relative;
}

.user-menu {
  min-width: 200px;
}

.user-info {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.5rem;
}

.user-avatar {
  width: 50px;
  height: 50px;
  background: #e3f2fd;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #2196f3;
}

.user-details .username {
  font-weight: 600;
  color: #333;
}

.user-details .user-role {
  font-size: 0.875rem;
  color: #666;
}

.content-area {
  flex: 1;
  padding: 1.5rem;
  overflow-y: auto;
}

.w-full {
  width: 100%;
}
</style>
