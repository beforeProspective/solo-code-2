<template>
  <div class="contract-detail">
    <el-button @click="$router.push('/contracts')" style="margin-bottom: 20px">
      <el-icon><ArrowLeft /></el-icon>
      返回列表
    </el-button>

    <el-card v-if="contract" class="detail-card">
      <template #header>
        <div class="card-header">
          <h2>
            <el-icon color="#409EFF"><Document /></el-icon>
            {{ contract.title }}
          </h2>
          <el-tag :type="getStatusType(contract.status)" size="large">
            {{ getStatusText(contract.status) }}
          </el-tag>
        </div>
      </template>

      <el-descriptions :column="2" border>
        <el-descriptions-item label="文件名">
          {{ contract.original_filename }}
        </el-descriptions-item>
        <el-descriptions-item label="总页数">
          {{ contract.total_pages }} 页
        </el-descriptions-item>
        <el-descriptions-item label="创建时间">
          {{ formatDate(contract.created_at) }}
        </el-descriptions-item>
        <el-descriptions-item label="状态">
          <el-tag :type="getStatusType(contract.status)">
            {{ getStatusText(contract.status) }}
          </el-tag>
        </el-descriptions-item>
      </el-descriptions>

      <el-divider />

      <h3>签署人信息</h3>
      <el-table :data="contract.signers" style="margin-bottom: 20px">
        <el-table-column prop="name" label="姓名" width="150" />
        <el-table-column prop="email" label="邮箱" />
        <el-table-column label="签署状态" width="120">
          <template #default="{ row }">
            <el-tag :type="row.signed ? 'success' : 'warning'">
              {{ row.signed ? '已签署' : '待签署' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="签署时间" width="180">
          <template #default="{ row }">
            {{ row.signed_at ? formatDate(row.signed_at) : '-' }}
          </template>
        </el-table-column>
        <el-table-column label="签署链接">
          <template #default="{ row }">
            <div class="link-row">
              <el-input :value="getSignUrl(row.sign_token)" readonly size="small" />
              <el-button 
                size="small" 
                type="primary"
                @click="copyLink(row.sign_token)"
              >
                <el-icon><CopyDocument /></el-icon>
                复制
              </el-button>
            </div>
          </template>
        </el-table-column>
      </el-table>

      <div class="actions">
        <el-button 
          v-if="contract.status === 'draft'"
          type="primary" 
          size="large"
          @click="$router.push(`/contracts/${contract.id}/setup`)"
        >
          <el-icon><Setting /></el-icon>
          设置签署
        </el-button>
        <template v-if="contract.status === 'pending'">
          <el-button
            v-for="signer in contract.signers"
            :key="signer.id"
            type="warning"
            size="large"
            :disabled="signer.signed"
            @click="openSignPage(signer.sign_token)"
          >
            <el-icon v-if="!signer.signed"><EditPen /></el-icon>
            <el-icon v-else><Check /></el-icon>
            {{ signer.name }}{{ signer.signed ? ' (已签)' : ' - 签署' }}
          </el-button>
        </template>
        <el-button
          v-if="contract.status === 'signed'"
          type="success"
          size="large"
          @click="downloadContract"
        >
          <el-icon><Download /></el-icon>
          下载已签署合同
        </el-button>
      </div>
    </el-card>

    <el-skeleton v-else :rows="10" animated />
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { contractApi } from '../api'

const route = useRoute()
const router = useRouter()
const contractId = route.params.id
const contract = ref(null)

const loadContract = async () => {
  try {
    const res = await contractApi.get(contractId)
    contract.value = res.data
  } catch (err) {
    ElMessage.error('加载合同详情失败')
  }
}

const getStatusType = (status) => {
  const map = { draft: 'info', pending: 'warning', signed: 'success' }
  return map[status] || 'info'
}

const getStatusText = (status) => {
  const map = { draft: '草稿', pending: '待签署', signed: '已完成' }
  return map[status] || status
}

const formatDate = (dateStr) => {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleString('zh-CN')
}

const getSignUrl = (token) => {
  return `${window.location.origin}/sign/${token}`
}

const copyLink = async (token) => {
  const url = getSignUrl(token)
  try {
    await navigator.clipboard.writeText(url)
    ElMessage.success('链接已复制到剪贴板')
  } catch (err) {
    ElMessage.error('复制失败，请手动复制')
  }
}

const openSignPage = (token) => {
  window.open(`/sign/${token}`, '_blank')
}

const downloadContract = async () => {
  try {
    const res = await contractApi.download(contractId)
    const url = window.URL.createObjectURL(new Blob([res.data]))
    const link = document.createElement('a')
    link.href = url
    link.download = `signed_${contract.value.original_filename}`
    link.click()
    window.URL.revokeObjectURL(url)
    ElMessage.success('下载成功')
  } catch (err) {
    ElMessage.error(err.response?.data?.detail || '下载失败')
  }
}

onMounted(loadContract)
</script>

<style scoped>
.contract-detail {
  max-width: 1000px;
  margin: 0 auto;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.card-header h2 {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0;
  font-size: 20px;
}

h3 {
  margin: 20px 0 15px;
  font-size: 16px;
}

.link-row {
  display: flex;
  gap: 8px;
  width: 100%;
}

.link-row .el-input {
  flex: 1;
}

.actions {
  display: flex;
  gap: 12px;
  justify-content: center;
  margin-top: 20px;
}
</style>
