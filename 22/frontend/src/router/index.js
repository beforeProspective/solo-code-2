import { createRouter, createWebHistory } from 'vue-router'
import FlowList from '../views/FlowList.vue'
import FlowEditor from '../views/FlowEditor.vue'
import ChatBot from '../views/ChatBot.vue'
import Submissions from '../views/Submissions.vue'

const routes = [
  { path: '/', name: 'FlowList', component: FlowList },
  { path: '/flow/:id', name: 'FlowEditor', component: FlowEditor },
  { path: '/chat', name: 'ChatBot', component: ChatBot },
  { path: '/submissions/:flowId', name: 'Submissions', component: Submissions }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

export default router
