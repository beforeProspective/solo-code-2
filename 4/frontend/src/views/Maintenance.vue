<template>
  <div class="maintenance-page">
    <el-tabs v-model="activeTab">
      <el-tab-pane label="烘焙机管理" name="roasters">
        <el-card>
          <template #header>
            <div class="card-header">
              <span>烘焙机列表</span>
              <el-button type="primary" @click="openRoasterDialog">
                <el-icon><Plus /></el-icon>
                新增烘焙机
              </el-button>
            </div>
          </template>
          <el-table :data="roastersList" stripe border>
            <el-table-column prop="name" label="名称" min-width="150" />
            <el-table-column prop="brand" label="品牌" width="120" />
            <el-table-column prop="model" label="型号" width="150" />
            <el-table-column prop="capacity" label="容量" width="120" />
            <el-table-column prop="serial_number" label="序列号" width="180" />
            <el-table-column prop="purchase_date" label="购买日期" width="120" />
            <el-table-column label="操作" width="200" fixed="right">
              <template #default="{ row }">
                <el-button type="primary" link @click="viewRecords(row)">查看记录</el-button>
                <el-button type="primary" link @click="editRoaster(row)">编辑</el-button>
                <el-button type="danger" link @click="deleteRoaster(row)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-tab-pane>

      <el-tab-pane label="维护记录" name="records">
        <el-card>
          <template #header>
            <div class="card-header">
              <span>维护保养记录</span>
              <el-button type="primary" @click="openRecordDialog">
                <el-icon><Plus /></el-icon>
                新增维护记录
              </el-button>
            </div>
          </template>
          <el-table :data="recordsList" stripe border>
            <el-table-column prop="roaster_name" label="烘焙机" width="150" />
            <el-table-column prop="maintenance_type_display" label="维护类型" width="120">
              <template #default="{ row }">
                <el-tag>{{ row.maintenance_type_display }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="maintenance_date" label="维护日期" width="160">
              <template #default="{ row }">
                {{ formatDate(row.maintenance_date) }}
              </template>
            </el-table-column>
            <el-table-column prop="technician" label="技术员" width="120" />
            <el-table-column prop="description" label="描述" min-width="200" show-overflow-tooltip />
            <el-table-column prop="cost" label="费用(元)" width="100">
              <template #default="{ row }">
                {{ row.cost ? Number(row.cost).toFixed(2) : '-' }}
              </template>
            </el-table-column>
            <el-table-column prop="next_maintenance_date" label="下次维护" width="120" />
            <el-table-column label="操作" width="200" fixed="right">
              <template #default="{ row }">
                <el-button type="primary" link @click="editRecord(row)">编辑</el-button>
                <el-button type="danger" link @click="deleteRecord(row)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-tab-pane>
    </el-tabs>

    <el-dialog
      v-model="roasterDialogVisible"
      :title="isEditRoaster ? '编辑烘焙机' : '新增烘焙机'"
      width="500px"
    >
      <el-form :model="roasterForm" label-width="100px">
        <el-form-item label="名称" required>
          <el-input v-model="roasterForm.name" />
        </el-form-item>
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="品牌">
              <el-input v-model="roasterForm.brand" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="型号">
              <el-input v-model="roasterForm.model" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="容量">
              <el-input v-model="roasterForm.capacity" placeholder="例如：500g" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="序列号">
              <el-input v-model="roasterForm.serial_number" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="购买日期">
          <el-date-picker
            v-model="roasterForm.purchase_date"
            type="date"
            value-format="YYYY-MM-DD"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="备注">
          <el-input type="textarea" v-model="roasterForm.notes" :rows="3" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="roasterDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="saveRoaster">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="recordDialogVisible"
      :title="isEditRecord ? '编辑维护记录' : '新增维护记录'"
      width="600px"
    >
      <el-form :model="recordForm" label-width="120px">
        <el-form-item label="烘焙机" required>
          <el-select v-model="recordForm.roaster" placeholder="请选择" style="width: 100%">
            <el-option
              v-for="roaster in roastersList"
              :key="roaster.id"
              :label="roaster.name"
              :value="roaster.id"
            />
          </el-select>
        </el-form-item>
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="维护类型" required>
              <el-select v-model="recordForm.maintenance_type" placeholder="请选择" style="width: 100%">
                <el-option label="清洁" value="cleaning" />
                <el-option label="校准" value="calibration" />
                <el-option label="维修" value="repair" />
                <el-option label="检查" value="inspection" />
                <el-option label="零件更换" value="replacement" />
                <el-option label="其他" value="other" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="维护日期" required>
              <el-date-picker
                v-model="recordForm.maintenance_date"
                type="datetime"
                value-format="YYYY-MM-DDTHH:mm:ss"
                style="width: 100%"
              />
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="技术员">
          <el-input v-model="recordForm.technician" />
        </el-form-item>
        <el-form-item label="维护描述" required>
          <el-input type="textarea" v-model="recordForm.description" :rows="3" />
        </el-form-item>
        <el-form-item label="更换零件">
          <el-input type="textarea" v-model="recordForm.parts_replaced" :rows="2" />
        </el-form-item>
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="费用(元)">
              <el-input-number v-model="recordForm.cost" :precision="2" :min="0" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="下次维护日期">
              <el-date-picker
                v-model="recordForm.next_maintenance_date"
                type="date"
                value-format="YYYY-MM-DD"
                style="width: 100%"
              />
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="备注">
          <el-input type="textarea" v-model="recordForm.notes" :rows="3" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="recordDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="saveRecord">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { maintenanceAPI } from '../api'

const activeTab = ref('roasters')
const roastersList = ref([])
const recordsList = ref([])

const roasterDialogVisible = ref(false)
const recordDialogVisible = ref(false)
const isEditRoaster = ref(false)
const isEditRecord = ref(false)
const currentRoasterId = ref(null)
const currentRecordId = ref(null)

const roasterForm = reactive({
  name: '',
  brand: '',
  model: '',
  capacity: '',
  serial_number: '',
  purchase_date: null,
  notes: ''
})

const recordForm = reactive({
  roaster: null,
  maintenance_type: '',
  maintenance_date: '',
  technician: '',
  description: '',
  parts_replaced: '',
  cost: null,
  next_maintenance_date: null,
  notes: ''
})

const formatDate = (dateStr) => {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleString('zh-CN')
}

const loadData = async () => {
  try {
    const [roastersRes, recordsRes] = await Promise.all([
      maintenanceAPI.getRoasters(),
      maintenanceAPI.getRecords()
    ])
    roastersList.value = roastersRes.data.results || roastersRes.data
    recordsList.value = recordsRes.data.results || recordsRes.data
  } catch (error) {
    ElMessage.error('加载数据失败')
  }
}

const openRoasterDialog = () => {
  resetRoasterForm()
  isEditRoaster.value = false
  roasterDialogVisible.value = true
}

const editRoaster = (row) => {
  resetRoasterForm()
  isEditRoaster.value = true
  currentRoasterId.value = row.id
  Object.assign(roasterForm, row)
  roasterDialogVisible.value = true
}

const resetRoasterForm = () => {
  Object.assign(roasterForm, {
    name: '',
    brand: '',
    model: '',
    capacity: '',
    serial_number: '',
    purchase_date: null,
    notes: ''
  })
}

const saveRoaster = async () => {
  try {
    if (!roasterForm.name) {
      ElMessage.warning('请填写烘焙机名称')
      return
    }
    if (isEditRoaster.value) {
      await maintenanceAPI.updateRoaster(currentRoasterId.value, roasterForm)
      ElMessage.success('更新成功')
    } else {
      await maintenanceAPI.createRoaster(roasterForm)
      ElMessage.success('创建成功')
    }
    roasterDialogVisible.value = false
    loadData()
  } catch (error) {
    ElMessage.error('保存失败')
  }
}

const deleteRoaster = async (row) => {
  try {
    await ElMessageBox.confirm(`确定要删除烘焙机 ${row.name} 吗？`, '提示', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning'
    })
    await maintenanceAPI.deleteRoaster(row.id)
    ElMessage.success('删除成功')
    loadData()
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error('删除失败')
    }
  }
}

