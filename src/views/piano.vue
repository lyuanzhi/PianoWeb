<template>
	<div id="piano">
		<div class="headImage">
			<div class="avatar">
				<div class="avatar_img"></div>
			</div>
			<div class="title" style="z-index:1;">
				<span class="w">w</span>
				<span class="e">e</span>
				<span class="l">l</span>
				<span class="c">c</span>
				<span class="o">o</span>
				<span class="m">m</span>
				<span class="e">e</span>
				<span>&nbsp;&nbsp;</span>
				<span class="t">t</span>
				<span class="o">o</span>
				<span>&nbsp;&nbsp;</span>
				<span class="m">m</span>
				<span class="y">y</span>
				<span>&nbsp;&nbsp;</span>
				<span class="w">w</span>
				<span class="o">o</span>
				<span class="r">r</span>
				<span class="l">l</span>
				<span class="d">d</span>
			</div>
		</div>
		<div class="keyBoard_w">
			<div v-for="(item,index) in whiteKey" :class="{white:true,act:isPressedKey[item - 1]}" :key="index"
				@mouseup="onMouseUp(item)" @mousedown="onMouseDown(item)" @mouseover="onMouseEnter(item)"
				@mouseleave="onMouseLeave(item)"></div>
		</div>
		<div v-for="(item1,index1) in blackKey" @mouseup="onMouseUp(item1)" @mousedown="onMouseDown(item1)"
			@mouseover="onMouseEnter(item1)" @mouseleave="onMouseLeave(item1)"
			:class="{black:true,act:isPressedKey[item1 - 1]}" :style="{left:blackLeft[index1]+'%'}" :key="index1">
		</div>
		<div class="bar">
			<canvas id="canvasBar" :width="windowWidth" :height="Math.round(windowHeight*0.47)"></canvas>
		</div>
		<div ref="audioList">
			<audio v-for="(item2,index2) in keyIndex" :src="'mp3/' + item2 + '.mp3'" :key="index2"></audio>
		</div>
	</div>
</template>

