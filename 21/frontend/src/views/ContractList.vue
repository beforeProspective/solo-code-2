<template>
  <div class="contract-list">
    <div class="page-header">
      <h2>
        <el-icon color="#409EFF"><Document /></el-icon>
        合同管理
      </h2>
      <el-button type="primary" @click="$router.push('/upload')">
        <el-icon><Plus /></el-icon>
        上传新合同
      </el-button>
    </div>

    <el-card>
      <el-table :data="contracts" v-loading="loading" empty-text="暂无合同">
        <el-table-column prop="id" label="ID" width="80" />
        <el-table-column prop="title" label="合同标题" min-width="200" />
        <el-table-column prop="original_filename" label="文件名" min-width="200" />
        <el-table-column label="状态" width="120">
          <template #default="{ row }">
            <el-tag :type="getStatusType(row.status)">
              {{ getStatusText(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="创建时间" width="180">
          <template #default="{ row }">
            {{ formatDate(row.created_at) }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="380" fixed="right">
          <template #default="{ row }">
            <el-button size="small" @click="viewDetail(row.id)">
              详情
            </el-button>
            <el-button 
              v-if="row.status === 'draft'"
              type="primary" 
              size="small" 
              @click="setupContract(row.id)"
            >
              设置签署
            </el-button>
            <el-button
              v-if="row.status === 'pending'"
              type="warning"
              size="small"
              @click="viewDetail(row.id)"
            >
              复制签署链接
            </el-button>
            <el-button
              v-if="row.status === 'signed'"
              type="success"
              size="small"
              @click="downloadContract(row.id)"
            >
              <el-icon><Download /></el-icon>
              下载
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { contractApi } from '../api'

const router = useRouter()
const loading = ref(false)
const contracts = ref([])

const loadContracts = async () => {
  loading.value = true
  try {
    const res = await contractApi.list()
    contracts.value = res.data
  } catch (err) {
    ElMessage.error('加载合同列表失败')
  } finally {
    loading.value = false
  }
}

const getStatusType = (status) => {
  const map = {
    draft: 'info',
    pending: 'warning',
    signed: 'success'
  }
  return map[status] || 'info'
}

const getStatusText = (status) => {
  const map = {
    draft: '草稿',
    pending: '待签署',
    signed: '已完成'
  }
  return map[status] || status
}

const formatDate = (dateStr) => {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleString('zh-CN')
}

const viewDetail = (id) => {
  router.push(`/contracts/${id}`)
}

const setupContract = (id) => {
  router.push(`/contracts/${id}/setup`)
}

const downloadContract = async (id) => {
  try {
    const res = await contractApi.download(id)
    const url = window.URL.createObjectURL(new Blob([res.data]))
    const link = document.createElement('a')
    link.href = url
    link.download = `signed_contract_${id}.pdf`
    link.click()
    window.URL.revokeObjectURL(url)
    ElMessage.success('下载成功')
  } catch (err) {
    ElMessage.error(err.response?.data?.detail || '下载失败')
  }
}

onMounted(loadContracts)
</script>

<style scoped>
.contract-list {
  max-width: 1200px;
  margin: 0 auto;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.page-header h2 {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0;
  font-size: 24px;
}
</style>
