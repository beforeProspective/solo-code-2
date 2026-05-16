import { createApp } from 'vue'
import { createPinia } from 'pinia'
import Oruga from '@oruga-ui/oruga-next'
import { bulmaConfig } from '@oruga-ui/theme-bulma'
import '@oruga-ui/theme-bulma/dist/bulma.css'
import '@fortawesome/fontawesome-free/css/all.css'
import App from './App.vue'
import router from './router'
import './assets/main.css'

const customConfig = {
  ...bulmaConfig,
  iconPack: 'fas',
  iconComponent: ''
}

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.use(Oruga, customConfig)
app.mount('#app')
