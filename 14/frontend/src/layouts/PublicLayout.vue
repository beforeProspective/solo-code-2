<template>
  <v-app>
    <v-app-bar color="primary" dark app>
      <v-app-bar-title class="d-flex align-center">
        <v-icon class="mr-2">mdi-calendar-star</v-icon>
        <router-link to="/" class="text-decoration-none text-white">
          EventHub
        </router-link>
      </v-app-bar-title>
      <v-spacer></v-spacer>
      <v-btn icon router-link="/">
        <v-icon>mdi-home</v-icon>
      </v-btn>
      <v-btn v-if="isAuthenticated" icon router-link="/dashboard">
        <v-icon>mdi-view-dashboard</v-icon>
      </v-btn>
      <v-btn v-else icon router-link="/login">
        <v-icon>mdi-login</v-icon>
      </v-btn>
    </v-app-bar>
    <v-main>
      <router-view />
    </v-main>
    <v-footer color="grey lighten-3" class="mt-auto">
      <v-container class="text-center">
        <p>&copy; 2024 EventHub - 活动管理与在线售票平台</p>
      </v-container>
    </v-footer>
  </v-app>
</template>

<script setup>
import { useAuthStore } from '../stores/auth'
const { isAuthenticated } = useAuthStore()
</script>
