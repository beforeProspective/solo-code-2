import HomeView from './views/public/HomeView.vue'
import EventDetailView from './views/public/EventDetailView.vue'
import EventRegisterView from './views/public/EventRegisterView.vue'
import OrderSuccessView from './views/public/OrderSuccessView.vue'
import TicketView from './views/public/TicketView.vue'

import LoginView from './views/auth/LoginView.vue'
import RegisterView from './views/auth/RegisterView.vue'

import DashboardView from './views/admin/DashboardView.vue'
import EventsView from './views/admin/EventsView.vue'
import EventEditorView from './views/admin/EventEditorView.vue'
import TicketsView from './views/admin/TicketsView.vue'
import OrdersView from './views/admin/OrdersView.vue'
import OrderDetailView from './views/admin/OrderDetailView.vue'
import EventStatsView from './views/admin/EventStatsView.vue'
import ProfileView from './views/admin/ProfileView.vue'

import AdminLayout from './layouts/AdminLayout.vue'
import PublicLayout from './layouts/PublicLayout.vue'

export const routes = [
  {
    path: '/',
    component: PublicLayout,
    children: [
      { path: '', name: 'home', component: HomeView },
      { path: 'events/:slug', name: 'event-detail', component: EventDetailView },
      { path: 'events/:slug/register', name: 'event-register', component: EventRegisterView },
      { path: 'order/:orderNumber', name: 'order-success', component: OrderSuccessView },
      { path: 'ticket/:ticketCode', name: 'ticket', component: TicketView },
    ]
  },
  {
    path: '/login',
    name: 'login',
    component: LoginView,
    meta: { guest: true }
  },
  {
    path: '/register',
    name: 'register',
    component: RegisterView,
    meta: { guest: true }
  },
  {
    path: '/',
    component: AdminLayout,
    meta: { requiresAuth: true },
    children: [
      { path: 'dashboard', name: 'dashboard', component: DashboardView },
      { path: 'events', name: 'events', component: EventsView },
      { path: 'events/create', name: 'event-create', component: EventEditorView },
      { path: 'events/:id/edit', name: 'event-edit', component: EventEditorView },
      { path: 'events/:eventId/tickets', name: 'tickets', component: TicketsView },
      { path: 'events/:eventId/orders', name: 'orders', component: OrdersView },
      { path: 'events/:eventId/orders/:orderId', name: 'order-detail', component: OrderDetailView },
      { path: 'events/:eventId/stats', name: 'event-stats', component: EventStatsView },
      { path: 'profile', name: 'profile', component: ProfileView },
    ]
  }
]