<script>
	export default {
		data() {
			return {
				whiteKey: [1, 3, 4, 6, 8, 9, 11, 13, 15, 16, 18, 20, 21, 23, 25, 27, 28, 30, 32, 33, 35, 37, 39, 40, 42,
					44, 45, 47, 49, 51, 52, 54, 56, 57, 59, 61, 63, 64, 66, 68, 69, 71, 73, 75, 76, 78, 80, 81, 83, 85,
					87, 88
				],
				blackKey: [2, 5, 7, 10, 12, 14, 17, 19, 22, 24, 26, 29, 31, 34, 36, 38, 41, 43, 46, 48, 50, 53, 55, 58, 60,
					62, 65, 67, 70, 72, 74, 77, 79, 82, 84, 86
				],
				keyIndex: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26,
					27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51,
					52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76,
					77, 78, 79, 80, 81, 82, 83, 84, 85, 86, 87, 88
				],
				blackLeft: [2.89, 6.61, 8.47, 12.19, 14.05, 15.91, 19.63, 21.49, 25.21, 27.07, 28.93, 32.65, 34.51, 38.23,
					40.09, 41.95, 45.67, 47.53, 51.25, 53.11, 54.97, 58.69, 60.55, 64.27, 66.13, 67.99, 71.71, 73.57,
					77.29, 79.15, 81.01, 84.73, 86.59, 90.31, 92.17, 94.03
				],
				isPressedKey: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
					0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
					0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
				],
				lastPressedKey: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
					0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
					0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
				],
				code: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
					0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
					0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
					0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
					0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
					0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
					0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
					0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
					0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
				],
				mouseDown: 0,
				canvasBar: null,
				context: null,
				windowWidth: document.documentElement.clientWidth,
				windowHeight: document.documentElement.clientHeight,
				setIntervalFunc: [null, null, null, null, null, null, null, null, null, null, null, null, null, null, null,
					null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null,
					null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null,
					null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null,
					null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null,
					null, null, null, null, null, null, null, null, null
				],
				num: [],
				canvasM1: [
					0.0164, 0.0289, 0.0411, 0.0536, 0.0661, 0.0783, 0.0847, 0.0969, 0.1094, 0.1219, 0.1341, 0.1405,
					0.1527, 0.1591, 0.1713, 0.1838, 0.1963, 0.2085, 0.2149, 0.2271, 0.2396, 0.2521, 0.2643, 0.2707,
					0.2829, 0.2893, 0.3015, 0.3140, 0.3265, 0.3387, 0.3451, 0.3573, 0.3698, 0.3823, 0.3945, 0.4009,
					0.4131, 0.4195, 0.4317, 0.4442, 0.4567, 0.4689, 0.4753, 0.4875, 0.5000, 0.5125, 0.5247, 0.5311,
					0.5433, 0.5497, 0.5619, 0.5744, 0.5869, 0.5991, 0.6055, 0.6177, 0.6302, 0.6427, 0.6549, 0.6613,
					0.6735, 0.6799, 0.6921, 0.7046, 0.7171, 0.7293, 0.7357, 0.7479, 0.7604, 0.7729, 0.7851, 0.7915,
					0.8037, 0.8101, 0.8223, 0.8348, 0.8473, 0.8595, 0.8659, 0.8781, 0.8906, 0.9031, 0.9153, 0.9217,
					0.9339, 0.9403, 0.9525, 0.9650
				],
				canvasM2: [
					0.0125, 0.0122, 0.0125, 0.0125, 0.0122, 0.0064, 0.0122, 0.0125, 0.0125, 0.0122, 0.0064, 0.0122,
					0.0064, 0.0122, 0.0125, 0.0125, 0.0122, 0.0064, 0.0122, 0.0125, 0.0125, 0.0122, 0.0064, 0.0122,
					0.0064, 0.0122, 0.0125, 0.0125, 0.0122, 0.0064, 0.0122, 0.0125, 0.0125, 0.0122, 0.0064, 0.0122,
					0.0064, 0.0122, 0.0125, 0.0125, 0.0122, 0.0064, 0.0122, 0.0125, 0.0125, 0.0122, 0.0064, 0.0122,
					0.0064, 0.0122, 0.0125, 0.0125, 0.0122, 0.0064, 0.0122, 0.0125, 0.0125, 0.0122, 0.0064, 0.0122,
					0.0064, 0.0122, 0.0125, 0.0125, 0.0122, 0.0064, 0.0122, 0.0125, 0.0125, 0.0122, 0.0064, 0.0122,
					0.0064, 0.0122, 0.0125, 0.0125, 0.0122, 0.0064, 0.0122, 0.0125, 0.0125, 0.0122, 0.0064, 0.0122,
					0.0064, 0.0122, 0.0125, 0.0186
				],
				canvasColor: [
					'rgba(255, 182, 193, 1)', 'rgba(173, 216, 230, 1)', 'rgba(255, 255, 224, 1)',
					'rgba(144, 238, 144, 1)', 'rgba(135, 206, 250, 1)', 'rgba(221, 160, 221, 1)',
					'rgba(240, 128, 128, 1)', 'rgba(255, 160, 122, 1)', 'rgba(32, 178, 170, 1)',
					'rgba(255, 218, 185, 1)', 'rgba(211, 211, 211, 1)', 'rgba(0, 191, 255, 1)'
				],
				tempNum: [],
				fadeTime: 500,
				steps: 20
			}
		},
		mounted() {
			let that = this;
			that.initCode();
			for (let i = 0; i < 88; i++) {
				that.num.push([-1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1]);
				that.tempNum.push([-1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1]);
			}

			document.body.onmouseup = function() {
				that.mouseDown = 0;
			}

			document.addEventListener('keydown', (e) => {
				if (that.code[e.keyCode] == 0) {
					return;
				}
				if (that.isPressedKey[that.code[e.keyCode] - 1] == 0) {
					that.$set(that.isPressedKey, that.code[e.keyCode] - 1, 1);
					clearInterval(that.setIntervalFunc[that.code[e.keyCode] - 1]);
					that.$refs.audioList.childNodes[that.code[e.keyCode] - 1].currentTime = 0;
					that.$refs.audioList.childNodes[that.code[e.keyCode] - 1].volume = 1;
					if (that.$refs.audioList.childNodes[that.code[e.keyCode] - 1].paused) {
						that.$refs.audioList.childNodes[that.code[e.keyCode] - 1].play()
							.then(() => {})
							.catch(() => {});
					}
				}
			}, false)

			document.addEventListener('keyup', (e) => {
				if (that.code[e.keyCode] == 0) {
					return;
				}
				that.$set(that.isPressedKey, that.code[e.keyCode] - 1, 0);
				that.fadeAudio(that.code[e.keyCode] - 1);
			}, false);

			window.onresize = () => {
				return (() => {
					that.windowWidth = document.documentElement.clientWidth;
					that.windowHeight = document.documentElement.clientHeight;
				})();
			};

			that.canvasBar = document.querySelector('#canvasBar');
			that.context = that.canvasBar.getContext('2d');

			setInterval(function() {
				that.context.clearRect(0, 0, that.canvasBar.width, that.canvasBar.height);
				for (let i = 0; i < 88; i++) {
					let flag = 0;
					for (let j = 0; j < 20; j++) {
						if (that.num[i][j] != -1) {
							that.animate(i, j);
						} else if (flag == 0 && that.isPressedKey[i] == 1 && that.lastPressedKey[i] == 0) {
							that.animate(i, j);
							flag = 1;
						}
					}
					that.$set(that.lastPressedKey, i, that.isPressedKey[i]);
				}
			}, 12)
		},
		methods: {
			fadeAudio(index) {
				let that = this;
				let audio = that.$refs.audioList.childNodes[index]
				if (!audio) return;
				const fadeStep = audio.volume / that.steps;
				const intervalTime = that.fadeTime / that.steps;
				that.setIntervalFunc[index] = setInterval(() => {
					if (audio.volume > fadeStep) {
						audio.volume -= fadeStep;
					} else {
						audio.volume = 0;
						clearInterval(that.setIntervalFunc[index]);
					}
				}, intervalTime);
			},
			animate(i, j) {
				let that = this;
				if (that.isPressedKey[i] == 1 && that.tempNum[i][j] == -1) {
					if (that.num[i][j] < that.canvasBar.height) {
						that.num[i][j] += 1;
						that.context.fillStyle = that.canvasColor[i % 12];
						that.context.fillRect(
							Math.round(that.canvasM1[i] * that.canvasBar.width),
							that.canvasBar.height - that.num[i][j],
							Math.ceil(that.canvasM2[i] * that.canvasBar.width),
							that.num[i][j]);
					} else {
						that.context.fillStyle = that.canvasColor[i % 12];
						that.context.fillRect(
							Math.round(that.canvasM1[i] * that.canvasBar.width),
							that.canvasBar.height - that.num[i][j],
							Math.ceil(that.canvasM2[i] * that.canvasBar.width),
							that.num[i][j]);
					}
				} else {
					if (that.tempNum[i][j] == -1) {
						that.tempNum[i][j] = that.num[i][j];
					}
					if (that.num[i][j] < that.canvasBar.height) {
						that.num[i][j] += 1;
						that.context.fillStyle = that.canvasColor[i % 12];
						that.context.fillRect(
							Math.round(that.canvasM1[i] * that.canvasBar.width),
							that.canvasBar.height - that.num[i][j],
							Math.ceil(that.canvasM2[i] * that.canvasBar.width),
							that.tempNum[i][j]
						);
					} else if (that.tempNum[i][j] > 0) {
						that.tempNum[i][j] -= 1;
						that.context.fillStyle = that.canvasColor[i % 12];
						that.context.fillRect(
							Math.round(that.canvasM1[i] * that.canvasBar.width),
							that.canvasBar.height - that.num[i][j],
							Math.ceil(that.canvasM2[i] * that.canvasBar.width),
							that.tempNum[i][j]
						);
					} else {
						that.num[i][j] = -1;
						that.tempNum[i][j] = -1;
					}
				}
			},
			onMouseUp(keycode) {
				this.mouseDown = 0;
				this.$set(this.isPressedKey, keycode - 1, 0);
				this.fadeAudio(keycode - 1);
			},
			onMouseDown(keycode) {
				this.mouseDown = 1;
				this.$set(this.isPressedKey, keycode - 1, 1);
				clearInterval(this.setIntervalFunc[keycode - 1]);
				this.$refs.audioList.childNodes[keycode - 1].currentTime = 0;
				this.$refs.audioList.childNodes[keycode - 1].volume = 1;
				if (this.$refs.audioList.childNodes[keycode - 1].paused) {
					this.$refs.audioList.childNodes[keycode - 1].play()
						.then(() => {})
						.catch(() => {});
				}
			},
			onMouseEnter(keycode) {
				if (this.mouseDown == 1) {
					this.$set(this.isPressedKey, keycode - 1, 1);
					clearInterval(this.setIntervalFunc[keycode - 1]);
					this.$refs.audioList.childNodes[keycode - 1].currentTime = 0;
					this.$refs.audioList.childNodes[keycode - 1].volume = 1;
					if (this.$refs.audioList.childNodes[keycode - 1].paused) {
						this.$refs.audioList.childNodes[keycode - 1].play()
							.then(() => {})
							.catch(() => {});
					}
				}
			},
			onMouseLeave(keycode) {
				if (this.mouseDown == 1) {
					this.$set(this.isPressedKey, keycode - 1, 0);
					this.fadeAudio(keycode - 1);
				}
			},
			initCode() {
				let temp = 2;
				this.code[49] = this.whiteKey[0 + temp];
				this.code[50] = this.whiteKey[1 + temp];
				this.code[51] = this.whiteKey[2 + temp];
				this.code[52] = this.whiteKey[3 + temp];
				this.code[53] = this.whiteKey[4 + temp];
				this.code[54] = this.whiteKey[5 + temp];
				this.code[55] = this.whiteKey[6 + temp];
				this.code[56] = this.whiteKey[7 + temp];
				this.code[57] = this.whiteKey[8 + temp];
				this.code[48] = this.whiteKey[9 + temp];
				this.code[189] = this.whiteKey[10 + temp];
				this.code[187] = this.whiteKey[11 + temp];
				this.code[81] = this.whiteKey[12 + temp];
				this.code[87] = this.whiteKey[13 + temp];
				this.code[69] = this.whiteKey[14 + temp];
				this.code[82] = this.whiteKey[15 + temp];
				this.code[84] = this.whiteKey[16 + temp];
				this.code[89] = this.whiteKey[17 + temp];
				this.code[85] = this.whiteKey[18 + temp];
				this.code[73] = this.whiteKey[19 + temp];
				this.code[79] = this.whiteKey[20 + temp];
				this.code[80] = this.whiteKey[21 + temp];
				this.code[219] = this.whiteKey[22 + temp];
				this.code[221] = this.whiteKey[23 + temp];
				this.code[65] = this.whiteKey[24 + temp];
				this.code[83] = this.whiteKey[25 + temp];
				this.code[68] = this.whiteKey[26 + temp];
				this.code[70] = this.whiteKey[27 + temp];
				this.code[71] = this.whiteKey[28 + temp];
				this.code[72] = this.whiteKey[29 + temp];
				this.code[74] = this.whiteKey[30 + temp];
				this.code[75] = this.whiteKey[31 + temp];
				this.code[76] = this.whiteKey[32 + temp];
				this.code[186] = this.whiteKey[33 + temp];
				this.code[222] = this.whiteKey[34 + temp];
				this.code[90] = this.whiteKey[35 + temp];
				this.code[88] = this.whiteKey[36 + temp];
				this.code[67] = this.whiteKey[37 + temp];
				this.code[86] = this.whiteKey[38 + temp];
				this.code[66] = this.whiteKey[39 + temp];
				this.code[78] = this.whiteKey[40 + temp];
				this.code[77] = this.whiteKey[41 + temp];
			}
		}
	}
