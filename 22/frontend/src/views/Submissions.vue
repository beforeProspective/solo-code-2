<template>
  <div class="submissions-page">
    <div class="header">
      <h2>提交数据 - {{ flowName }}</h2>
      <button class="btn btn-secondary" @click="goBack">返回</button>
    </div>

    <div class="submissions-list" v-if="submissions.length > 0">
      <div class="submission-card" v-for="sub in submissions" :key="sub.id">
        <div class="submission-header">
          <span class="submission-id">#{{ sub.id }}</span>
          <span class="submission-date">{{ formatDate(sub.created_at) }}</span>
        </div>
        <div class="submission-data">
          <div v-for="(value, key) in sub.data" :key="key" class="data-item">
            <span class="data-key">{{ key }}:</span>
            <span class="data-value">{{ value }}</span>
          </div>
        </div>
      </div>
    </div>

    <div class="empty" v-else>
      <p>暂无提交数据</p>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { chatApi, flowApi } from '../api'

const route = useRoute()
const router = useRouter()
const submissions = ref([])
const flowName = ref('')

const loadData = async () => {
  const flowId = route.params.flowId
  try {
    const [subRes, flowRes] = await Promise.all([
      chatApi.getSubmissions(flowId),
      flowApi.get(flowId)
    ])
    submissions.value = subRes.data
    flowName.value = flowRes.data.name
  } catch (e) {
    console.error('加载数据失败', e)
  }
}

const formatDate = (dateStr) => {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleString('zh-CN')
}

const goBack = () => {
  router.push('/')
}

onMounted(() => {
  loadData()
})
</script>

<style scoped>
.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}

.header h2 {
  font-size: 22px;
  color: #1f2937;
}

.submissions-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.submission-card {
  background: white;
  border-radius: 8px;
  padding: 20px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.submission-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid #f3f4f6;
}

.submission-id {
  font-weight: 600;
  color: #4f46e5;
}

.submission-date {
  font-size: 13px;
  color: #9ca3af;
}

.submission-data {
  display: flex;
  flex-wrap: wrap;
  gap: 12px 24px;
}

.data-item {
  display: flex;
  gap: 8px;
}

.data-key {
  color: #6b7280;
  font-weight: 500;
}

.data-value {
  color: #1f2937;
}

.empty {
  text-align: center;
  padding: 60px 20px;
  color: #9ca3af;
}
</style>
