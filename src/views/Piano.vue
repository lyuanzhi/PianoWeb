<template>
	<div id="piano">
		<div class="paper" :style="{backgroundImage: paperImage}"></div>
		<svg class="defs" width="0" height="0" aria-hidden="true">
			<filter id="rough">
				<feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="2" seed="3" />
				<feDisplacementMap in="SourceGraphic" scale="2.4" />
			</filter>
		</svg>
		<canvas class="sky" ref="sky"></canvas>
		<canvas class="land" ref="land"></canvas>
		<canvas class="mist" ref="mist"></canvas>
		<canvas class="fx" ref="fx"></canvas>
		<div class="vignette"></div>
		<div class="stage">
			<span class="seal">琴</span>
		</div>
		<div class="case">
			<div class="keyBoard" ref="keyboard" :style="{height: keyboardHeight + 'px'}" @contextmenu.prevent>
				<div v-for="item in whiteKey" :class="{white: true, act: isPressedKey[item - 1]}" :key="item"
					:style="keyStyle[item - 1]" @mouseup="onMouseUp(item)" @mousedown="onMouseDown(item, $event)"
					@mouseover="onMouseEnter(item, $event)" @mouseleave="onMouseLeave(item)"></div>
				<div v-for="item in blackKey" :class="{black: true, act: isPressedKey[item - 1]}" :key="item"
					:style="keyStyle[item - 1]" @mouseup="onMouseUp(item)" @mousedown="onMouseDown(item, $event)"
					@mouseover="onMouseEnter(item, $event)" @mouseleave="onMouseLeave(item)"></div>
			</div>
		</div>
	</div>
</template>