</script>

<style scoped>
	#piano {
		background-color: #fbebe4;
		background-size: cover;
		height: 100vh;
	}

	#canvasBar {
		position: relative;
		width: 100%;
		height: 100%;
	}

	.bar {
		position: absolute;
		top: 36vh;
		width: 100%;
		height: 47vh;
	}

	.black {
		position: absolute;
		width: 1.22vw;
		height: 9.4vh;
		background-color: #000000;
		border: 1px solid rgba(0, 0, 0, 0.5);
		box-sizing: border-box;
		border-radius: 4px;
		bottom: 7.6vh;
		touch-action: none;
		cursor: default;
		-webkit-user-select: none;
		-webkit-user-drag: none;
	}

	.keyBoard_w {
		position: absolute;
		bottom: 0px;
		display: flex;
		justify-content: center;
		touch-action: none;
		cursor: default;
		-webkit-user-select: none;
		-webkit-user-drag: none;
		height: 15vh;
		width: 100vw;
		margin-bottom: 2vh;
	}

	.white {
		position: relative;
		width: 1.86vw;
		height: 100%;
		background-color: #ffffff;
		border: 1px solid rgba(0, 0, 0, 0.16);
		box-sizing: border-box;
		border-radius: 4px;
	}

	.act {
		background-color: #25a246;
		border: 1px solid rgba(0, 0, 0, 0.25);
	}

	.title {
		font-size: 7vw;
		display: flex;
		align-items: center;
		justify-content: center;
		color: #fbebe4;
		font-family: "comic sans ms";
		user-select: none;
	}

	.headImage {
		background: url(../assets/world.jpg) center/cover no-repeat;
		height: 36vh;
		margin-bottom: 120px;
		display: flex;
		justify-content: center;
		align-items: center;
	}

	.avatar {
		position: absolute;
		top: 20px;
		left: 20px;
	}

	.avatar_img {
		background: url(../assets/avatar.png) center/100%;
		height: 5vw;
		width: 5vw;
		border-radius: 50%;
		transition: background-size 1s;
		animation: avatar_img 5s linear infinite;
	}

	@keyframes avatar_img {
		0% {
			transform: rotate(0deg);
		}

		50% {
			transform: rotate(180deg);
		}

		100% {
			transform: rotate(360deg);
		}
	}

	.avatar_img:hover {
		background-size: 140%;
	}

	.w,
	.e,
	.l,
	.c,
	.o,
	.m,
	.t,
	.y,
	.r,
	.d {
		transition: color 0.6s;
	}

	.w:hover,
	.e:hover,
	.l:hover,
	.c:hover,
	.m:hover,
	.t:hover,
	.y:hover,
	.r:hover,
	.d:hover {
		color: #ffc96c;
	}

	.o:hover {
		color: #aaaaff;
	}
</style>
