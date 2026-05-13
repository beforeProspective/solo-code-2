import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const routes = [
  {
    path: '/',
    name: 'PublicStatus',
    component: () => import('@/views/public/PublicStatus.vue')
  },
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/auth/Login.vue')
  },
  {
    path: '/register',
    name: 'Register',
    component: () => import('@/views/auth/Register.vue')
  },
  {
    path: '/admin',
    component: () => import('@/views/admin/AdminLayout.vue'),
    meta: { requiresAuth: true },
    children: [
      {
        path: '',
        redirect: '/admin/dashboard'
      },
      {
        path: 'dashboard',
        name: 'Dashboard',
        component: () => import('@/views/admin/Dashboard.vue')
      },
      {
        path: 'components',
        name: 'Components',
        component: () => import('@/views/admin/Components.vue')
      },
      {
        path: 'incidents',
        name: 'Incidents',
        component: () => import('@/views/admin/Incidents.vue')
      },
      {
        path: 'maintenances',
        name: 'Maintenances',
        component: () => import('@/views/admin/Maintenances.vue')
      },
      {
        path: 'theme',
        name: 'Theme',
        component: () => import('@/views/admin/Theme.vue')
      },
      {
        path: 'subscribers',
        name: 'Subscribers',
        component: () => import('@/views/admin/Subscribers.vue')
      },
      {
        path: 'webhooks',
        name: 'Webhooks',
        component: () => import('@/views/admin/Webhooks.vue')
      },
      {
        path: 'metrics',
        name: 'Metrics',
        component: () => import('@/views/admin/Metrics.vue')
      }
    ]
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

router.beforeEach((to, from, next) => {
  const authStore = useAuthStore()
  if (to.meta.requiresAuth && !authStore.isAuthenticated) {
    next('/login')
  } else {
    next()
  }
})

export default router