<script>
	import {INK, PAPER, mulberry32, valueNoise, rgba, smoothstep, makePaper, makeInkSprite} from './ink.js';
	import InkScene, {SKY_SCALE, LAND_PAD, LAND_SWAY} from './inkScene.js';
	import PianoSound from './pianoSound.js';

	const KEY_COUNT = 88;
	const WHITE_COUNT = 52;
	// how fast strokes float up once released, in css px per second
	const SPEED = 100;
	// seconds for a released stroke to spread out like ink dropped in water
	const DIFFUSE_TIME = 3.5;

	// Key 1 is A0. Every key gets its position as a fraction of the keyboard width,
	// and bass notes get broader, darker strokes than treble notes.
	function buildKeys() {
		let keys = {
			whiteKey: [],
			blackKey: [],
			keyStyle: [],
			keyGeo: []
		};
		for (let n = 1; n <= KEY_COUNT; n++) {
			let t = (n - 1) / (KEY_COUNT - 1);
			let style = {'--i': n - 1};
			let whiteBefore = keys.whiteKey.length;
			let geo = {weight: 0.74 - 0.34 * t, ink: 0.9 - 0.34 * t};
			if ([1, 3, 6, 8, 10].indexOf((n + 20) % 12) == -1) {
				geo.center = (whiteBefore + 0.5) / WHITE_COUNT;
				keys.whiteKey.push(n);
			} else {
				geo.center = whiteBefore / WHITE_COUNT;
				geo.weight *= 0.85;
				style.left = whiteBefore / WHITE_COUNT * 100 + '%';
				keys.blackKey.push(n);
			}
			keys.keyGeo.push(geo);
			keys.keyStyle.push(style);
		}
		return keys;
	}

	const keys = buildKeys();

	export default {
		name: 'Piano',
		data() {
			return {
				paperImage: '',
				whiteKey: keys.whiteKey,
				blackKey: keys.blackKey,
				keyStyle: keys.keyStyle,
				isPressedKey: new Array(KEY_COUNT).fill(0),
				code: new Array(256).fill(0),
				mouseDown: 0,
				keyboardHeight: 160
			}
		},
		created() {
			let paper = makePaper(320);
			this.paperImage = 'url(' + paper.toDataURL('image/png') + ')';
			// everything the canvases read each frame stays out of Vue's reactivity
			this.keyGeo = keys.keyGeo;
			this.notes = [];
			this.blooms = [];
			this.drops = [];
			this.layout = null;
			this.mouse = {x: 0, y: 0, tx: 0, ty: 0};
			this.reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
			this.inkSprites = [1, 2, 3, 4].map((seed) => makeInkSprite(64, seed, false));
			this.bloomSprite = makeInkSprite(128, 9, true);
			this.flow = valueNoise(mulberry32(99), 64);
			this.scene = new InkScene(this.inkSprites[0]);
			this.sound = new PianoSound();
		},
		mounted() {
			let that = this;
			that.initCode();

			window.addEventListener('mouseup', () => {
				that.mouseDown = 0;
			});

			// sound may only start after a gesture; on iOS a tap's touchend is the one that counts
			['touchend', 'mousedown', 'keydown'].forEach((type) => {
				window.addEventListener(type, () => that.sound.unlock(), true);
			});

			// unmapped keys, and the 229 an input method sends while composing, map to nothing
			document.addEventListener('keydown', (e) => {
				let key = that.code[e.keyCode];
				if (!key) {
					return;
				}
				if (that.isPressedKey[key - 1] == 0) {
					that.pressKey(key);
				}
			}, false);

			document.addEventListener('keyup', (e) => {
				let key = that.code[e.keyCode];
				if (!key) {
					return;
				}
				that.releaseKey(key);
			}, false);

			// keyup and mouseup never arrive once the window has lost focus, so let go of everything then
			window.addEventListener('blur', that.releaseAll);
			document.addEventListener('visibilitychange', () => {
				if (document.hidden) that.releaseAll();
			});

			window.addEventListener('mousemove', (e) => {
				that.mouse.tx = e.clientX / window.innerWidth - 0.5;
				that.mouse.ty = e.clientY / window.innerHeight - 0.5;
			});

			that.skyContext = that.$refs.sky.getContext('2d');
			that.landContext = that.$refs.land.getContext('2d');
			that.mistContext = that.$refs.mist.getContext('2d');
			that.fxContext = that.$refs.fx.getContext('2d');
			window.addEventListener('resize', that.onResize);
			that.onResize();
			that.startTime = performance.now();
			that.lastFrame = that.startTime;
			requestAnimationFrame(that.frame);
		},
		methods: {
			pressKey(keycode) {
				let index = keycode - 1;
				this.$set(this.isPressedKey, index, 1);
				this.sound.play(keycode);
				this.endNote(index);
				this.notes.push({key: index, start: performance.now(), end: null, seed: Math.floor(Math.random() * 100)});
				this.splash(index);
				let layout = this.layout;
				let center = this.keyGeo[index].center;
				this.scene.press(index, layout ? (layout.left + center * layout.width) / layout.W : center);
			},
			releaseKey(keycode) {
				this.$set(this.isPressedKey, keycode - 1, 0);
				this.sound.release(keycode);
				this.endNote(keycode - 1);
				this.scene.release(keycode - 1);
			},
			releaseAll() {
				this.mouseDown = 0;
				this.isPressedKey.forEach((pressed, index) => {
					if (pressed) this.releaseKey(index + 1);
				});
			},
			endNote(index) {
				let now = performance.now();
				this.notes.forEach((note) => {
					if (note.key == index && note.end == null) {
						note.end = now;
					}
				});
			},
			splash(index) {
				let layout = this.layout;
				if (!layout) return;
				let geo = this.keyGeo[index];
				let x = layout.left + geo.center * layout.width;
				this.blooms.push({x, start: performance.now(), size: layout.whiteWidth * geo.weight * 4, ink: geo.ink});
				if (this.reducedMotion) return;
				let count = 3 + Math.floor(Math.random() * 4);
				for (let i = 0; i < count; i++) {
					let angle = -Math.PI / 2 + (Math.random() - 0.5) * 1.6;
					let speed = 120 + Math.random() * 260;
					this.drops.push({
						x,
						y: layout.horizon - 4,
						vx: Math.cos(angle) * speed,
						vy: Math.sin(angle) * speed,
						life: 0,
						maxLife: 0.5 + Math.random() * 0.5,
						size: 2 + Math.random() * 3.5 * geo.weight
					});
				}
			},
			onResize() {
				let piano = this.$el;
				let keyboard = this.$refs.keyboard;
				this.keyboardHeight = Math.round(Math.max(72, Math.min(keyboard.clientWidth / WHITE_COUNT * 6, piano.clientHeight * 0.3)));
				this.$nextTick(() => {
					let base = piano.getBoundingClientRect();
					let rect = keyboard.getBoundingClientRect();
					let horizon = rect.top - base.top;
					this.layout = {
						W: piano.clientWidth,
						H: piano.clientHeight,
						left: rect.left - base.left,
						width: rect.width,
						whiteWidth: rect.width / WHITE_COUNT,
						horizon,
						fadeTop: 40,
						fadeBottom: Math.max(horizon * 0.65, 41)
					};
					let pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
					// the land is redrawn only when it changes, but it is big, so it is kept a little coarser
					let landScale = Math.min(pixelRatio, 1.5);
					this.scene.resize({W: this.layout.W, H: this.layout.H, horizon, pixelRatio, landScale});
					this.horizonLine = this.makeHorizonLine();
					this.sizeCanvas(this.$refs.sky, this.skyContext, SKY_SCALE);
					this.sizeCanvas(this.$refs.land, this.landContext, landScale, LAND_PAD);
					this.sizeCanvas(this.$refs.mist, this.mistContext, SKY_SCALE);
					this.sizeCanvas(this.$refs.fx, this.fxContext, pixelRatio);
				});
			},
			// pad: extra room around the edges, in css px, for a layer that moves with the mouse
			sizeCanvas(canvas, ctx, scale, pad) {
				pad = pad || 0;
				canvas.width = Math.round((this.layout.W + pad * 2) * scale);
				canvas.height = Math.round((this.layout.H + pad * 2) * scale);
				ctx.setTransform(scale, 0, 0, scale, pad * scale, pad * scale);
			},
			// a single dry brush line along the top of the keys, painted once per resize
			makeHorizonLine() {
				let layout = this.layout;
				let scale = Math.min(window.devicePixelRatio || 1, 2);
				let canvas = document.createElement('canvas');
				canvas.width = Math.ceil(layout.width * scale);
				canvas.height = Math.ceil(16 * scale);
				let ctx = canvas.getContext('2d');
				ctx.scale(scale, scale);
				let rand = mulberry32(5);
				let broad = valueNoise(rand, 32);
				let fine = valueNoise(rand, 32);
				for (let x = 0; x < layout.width; x += 1.2) {
					let size = 2.4 + broad(x / 90) * 2.6 + fine(x / 12) * 1.2;
					ctx.globalAlpha = 0.28 + broad(x / 140 + 7) * 0.3;
					ctx.drawImage(this.inkSprites[Math.floor(x) & 3], x - size / 2, 10 - size / 2 + fine(x / 40) * 1.5, size, size);
				}
				return canvas;
			},
			frame(now) {
				requestAnimationFrame(this.frame);
				let dt = Math.min(0.05, Math.max(0, (now - this.lastFrame) / 1000));
				this.lastFrame = now;
				// with no room above the keys (a tiny window, a phone with its keyboard up) there is nothing to paint
				if (!this.layout || this.layout.horizon < 60 || this.layout.W < 60) return;
				let time = (now - this.startTime) / 1000;
				let ease = 1 - Math.exp(-dt * 2.5);
				this.mouse.x += (this.mouse.tx - this.mouse.x) * ease;
				this.mouse.y += (this.mouse.ty - this.mouse.y) * ease;
				this.scene.update(dt);
				this.scene.drawBack(this.skyContext, this.mouse);
				this.scene.drawLand(this.landContext);
				// the land only moves with the mouse, which the compositor can do without repainting it
				this.$refs.land.style.transform = 'translate(' + (-this.mouse.x * LAND_SWAY[0]).toFixed(1) + 'px, ' + (-this.mouse.y * LAND_SWAY[1]).toFixed(1) + 'px)';
				this.scene.drawMist(this.mistContext, this.mouse);
				this.drawFx(now, time, dt);
			},
			drawFx(now, time, dt) {
				let ctx = this.fxContext;
				let layout = this.layout;
				ctx.globalAlpha = 1;
				ctx.clearRect(0, 0, layout.W, layout.H);

				// the brush paints the horizon from left to right as the page opens
				let p = smoothstep(0.2, 1.6, time);
				let line = this.horizonLine;
				if (p > 0 && line.width > 0) {
					ctx.drawImage(line, 0, 0, line.width * p, line.height,
						layout.left, layout.horizon - 13, layout.width * p, 16);
				}

				this.scene.drawFront(ctx, this.mouse);

				this.blooms =this.blooms.filter((bloom) => now - bloom.start < 1600);
				this.blooms.forEach((bloom) => {
					let t = (now - bloom.start) / 1600;
					let size = bloom.size * (0.5 + 0.5 * (1 - Math.pow(1 - t, 4)));
					ctx.globalAlpha = Math.pow(1 - t, 1.5) * bloom.ink * 0.4;
					ctx.drawImage(this.bloomSprite, bloom.x - size / 2, layout.horizon - size * 0.5, size, size);
				});

				this.notes = this.notes.filter((note) => note.end == null ||
					layout.horizon - (now - note.end) / 1000 * SPEED > layout.fadeTop);
				// a long glissando leaves hundreds of strokes in the air; past a limit the oldest
				// released ones (highest up and most faded) are let go
				while (this.notes.length > 150) {
					let oldest = this.notes.findIndex((note) => note.end != null);
					if (oldest < 0) break;
					this.notes.splice(oldest, 1);
				}
				this.notes.forEach((note) => this.drawNote(ctx, note, now, time));

				this.drops = this.drops.filter((drop) => (drop.life += dt) < drop.maxLife);
				this.drops.forEach((drop) => {
					drop.vy += 900 * dt;
					drop.x += drop.vx * dt;
					drop.y += drop.vy * dt;
					ctx.globalAlpha = 0.75 * (1 - drop.life / drop.maxLife);
					ctx.drawImage(this.inkSprites[0], drop.x - drop.size / 2, drop.y - drop.size / 2, drop.size, drop.size);
				});
				ctx.globalAlpha = 1;
			},
			// A held note is a brush stroke growing out of its key; once released it floats up
			// and dissolves into curling wisps, like ink dropped into water.
			drawNote(ctx, note, now, time) {
				let layout = this.layout;
				let geo = this.keyGeo[note.key];
				let x = layout.left + geo.center * layout.width;
				let w = Math.max(3, geo.weight * layout.whiteWidth);
				let age = note.end == null ? 0 : (now - note.end) / 1000;
				let spread = Math.min(1, age / DIFFUSE_TIME);
				let bottom = layout.horizon - age * SPEED;
				// a key held for a long time grows a stroke far above the screen; only the part that
				// can be seen is drawn, so the cost stays the same however long it is held
				let top = Math.min(Math.max(layout.horizon - (now - note.start) / 1000 * SPEED, layout.fadeTop - w * 3), bottom - w * 0.8);
				if (!isFinite(top) || !isFinite(bottom)) return;
				let solid = 1 - smoothstep(0, 0.45, spread);
				let plume = smoothstep(0, 0.25, spread) * (1 - spread * 0.8);
				if (plume > 0) {
					this.drawPlume(ctx, note, geo, x, w, top, bottom, spread, plume, time);
				}
				if (solid > 0) {
					this.drawStroke(ctx, note, geo, x, w, top, bottom, solid, age);
				}
			},
			// The brush presses down on the key (a round blot, which is all a short tap leaves),
			// travels up with a round head, and flicks off into a needle point when the key is let go.
			drawStroke(ctx, note, geo, x, w, top, bottom, alpha, age) {
				let layout = this.layout;
				let fadeSpan = layout.fadeBottom - layout.fadeTop;
				let fadeAt = (y) => Math.max(0, Math.min(1, (y - layout.fadeTop) / fadeSpan));
				let blotY = bottom - w * 0.55;
				[[0, 0, 1.55, 0.85], [0.14, -0.12, 1.15, 0.45], [-0.12, 0.1, 0.95, 0.4]].forEach((dab, i) => {
					let size = w * dab[2];
					ctx.globalAlpha = fadeAt(blotY) * geo.ink * alpha * dab[3];
					ctx.drawImage(this.inkSprites[(note.seed + i) & 3],
						x + dab[0] * w - size / 2, blotY + dab[1] * w - size / 2, size, size);
				});
				ctx.globalAlpha = 1;
				let length = blotY - top;
				if (length < w * 0.6) return;

				let tip = Math.min(length, w * 2.5);
				let point = 0.8 - 0.72 * smoothstep(0, 0.3, age);
				let left = [];
				let right = [];
				let centers = [];
				let flow = this.flow;
				let seed = note.seed;
				for (let s = 0; ; s += 4) {
					s = Math.min(s, length);
					// measured from the blot, so the ragged edges stay put while the stroke grows
					let u = length - s;
					let taper = Math.sqrt(Math.min(1, point + (1 - point) * s / tip));
					let half = w / 2 * taper * (1 + (flow(u * 0.03 + seed) - 0.5) * 0.3);
					let cx = x + (flow(u * 0.008 + seed * 2) - 0.5) * w * 0.4;
					let leftEdge = half * (1 + (flow(u * 0.3 + seed * 5) - 0.5) * 0.14);
					let rightEdge = half * (1 + (flow(u * 0.3 + seed * 5 + 31) - 0.5) * 0.14);
					left.push([cx - leftEdge, top + s]);
					right.push([cx + rightEdge, top + s]);
					centers.push([cx, half, top + s]);
					if (s >= length) break;
				}
				ctx.beginPath();
				left.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]));
				for (let i = right.length - 1; i >= 0; i--) {
					ctx.lineTo(right[i][0], right[i][1]);
				}
				ctx.closePath();
				// the ink is wettest where the brush pressed down and thins towards the head
				let fill = ctx.createLinearGradient(0, top, 0, blotY);
				fill.addColorStop(0, rgba(INK, geo.ink * alpha * 0.8 * fadeAt(top)));
				fill.addColorStop(1, rgba(INK, geo.ink * alpha * fadeAt(blotY)));
				// a faint wider pass first, for the ink that bleeds into the fibres around the stroke
				ctx.fillStyle = fill;
				ctx.strokeStyle = fill;
				ctx.lineJoin = 'round';
				ctx.lineWidth = 3;
				ctx.globalAlpha = 0.3;
				ctx.stroke();
				ctx.globalAlpha = 1;
				ctx.fill();

				// the head of the brush is round, so the tip is rounded off with a dab
				let head = centers[0];
				let r = head[1] * 1.35;
				ctx.globalAlpha = fadeAt(head[2]) * geo.ink * alpha * 0.85;
				ctx.drawImage(this.inkSprites[(note.seed + 3) & 3], head[0] - r, head[2] - r * 0.55, r * 2, r * 2);
				ctx.globalAlpha = 1;
				let dry = smoothstep(0, 0.3, age);
				if (length < w * 3 || dry == 0) return;

				// dry-brush streaks appear as the brush flicks off and runs out of ink
				let streakEnd = top + Math.min(length * 0.6, tip * 2.5);
				let streak = ctx.createLinearGradient(0, top, 0, streakEnd);
				streak.addColorStop(0, rgba(PAPER, 0.6 * alpha * dry));
				streak.addColorStop(1, rgba(PAPER, 0));
				ctx.strokeStyle = streak;
				ctx.lineWidth = Math.max(0.7, w * 0.05);
				[-0.3, 0.12, 0.42].forEach((lane, j) => {
					ctx.beginPath();
					centers.forEach((c, i) => {
						if (c[2] > streakEnd) return;
						let px = c[0] + c[1] * (lane + Math.sin(c[2] * 0.08 + j + note.seed) * 0.08);
						i ? ctx.lineTo(px, c[2]) : ctx.moveTo(px, c[2]);
					});
					ctx.stroke();
				});
			},
			drawPlume(ctx, note, geo, x, w, top, bottom, spread, alpha, time) {
				let layout = this.layout;
				let length = bottom - top;
				let spacing = Math.max(2.5, w * 0.32);
				let fadeSpan = layout.fadeBottom - layout.fadeTop;
				let tip = Math.min(length, w * 3);
				// as the ink spreads the dabs swell and overlap more, so fewer of them, a little
				// darker, look the same
				let stride = spread > 0.75 ? 3 : spread > 0.4 ? 2 : 1;
				for (let i = 0, s = 0; s <= length; i += stride, s = i * spacing) {
					let y = top + s;
					let fade = Math.min(1, (y - layout.fadeTop) / fadeSpan);
					if (fade <= 0) continue;
					let taper = Math.min(1, 0.3 + 0.7 * s / tip) * Math.min(1, 0.45 + 0.55 * (length - s) / tip);
					// the ink billows unevenly: some parts swell into clouds, some thin into threads
					let swell = 0.5 + this.flow(s * 0.02 + note.seed * 1.7 + time * 0.15);
					let drift = (this.flow(s * 0.012 + note.seed + time * 0.22) - 0.5) * w * 6 * spread +
						Math.sin(s * 0.015 + note.seed) * w * 0.12;
					let d = w * (1.1 + spread * 3.6 * swell) * taper;
					ctx.globalAlpha = Math.min(1, fade * geo.ink * 0.3 * alpha * taper * (1.3 - swell * 0.5) * Math.pow(stride, 0.7));
					ctx.drawImage(this.inkSprites[(note.seed + i) & 3], x + drift - d / 2, y - d / 2, d, d);
				}
			},
			onMouseUp(keycode) {
				this.mouseDown = 0;
				this.releaseKey(keycode);
			},
			onMouseDown(keycode, e) {
				if (e.button != 0) return;
				this.mouseDown = 1;
				this.pressKey(keycode);
			},
			onMouseEnter(keycode, e) {
				// the button may have been let go outside the window, where we never heard about it
				if (this.mouseDown == 1 && !(e.buttons & 1)) {
					this.mouseDown = 0;
				}
				if (this.mouseDown == 1) {
					this.pressKey(keycode);
				}
			},
			onMouseLeave(keycode) {
				if (this.mouseDown == 1) {
					this.releaseKey(keycode);
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
		--gutter: 28px;
		--ink: #1d1b18;
		--vermilion: #b5372a;
		--ease: cubic-bezier(0.16, 1, 0.3, 1);
		--kai: "STKaiti", "KaiTi", "Kaiti SC", "楷体", serif;
		position: relative;
		display: flex;
		flex-direction: column;
		height: 100vh;
		overflow: hidden;
		color: var(--ink);
		background-color: #e7decb;
	}

	.paper,
	.sky,
	.mist,
	.fx,
	.vignette {
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		pointer-events: none;
	}

	.paper {
		background-size: 320px 320px;
	}

	.land {
		position: absolute;
		top: -16px;
		left: -16px;
		width: calc(100% + 32px);
		height: calc(100% + 32px);
		pointer-events: none;
		will-change: transform;
	}

	/* the paper darkens a little towards its edges, over the painting as well */
	.vignette {
		background: radial-gradient(120% 90% at 50% 35%, rgba(255, 252, 245, 0.4) 0%, rgba(255, 252, 245, 0) 55%, rgba(140, 115, 80, 0.16) 100%);
	}

	.defs {
		position: absolute;
	}

	.sky {
		animation: fadeIn 2.6s ease-out backwards;
	}

	.seal {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		flex: none;
		width: 24px;
		height: 24px;
		border-radius: 3px;
		background: var(--vermilion);
		box-shadow: inset 0 0 0 2px var(--vermilion), inset 0 0 0 3px rgba(244, 236, 223, 0.75);
		color: #f4ecdf;
		font: 15px/1 var(--kai);
		opacity: 0.9;
		filter: url(#rough);
		user-select: none;
	}

	/* the one seal, where the inscription used to be */

	.stage {
		position: relative;
		z-index: 1;
		flex: 1;
		min-height: 0;
		pointer-events: none;
	}

	.stage .seal {
		position: absolute;
		/* below the peaks, but never down on the keys of a short screen */
		top: min(calc(6% + 360px), calc(100% - 48px));
		right: calc(var(--gutter) + 17px);
		width: 28px;
		height: 28px;
		font-size: 17px;
		transform: rotate(-3deg);
		animation: stamp 0.5s var(--ease) 2.2s backwards;
	}

	/* keyboard */

	.case {
		position: relative;
		z-index: 1;
		flex: none;
		padding: 0 var(--gutter) 28px;
	}

	.keyBoard {
		position: relative;
		display: flex;
		touch-action: none;
		cursor: pointer;
		user-select: none;
		-webkit-user-select: none;
		-webkit-user-drag: none;
	}

	.white {
		position: relative;
		flex: 1 1 0;
		box-sizing: border-box;
		border-right: 1px solid rgba(40, 36, 30, 0.42);
		border-bottom: 2px solid rgba(40, 36, 30, 0.55);
		border-radius: 0 0 4px 4px;
		background: linear-gradient(180deg, #e2dacb 0%, #f6f2e9 9%, #faf7f0 70%, #f0eadd 100%);
		transition: transform 0.4s var(--ease), background-color 0.3s;
		animation: keyIn 0.9s var(--ease) backwards;
		animation-delay: calc(var(--i) * 8ms + 200ms);
	}

	.white:first-child {
		border-left: 1px solid rgba(40, 36, 30, 0.42);
	}

	.white:hover {
		background: linear-gradient(180deg, #ddd5c5 0%, #f1ece2 9%, #f4f0e7 70%, #eae3d5 100%);
	}

	.black {
		position: absolute;
		top: 0;
		z-index: 2;
		width: calc(100% / 52 * 0.6);
		height: 62%;
		margin-left: calc(-100% / 52 * 0.3);
		border-radius: 0 0 3px 3px;
		background:
			repeating-linear-gradient(90deg, rgba(255, 250, 240, 0.04) 0 1px, rgba(255, 250, 240, 0) 1px 3px),
			linear-gradient(180deg, #2c2925 0%, #1a1816 55%, #24211d 86%, #11100e 100%);
		box-shadow: 0 3px 6px rgba(40, 32, 22, 0.28);
		transition: transform 0.4s var(--ease);
		animation: keyIn 0.9s var(--ease) backwards;
		animation-delay: calc(var(--i) * 8ms + 200ms);
	}

	.white::after,
	.black::after {
		content: '';
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		border-radius: inherit;
		opacity: 0;
		transition: opacity 1.1s ease-out;
		pointer-events: none;
	}

	/* ink soaking up into the paper key from below */
	.white::after {
		background: linear-gradient(180deg, rgba(29, 27, 24, 0) 0%, rgba(29, 27, 24, 0.14) 40%, rgba(29, 27, 24, 0.46) 100%);
	}

	.black::after {
		background: linear-gradient(180deg, rgba(244, 236, 223, 0) 15%, rgba(244, 236, 223, 0.24) 100%);
	}

	.white.act,
	.black.act {
		transform: translateY(2px);
		transition-duration: 0.06s;
	}

	.act::after {
		opacity: 1;
		transition-duration: 0.06s;
	}

	@keyframes keyIn {
		from {
			opacity: 0;
			transform: translateY(10px);
		}
	}

	@keyframes fadeIn {
		from {
			opacity: 0;
		}
	}

	@keyframes stamp {
		from {
			opacity: 0;
			transform: rotate(-3deg) scale(1.6);
		}
	}

	@media (max-width: 720px) {
		#piano {
			--gutter: 10px;
		}

		.stage .seal {
			top: 18%;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.sky,
		.white,
		.black,
		.stage .seal {
			animation: none;
		}
	}
</style>
