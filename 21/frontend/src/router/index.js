import { createRouter, createWebHistory } from 'vue-router'

const routes = [
  {
    path: '/',
    name: 'Home',
    component: () => import('../views/Home.vue')
  },
  {
    path: '/upload',
    name: 'Upload',
    component: () => import('../views/UploadContract.vue')
  },
  {
    path: '/contracts',
    name: 'Contracts',
    component: () => import('../views/ContractList.vue')
  },
  {
    path: '/contracts/:id/setup',
    name: 'ContractSetup',
    component: () => import('../views/ContractSetup.vue')
  },
  {
    path: '/contracts/:id',
    name: 'ContractDetail',
    component: () => import('../views/ContractDetail.vue')
  },
  {
    path: '/sign/:token',
    name: 'Sign',
    component: () => import('../views/SignContract.vue')
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

export default router
