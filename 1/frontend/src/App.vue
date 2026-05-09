<template>
  <div id="app">
    <nav class="navbar">
      <div class="container" style="display: flex; justify-content: space-between; align-items: center;">
        <router-link to="/" class="navbar-brand">🍽️ 备餐日记</router-link>
        <div class="nav-links">
          <router-link to="/ingredients">食材管理</router-link>
          <router-link to="/recipes">菜谱管理</router-link>
          <router-link to="/meal-plan">备餐日历</router-link>
          <router-link to="/shopping-list">购物清单</router-link>
          <router-link to="/consumption">消耗追踪</router-link>
        </div>
      </div>
    </nav>
    <div class="container">
      <router-view />
    </div>
  </div>
</template>

<script setup>
</script>

<style scoped>
</style>
