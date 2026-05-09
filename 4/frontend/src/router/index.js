import { createRouter, createWebHistory } from 'vue-router'

const routes = [
  {
    path: '/',
    redirect: '/beans'
  },
  {
    path: '/beans',
    name: 'Beans',
    component: () => import('../views/Beans.vue')
  },
  {
    path: '/roasting',
    name: 'Roasting',
    component: () => import('../views/Roasting.vue')
  },
  {
    path: '/cupping',
    name: 'Cupping',
    component: () => import('../views/Cupping.vue')
  },
  {
    path: '/comparison',
    name: 'Comparison',
    component: () => import('../views/Comparison.vue')
  },
  {
    path: '/suppliers',
    name: 'Suppliers',
    component: () => import('../views/Suppliers.vue')
  },
  {
    path: '/maintenance',
    name: 'Maintenance',
    component: () => import('../views/Maintenance.vue')
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

export default router
