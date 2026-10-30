<template>
	<div id="app">
		<keep-alive>
			<router-view></router-view>
		</keep-alive>
	</div>
</template>

<script>
	export default {
		name: 'App'
	}
</script>

<style>
	body {
		margin: 0;
		background: #e7decb;
		-webkit-font-smoothing: antialiased;
		-moz-osx-font-smoothing: grayscale;
	}

	#app {
		font-family: -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", Helvetica, sans-serif;
		text-align: center;
	}
</style>
