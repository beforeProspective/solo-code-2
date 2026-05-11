<template>
  <div class="boms-view">
    <h2 class="page-title">BOM 管理</h2>
    
    <div class="page-actions">
      <Button label="创建 BOM" icon="pi pi-plus" @click="router.push('/boms/new')" />
    </div>
    
    <div class="table-section">
      <DataTable :value="boms" :loading="loading" stripedRows>
        <Column field="id" header="ID" style="width: 80px;" />
        <Column field="name" header="名称" />
        <Column field="project_name" header="项目" />
        <Column field="item_count" header="元件数量" />
        <Column field="created_by_name" header="创建者" />
        <Column field="created_at" header="创建时间" />
      </DataTable>
    </div>
    
    <ConfirmDialog />
    <Toast />
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useToast } from 'primevue/usetoast'
import { useConfirm } from 'primevue/useconfirm'
import { bomApi } from '@/api'
import Button from 'primevue/button'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import ConfirmDialog from 'primevue/confirmdialog'
import Toast from 'primevue/toast'

const router = useRouter()
const toast = useToast()
const confirm = useConfirm()

const boms = ref([])
const loading = ref(false)

const loadBoms = async () => {
  loading.value = true
  try {
    const response = await bomApi.getAll({ perPage: 100 })
    boms.value = response.data.data
  } catch (error) {
    toast.add({ severity: 'error', summary: '加载失败' })
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  loadBoms()
})
</script>

<style scoped>
.boms-view {
  padding: 0;
}

.page-title {
  margin: 0 0 1.5rem;
  color: #333;
  font-size: 1.75rem;
}

.page-actions {
  margin-bottom: 1.5rem;
}

.table-section {
  background: white;
  border-radius: 12px;
  padding: 1.5rem;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}
</style>