const openRecordDialog = () => {
  resetRecordForm()
  isEditRecord.value = false
  recordDialogVisible.value = true
}

const viewRecords = (row) => {
  activeTab.value = 'records'
}

const editRecord = (row) => {
  resetRecordForm()
  isEditRecord.value = true
  currentRecordId.value = row.id
  Object.assign(recordForm, row)
  recordForm.roaster = row.roaster
  recordDialogVisible.value = true
}

const resetRecordForm = () => {
  Object.assign(recordForm, {
    roaster: null,
    maintenance_type: '',
    maintenance_date: '',
    technician: '',
    description: '',
    parts_replaced: '',
    cost: null,
    next_maintenance_date: null,
    notes: ''
  })
}

const saveRecord = async () => {
  try {
    if (!recordForm.roaster || !recordForm.maintenance_type || !recordForm.maintenance_date || !recordForm.description) {
      ElMessage.warning('请填写必填字段')
      return
    }
    if (isEditRecord.value) {
      await maintenanceAPI.updateRecord(currentRecordId.value, recordForm)
      ElMessage.success('更新成功')
    } else {
      await maintenanceAPI.createRecord(recordForm)
      ElMessage.success('创建成功')
    }
    recordDialogVisible.value = false
    loadData()
  } catch (error) {
    ElMessage.error('保存失败')
  }
}

const deleteRecord = async (row) => {
  try {
    await ElMessageBox.confirm('确定要删除该维护记录吗？', '提示', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning'
    })
    await maintenanceAPI.deleteRecord(row.id)
    ElMessage.success('删除成功')
    loadData()
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error('删除失败')
    }
  }
}

onMounted(() => {
  loadData()
})
</script>

<style scoped>
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
</style>
