<template>
  <el-container style="height: 100vh">
    <el-aside width="220px" style="background-color: #2c3e50; color: white">
      <div style="padding: 20px; text-align: center; border-bottom: 1px solid #34495e">
        <h3 style="color: white; margin: 0">咖啡烘焙管理</h3>
      </div>
      <el-menu
        :default-active="activeMenu"
        background-color="#2c3e50"
        text-color="#bdc3c7"
        active-text-color="#ffffff"
        router
      >
        <el-menu-item index="/beans">
          <el-icon><Coffee /></el-icon>
          <span>生豆库存</span>
        </el-menu-item>
        <el-menu-item index="/roasting">
          <el-icon><TrendCharts /></el-icon>
          <span>烘焙曲线</span>
        </el-menu-item>
        <el-menu-item index="/cupping">
          <el-icon><Cup /></el-icon>
          <span>杯测品鉴</span>
        </el-menu-item>
        <el-menu-item index="/comparison">
          <el-icon><DataLine /></el-icon>
          <span>批次对比</span>
        </el-menu-item>
        <el-menu-item index="/suppliers">
          <el-icon><OfficeBuilding /></el-icon>
          <span>供应商</span>
        </el-menu-item>
        <el-menu-item index="/maintenance">
          <el-icon><Tools /></el-icon>
          <span>维护保养</span>
        </el-menu-item>
      </el-menu>
    </el-aside>
    <el-container>
      <el-main style="background-color: #f5f5f5; overflow-y: auto">
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()
const activeMenu = computed(() => route.path)
</script>

<style>
* {
  margin: 0;
  padding: 0;
}
</style>
