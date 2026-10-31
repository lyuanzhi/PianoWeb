module.exports = {
	presets: [
		['@vue/app', {
			// Generators are left as they are: every browser that can run the piano has them,
			// and transforming them would need the regenerator runtime, which is not installed.
			exclude: ['transform-regenerator']
		}]
	]
}
