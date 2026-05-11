<template>
  <div class="suppliers-view">
    <h2 class="page-title">供应商管理</h2>
    
    <div class="page-actions">
      <Button label="添加供应商" icon="pi pi-plus" @click="router.push('/suppliers/new')" />
    </div>
    
    <div class="table-section">
      <DataTable :value="suppliers" :loading="loading" stripedRows>
        <Column field="id" header="ID" style="width: 80px;" />
        <Column field="name" header="名称" />
        <Column field="contact_person" header="联系人" />
        <Column field="phone" header="电话" />
        <Column field="email" header="邮箱" />
        <Column field="website" header="网站" />
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
import { supplierApi } from '@/api'
import Button from 'primevue/button'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import ConfirmDialog from 'primevue/confirmdialog'
import Toast from 'primevue/toast'

const router = useRouter()
const toast = useToast()
const confirm = useConfirm()

const suppliers = ref([])
const loading = ref(false)

const loadSuppliers = async () => {
  loading.value = true
  try {
    const response = await supplierApi.getAll({ perPage: 100 })
    suppliers.value = response.data.data
  } catch (error) {
    toast.add({ severity: 'error', summary: '加载失败', detail: '无法加载供应商列表' })
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  loadSuppliers()
})
</script>

<style scoped>
.suppliers-view {
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
