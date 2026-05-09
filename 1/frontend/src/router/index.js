import { createRouter, createWebHistory } from 'vue-router'
import Ingredients from '../views/Ingredients.vue'
import Recipes from '../views/Recipes.vue'
import MealPlan from '../views/MealPlan.vue'
import ShoppingList from '../views/ShoppingList.vue'
import Consumption from '../views/Consumption.vue'

const routes = [
  {
    path: '/',
    redirect: '/ingredients'
  },
  {
    path: '/ingredients',
    name: 'Ingredients',
    component: Ingredients
  },
  {
    path: '/recipes',
    name: 'Recipes',
    component: Recipes
  },
  {
    path: '/meal-plan',
    name: 'MealPlan',
    component: MealPlan
  },
  {
    path: '/shopping-list',
    name: 'ShoppingList',
    component: ShoppingList
  },
  {
    path: '/consumption',
    name: 'Consumption',
    component: Consumption
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

export default router
