<template>
  <v-app>
    <v-navigation-drawer v-model="drawer" app color="grey darken-4" dark permanent>
      <v-list-item class="mb-2">
        <v-list-item-avatar size="40">
          <v-icon class="text-primary" size="28">mdi-calendar-star</v-icon>
        </v-list-item-avatar>
        <v-list-item-title class="text-white text-h6 font-bold">
          EventHub
        </v-list-item-title>
      </v-list-item>
      <v-divider class="mb-2"></v-divider>
      <v-list>
        <v-list-item router-link="/dashboard" :exact="true">
          <v-list-item-icon>
            <v-icon>mdi-view-dashboard</v-icon>
          </v-list-item-icon>
          <v-list-item-title>概览</v-list-item-title>
        </v-list-item>
        <v-list-item router-link="/events">
          <v-list-item-icon>
            <v-icon>mdi-calendar-multiple</v-icon>
          </v-list-item-icon>
          <v-list-item-title>活动管理</v-list-item-title>
        </v-list-item>
        <v-list-item router-link="/profile">
          <v-list-item-icon>
            <v-icon>mdi-account</v-icon>
          </v-list-item-icon>
          <v-list-item-title>个人资料</v-list-item-title>
        </v-list-item>
      </v-list>
    </v-navigation-drawer>
    <v-app-bar color="white" app clipped-left>
      <v-app-bar-nav-icon @click.stop="drawer = !drawer"></v-app-bar-nav-icon>
      <v-toolbar-title class="font-weight-medium">活动管理后台</v-toolbar-title>
      <v-spacer></v-spacer>
      <v-btn icon @click="goHome" title="查看公开页面">
        <v-icon>mdi-open-in-new</v-icon>
      </v-btn>
      <v-menu>
        <template v-slot:activator="{ props }">
          <v-btn icon v-bind="props">
            <v-icon>mdi-account-circle</v-icon>
          </v-btn>
        </template>
        <v-list>
          <v-list-item>
            <v-list-item-avatar>
              <v-icon>mdi-account</v-icon>
            </v-list-item-avatar>
            <v-list-item-content>
              <v-list-item-title>{{ user?.name }}</v-list-item-title>
              <v-list-item-subtitle>{{ user?.email }}</v-list-item-subtitle>
            </v-list-item-content>
          </v-list-item>
          <v-divider></v-divider>
          <v-list-item @click="handleLogout">
            <v-list-item-icon>
              <v-icon>mdi-logout</v-icon>
            </v-list-item-icon>
            <v-list-item-title>退出登录</v-list-item-title>
          </v-list-item>
        </v-list>
      </v-menu>
    </v-app-bar>
    <v-main>
      <v-container fluid class="mt-4">
        <router-view />
      </v-container>
    </v-main>
  </v-app>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'

const router = useRouter()
const authStore = useAuthStore()
const drawer = ref(true)

const user = authStore.user

function goHome() {
  window.open('/', '_blank')
}

async function handleLogout() {
  await authStore.logout()
  router.push('/login')
}
</script>
