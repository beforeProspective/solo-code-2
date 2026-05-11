import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const routes = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/LoginView.vue'),
    meta: { guest: true }
  },
  {
    path: '/',
    component: () => import('@/components/Layout/MainLayout.vue'),
    meta: { requiresAuth: true },
    children: [
      {
        path: '',
        name: 'Dashboard',
        component: () => import('@/views/DashboardView.vue')
      },
      {
        path: 'components',
        name: 'Components',
        component: () => import('@/views/ComponentsView.vue')
      },
      {
        path: 'components/new',
        name: 'NewComponent',
        component: () => import('@/views/ComponentFormView.vue')
      },
      {
        path: 'components/:id/edit',
        name: 'EditComponent',
        component: () => import('@/views/ComponentFormView.vue')
      },
      {
        path: 'components/:id',
        name: 'ComponentDetail',
        component: () => import('@/views/ComponentDetailView.vue')
      },
      {
        path: 'suppliers',
        name: 'Suppliers',
        component: () => import('@/views/SuppliersView.vue')
      },
      {
        path: 'suppliers/new',
        name: 'NewSupplier',
        component: () => import('@/views/SupplierFormView.vue')
      },
      {
        path: 'suppliers/:id/edit',
        name: 'EditSupplier',
        component: () => import('@/views/SupplierFormView.vue')
      },
      {
        path: 'boms',
        name: 'BOMs',
        component: () => import('@/views/BomsView.vue')
      },
      {
        path: 'boms/new',
        name: 'NewBOM',
        component: () => import('@/views/BomFormView.vue')
      },
      {
        path: 'boms/:id',
        name: 'BOMDetail',
        component: () => import('@/views/BomDetailView.vue')
      },
      {
        path: 'inventory',
        name: 'Inventory',
        component: () => import('@/views/InventoryView.vue')
      },
      {
        path: 'stats',
        name: 'Stats',
        component: () => import('@/views/StatsView.vue')
      }
    ]
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

router.beforeEach((to) => {
  const authStore = useAuthStore()
  
  if (to.meta.requiresAuth) {
    if (!authStore.isAuthenticated) {
      return { name: 'Login', query: { redirect: to.fullPath } }
    }
  }
  
  if (to.meta.guest && authStore.isAuthenticated) {
    return { name: 'Dashboard' }
  }
  
  return true
})

export default router
