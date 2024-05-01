import Vue from 'vue'
import VueRouter from 'vue-router'

Vue.use(VueRouter)

const originalPush = VueRouter.prototype.push

VueRouter.prototype.push = function push(location) {
	return originalPush.call(this, location).catch(err => err)
}

export default new VueRouter({
	mode: "history",
	routes: [{
		path: '/',
		component: resolve => require(['../views/piano.vue'], resolve),
		redirect: '/piano'
	}]
})
