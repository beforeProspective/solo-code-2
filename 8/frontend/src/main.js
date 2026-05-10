import { createApp } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import App from './App.vue'
import './style.css'

import Dashboard from './views/Dashboard.vue'
import Customers from './views/Customers.vue'
import Invoices from './views/Invoices.vue'
import InvoiceDetail from './views/InvoiceDetail.vue'
import InvoiceCreate from './views/InvoiceCreate.vue'
import Reminders from './views/Reminders.vue'

const routes = [
  { path: '/', component: Dashboard },
  { path: '/customers', component: Customers },
  { path: '/invoices', component: Invoices },
  { path: '/invoices/create', component: InvoiceCreate },
  { path: '/invoices/:id', component: InvoiceDetail, props: true },
  { path: '/reminders', component: Reminders }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

createApp(App).use(router).mount('#app')
