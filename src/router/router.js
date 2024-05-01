import Vue from 'vue'
import Router from 'vue-router'

Vue.use(Router)

export const constantRoutes = [
	{
		path: '/',
		component: () => import('../views/Piano')
	}
]

const routes = [...constantRoutes]

export default new Router({
	routes
})
