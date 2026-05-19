import { createRouter, createWebHistory } from 'vue-router'

const routes = [
  {
    path: '/',
    name: 'Home',
    component: () => import('../views/Home.vue')
  },
  {
    path: '/article/:id',
    name: 'ArticleDetail',
    component: () => import('../views/ArticleDetail.vue')
  },
  {
    path: '/categories',
    name: 'Categories',
    component: () => import('../views/Categories.vue')
  },
  {
    path: '/category/:id',
    name: 'CategoryArticles',
    component: () => import('../views/CategoryArticles.vue')
  },
  {
    path: '/tags',
    name: 'Tags',
    component: () => import('../views/Tags.vue')
  },
  {
    path: '/tag/:id',
    name: 'TagArticles',
    component: () => import('../views/TagArticles.vue')
  },
  {
    path: '/login',
    name: 'Login',
    component: () => import('../views/Login.vue')
  },
  {
    path: '/admin',
    name: 'Admin',
    component: () => import('../views/Admin.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/admin/article/new',
    name: 'NewArticle',
    component: () => import('../views/ArticleEdit.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/admin/article/:id/edit',
    name: 'EditArticle',
    component: () => import('../views/ArticleEdit.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/admin/categories',
    name: 'AdminCategories',
    component: () => import('../views/AdminCategories.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/admin/tags',
    name: 'AdminTags',
    component: () => import('../views/AdminTags.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/admin/settings',
    name: 'AdminSettings',
    component: () => import('../views/AdminSettings.vue'),
    meta: { requiresAuth: true }
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

router.beforeEach((to, from, next) => {
  if (to.meta.requiresAuth) {
    const token = localStorage.getItem('admin_token')
    if (token) {
      next()
    } else {
      next('/login')
    }
  } else {
    next()
  }
})

export default router
