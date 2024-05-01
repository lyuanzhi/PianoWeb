<template>
	<div id="app">
		<keep-alive>
			<router-view></router-view>
		</keep-alive>
	</div>
</template>

<script>
	export default {
		name: 'App',
		data() {
			return {}
		},
		mounted() {
			this.$router.push({
				path: "/piano"
			})
		}
	}
</script>

<style>
	body {
		margin: 0;
	}

	#app {
		font-family: Helvetica, sans-serif;
		text-align: center;
	}
</style>
