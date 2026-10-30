// The landscape behind the keyboard. It listens to the playing and keeps repainting itself.
// The harmony and register of the music choose the season (bright, high music brings spring
// and summer; dark, low music brings autumn and winter) and its energy chooses the weather.
// Each season paints its own things: peach blossom, willows and swallows; lotus and
// thunderstorms; reeds, red leaves and wild geese; snowy peaks, red plum and a lone fisherman.
// Everything is generated on the spot, so the painting never repeats.

import {INK, MIST, rgba, smoothstep, makeSoftSprite} from './ink.js';
import {
	SKY_SCALE, SNOW, clamp, makeMountain, makeMistBank, makeRainTile, makeWillow, makeReeds,
	makeLotus, makePavilion, makePlum, makeBlossom, makeFlake
} from './inkPainters.js';

export {SKY_SCALE};

// where the water starts, as a fraction of the stage height
const SHORE = 0.9;

// Far to near. `base` is where the foot of a range sits and `height` the range of peak
// heights, both as fractions of the stage height. Distant ranges are pale and blurred; the
// nearer ones darker and sharper.
const LAYERS = [
	{base: 0.64, height: [0.28, 0.46], rgb: [100, 114, 126], tier: 0, parallax: 8, capacity: 4},
	{base: 0.82, height: [0.24, 0.4], rgb: [58, 62, 66], tier: 1, parallax: 18, capacity: 3},
	{base: 0.99, height: [0.16, 0.3], rgb: [30, 28, 26], tier: 2, parallax: 34, capacity: 3}
];

const ALL = ['spring', 'summer', 'autumn', 'winter'];

// What each season paints. `tint` colours its mountains, `sky` washes the sky
// ([colour, strength, where]), `fall` is what drifts down, `rain` how much of its storms fall
// as rain, and the lists are what grows in the top corners, on the water and on the shore.
const SEASONS = {
	spring: {
		tint: [92, 132, 118], sky: [[232, 176, 168], 0.07, 'low'], orb: 'sun', fall: 'petal', rain: 0.7,
		corner: ['plum', 'willow'], water: [], shore: ['pavilion'], flyer: 'swallows'
	},
	summer: {
		tint: [70, 118, 106], sky: null, orb: 'sun', fall: null, rain: 1,
		corner: ['willow'], water: ['lotus'], shore: ['reeds', 'pavilion'], flyer: 'birds'
	},
	autumn: {
		tint: [168, 114, 62], sky: [[176, 124, 72], 0.1, 'low'], orb: 'moon', fall: 'leaf', rain: 0.4,
		corner: [], water: [], shore: ['reeds', 'pavilion'], flyer: 'geese'
	},
	winter: {
		snow: true, sky: [INK, 0.17, 'high'], orb: 'moon', fall: 'snow', rain: 0,
		corner: ['plum'], water: [], shore: ['reeds', 'pavilion'], flyer: null
	}
};

// which seasons each plant belongs to; the rest of the year it withers away
const PLANT_SEASONS = {
	pavilion: ALL,
	reeds: ['summer', 'autumn', 'winter'],
	willow: ['spring', 'summer'],
	plum: ['winter', 'spring'],
	lotus: ['summer']
};

function pick(list) {
	return list[Math.floor(Math.random() * list.length)];
}

// Listens to the playing. `intensity` (0 gentle .. 1 stormy) comes from how dense the notes
// are, how many are held together, how far the melody leaps, how much bass is in it and how
// detached the notes are (there is no key velocity to go on). `brightness` (-1 dark .. 1
// bright) comes from whether the recent notes sound major or minor, and how high they are.
class Mood {
	constructor() {
		this.intensity = 0.1;
		this.brightness = 0;
		this.register = 0.5;
		this.rate = 0;
		this.mass = 0;
		this.leap = 0;
		this.bass = 0;
		this.staccato = 0;
		this.pitch = new Array(12).fill(0);
		this.held = {};
		this.heldCount = 0;
		this.lastKey = -1;
		this.lastPress = -10;
	}

	press(key, time) {
		if (this.lastKey >= 0 && time - this.lastPress < 0.5) {
			this.leap = Math.max(this.leap, Math.min(1, Math.abs(key - this.lastKey) / 24));
		}
		this.lastKey = key;
		this.lastPress = time;
		this.rate += 1;
		this.bass += 1 - key / 87;
		this.pitch[(key + 9) % 12] += 1;
		this.register += (key / 87 - this.register) * 0.12;
		if (!(key in this.held)) {
			this.heldCount++;
		}
		this.held[key] = time;
		this.mass = Math.max(this.mass, Math.min(1, (this.heldCount - 1) / 4));
	}

	release(key, time) {
		if (key in this.held) {
			let length = time - this.held[key];
			delete this.held[key];
			this.heldCount--;
			this.staccato = clamp(this.staccato + (length < 0.2 ? 0.25 : -0.2), 0, 1);
		}
	}

	update(dt) {
		let decay = Math.exp(-dt / 1.5);
		this.rate *= decay;
		this.bass *= decay;
		this.mass *= decay;
		this.leap *= Math.exp(-dt / 2.5);
		let density = 1 - Math.exp(-this.rate / 5);
		let target = Math.min(1, density * 0.55 + this.mass * 0.2 + this.leap * 0.15 +
			Math.min(1, this.bass / 4) * density * 0.2 + this.staccato * density * 0.1);
		// a storm gathers quickly and passes slowly
		let tau = target > this.intensity ? 0.5 : 2.5;
		this.intensity += (target - this.intensity) * (1 - Math.exp(-dt / tau));

		// major or minor: compare the strongest major and minor triad in the recent notes
		let fade = Math.exp(-dt / 5);
		let total = 0;
		this.pitch.forEach((v, i) => {
			this.pitch[i] = v * fade;
			total += this.pitch[i];
		});
		let harmony = 0;
		if (total > 0.8) {
			let p = this.pitch;
			let major = 0;
			let minor = 0;
			for (let r = 0; r < 12; r++) {
				major = Math.max(major, p[r] + p[(r + 4) % 12] + p[(r + 7) % 12] * 0.6);
				minor = Math.max(minor, p[r] + p[(r + 3) % 12] + p[(r + 7) % 12] * 0.6);
			}
			harmony = (major - minor) / (major + minor);
		}
		let bright = clamp(harmony * 3, -1, 1) * 0.65 + (this.register - 0.5) * 0.9;
		this.brightness += (bright - this.brightness) * (1 - Math.exp(-dt / 3));
	}

	get storm() {
		return smoothstep(0.35, 0.85, this.intensity);
	}

	get calm() {
		return 1 - smoothstep(0.15, 0.45, this.intensity);
	}
}

export default class InkScene {
	// dab: a ragged ink dab sprite
	constructor(dab) {
		this.art = {
			dab,
			snow: makeSoftSprite(32, SNOW)
		};
		this.blossoms = {
			plum: makeBlossom(24, [192, 44, 56]),
			peach: makeBlossom(24, [236, 150, 160])
		};
		this.flakeArt = {
			petal: [makeFlake(10, 7, [238, 160, 168], false), makeFlake(10, 7, [244, 188, 192], false)],
			leaf: [makeFlake(14, 7, [178, 58, 42], true), makeFlake(14, 7, [190, 132, 60], true), makeFlake(14, 7, [140, 84, 48], true)]
		};
		this.mood = new Mood();
		this.time = 0;
		this.layout = null;
		this.elements = [];
		this.pending = [];
		this.flakes = [];
		this.flyers = [];
		this.boat = null;
		this.bolt = null;
		this.flash = 0;
		this.wind = 0;
		this.nextBoat = 10;
		this.nextFlyer = 4;
		this.nextBloom = 1;
		this.budget = 0;
		this.lastPaint = -10;
		this.lastAccent = -10;
		this.lastFlyer = -10;
		this.carry = {petal: 0, leaf: 0, snow: 0};
		// each visit opens on a different season
		this.season = pick(ALL);
		this.seasonSince = 0;
		this.seasonPull = 0;
		this.weights = {};
		ALL.forEach((name) => {
			this.weights[name] = name == this.season ? 1 : 0;
		});
		this.orb = {vis: 0, type: 'moon', rising: false, x: 0.75, y: 0.16, r: 0.06};
		this.stormSprite = makeSoftSprite(128, INK);
		// banks of cloud drifting between the ranges, some low at their feet and some
		// winding round them higher up, each layer at its own pace
		let puff = makeSoftSprite(64, MIST);
		this.banks = [];
		for (let i = 0; i < 6; i++) {
			this.banks.push(makeMistBank(640, 160, puff));
		}
		this.mists = [];
		LAYERS.forEach((layer, index) => {
			for (let k = 0; k < 2; k++) {
				this.mists.push({
					layer: index,
					bank: Math.floor(Math.random() * this.banks.length),
					x: Math.random() * 1.6,
					y: layer.base - 0.04 - Math.random() * (k == 0 ? 0.05 : 0.24),
					w: 0.45 + Math.random() * 0.4,
					h: 0.07 + Math.random() * 0.07,
					speed: (0.003 + Math.random() * 0.007) * (Math.random() < 0.5 ? -1 : 1),
					phase: Math.random() * Math.PI * 2
				});
			}
		});
		this.rainTile = makeRainTile(512);
		this.rainPattern = null;
		this.rainFall = 0;
		// rain clouds: each a few overlapping washes
		this.storms = [];
		for (let i = 0; i < 5; i++) {
			let parts = [];
			for (let k = 0; k < 4; k++) {
				parts.push([(Math.random() - 0.5) * 0.25, (Math.random() - 0.5) * 0.08, 0.15 + Math.random() * 0.2, 0.08 + Math.random() * 0.1]);
			}
			this.storms.push({x: i / 5 + Math.random() * 0.1, y: 0.06 + Math.random() * 0.22, speed: 0.6 + Math.random() * 0.8, parts});
		}
		this.waves = [];
		for (let i = 0; i < 10; i++) {
			this.waves.push({
				y: Math.random(),
				x: Math.random(),
				length: 0.08 + Math.random() * 0.22,
				phase: Math.random() * Math.PI * 2,
				speed: 0.6 + Math.random()
			});
		}
	}

	// layout: {W, H, horizon, pixelRatio} in css px; horizon is the top of the keys
	resize(layout) {
		this.layout = layout;
		if (this.elements.length == 0 && layout.horizon >= 60 && layout.W >= 60) {
			this.paintOpening();
		}
	}

	// on tall, narrow screens mountains would turn into needles, so they are broadened
	get broaden() {
		return Math.max(1, Math.sqrt(this.layout.horizon * 1.6 / this.layout.W));
	}

	get look() {
		return SEASONS[this.season];
	}

	// a quiet landscape that paints itself in as the page opens, with the near hill on one
	// side and open water on the other
	paintOpening() {
		let flip = Math.random() < 0.5;
		[[0, 0.18], [0, 0.55], [0, 0.88], [1, 0.22], [1, 0.74], [2, 0.08]].forEach((spot, i) => {
			let x = spot[1] + (Math.random() - 0.5) * 0.08;
			this.addMountain(spot[0], flip ? 1 - x : x, 0.05 + Math.random() * 0.12, 0.4 + i * 0.25);
		});
		this.addCloud(1, 0.3 + Math.random() * 0.4, 1.8);
		this.later(2.2, () => this.paintSignature(flip ? 0.2 : 0.8));
	}

	later(delay, action) {
		this.pending.push({at: this.time + delay, action});
	}

	// key is 0..87, x is where it sits across the screen (0..1)
	press(key, x) {
		if (!this.layout || this.layout.horizon < 60 || this.layout.W < 60) return;
		let mood = this.mood;
		let gap = this.time - mood.lastPress;
		mood.press(key, this.time);
		let intensity = mood.intensity;

		// every note shakes a little of the season loose over where it was played
		let fall = this.look.fall;
		if (fall) {
			for (let i = 0; i < (fall == 'snow' ? 4 : 2); i++) {
				this.emit(fall, x * this.layout.W + (Math.random() - 0.5) * 120, this.layout.horizon * (0.05 + Math.random() * 0.3));
			}
		}
		// high notes open blossoms
		if (key > 46) this.bloom();

		// a hammered chord in a storm: lightning in summer, otherwise ink splashed onto a dark wet mountain
		if (mood.heldCount >= 3 && gap < 0.12 && intensity > 0.4 && this.time - this.lastAccent > 1.5) {
			this.lastAccent = this.time;
			if (this.season == 'summer' || (mood.storm > 0.6 && Math.random() < 0.4)) {
				this.strike(x);
			} else {
				this.addMountain(intensity > 0.7 ? 2 : 1, clamp(x, 0.05, 0.95), clamp(intensity, 0, 0.8), 0, true);
			}
			return;
		}
		// every few notes the brush adds something; stormy playing paints faster
		this.budget += 0.25 + intensity * 0.4;
		if (this.budget < 1 || this.time - this.lastPaint < 0.3 + (1 - intensity) * 0.5) return;
		this.budget = 0;
		this.lastPaint = this.time;
		this.paint(key, x, intensity);
	}

	release(key) {
		this.mood.release(key, this.time);
	}

	// What the brush reaches for depends on where on the keyboard the music is: high notes
	// paint branches overhead and birds, low notes the water, the middle the mountains and shore.
	paint(key, x, intensity) {
		let wild = clamp(intensity * 1.1 - 0.05 + (Math.random() - 0.5) * 0.2, 0, 0.85);
		let high = key / 87;
		let look = this.look;
		let roll = Math.random();
		if (roll < 0.45) {
			// gentle music paints distant ranges, stormy music paints looming cliffs up close
			let depth = Math.random() * (1 + wild);
			let layer = depth < 0.45 ? 0 : depth < 0.9 ? 1 : 2;
			this.addMountain(layer, clamp(x + (Math.random() - 0.5) * 0.16, 0.02, 0.98), wild, 0);
		} else if (roll < 0.55 && wild < 0.35) {
			this.addCloud(Math.floor(Math.random() * 2), x, 0);
		} else if (high > 0.62 && look.corner.length && Math.random() < 0.6) {
			this.addPlant(pick(look.corner), x);
		} else if (high > 0.62 && look.flyer && Math.random() < 0.5) {
			this.spawnFlyer(look.flyer);
		} else if (high < 0.35 && look.water.length && Math.random() < 0.6) {
			this.addPlant(pick(look.water), x);
		} else if (Math.random() < 0.5) {
			this.addPlant(pick(look.shore), x);
		} else {
			this.addMountain(Math.random() < 0.5 ? 0 : 1, clamp(x + (Math.random() - 0.5) * 0.16, 0.02, 0.98), wild, 0);
		}
	}

	// the things that make a season recognisable, painted in as it arrives
	paintSignature(x) {
		let look = this.look;
		let side = x < 0.5 ? 0.2 : 0.8;
		let special = look.corner.concat(look.water);
		if (special.length) {
			this.addPlant(pick(special), side);
		}
		this.later(1.5, () => this.addPlant(pick(look.shore), 1 - side));
		if (look.flyer) {
			this.later(3, () => this.spawnFlyer(look.flyer));
		}
	}

	enterSeason(name) {
		this.season = name;
		this.seasonSince = this.time;
		this.seasonPull = 0;
		this.elements.forEach((e) => {
			if (e.kind == 'plant' && e.fade == null && PLANT_SEASONS[e.type].indexOf(name) < 0) {
				this.retire(e, 4);
			}
		});
		let x = Math.random();
		this.later(1, () => this.addMountain(Math.random() < 0.5 ? 0 : 1, Math.random(), this.mood.intensity * 0.8, 0));
		this.later(2, () => this.paintSignature(x));
		this.later(5, () => this.addMountain(Math.random() < 0.5 ? 0 : 1, Math.random(), this.mood.intensity * 0.8, 0));
	}

	// which season the music is asking for; in between it keeps the current light but
	// follows the energy
	seasonWanted() {
		let bright = this.mood.brightness;
		let energy = this.mood.intensity;
		if (bright > 0.1) return energy > 0.5 ? 'summer' : 'spring';
		if (bright < -0.1) return energy > 0.42 ? 'autumn' : 'winter';
		if (this.season == 'spring' && energy > 0.6) return 'summer';
		if (this.season == 'summer' && energy < 0.2) return 'spring';
		if (this.season == 'winter' && energy > 0.55) return 'autumn';
		if (this.season == 'autumn' && energy < 0.15) return 'winter';
		return this.season;
	}

	addMountain(index, x, wild, delay, splash) {
		let layer = LAYERS[index];
		let layout = this.layout;
		let look = this.look;
		let w = (0.26 + Math.random() * 0.22) * (1.3 - wild * 0.25) * this.broaden;
		let h = Math.min(layer.base - 0.12,
			(layer.height[0] + Math.random() * (layer.height[1] - layer.height[0])) * (0.85 + wild * 0.4) / Math.sqrt(this.broaden));
		this.makeRoom(index, x, w, layer.capacity);
		// the canvas is painted later, in update, at most one per frame
		this.elements.push({
			kind: 'massif',
			layer: index,
			canvas: null,
			brief: {
				width: w * layout.W,
				height: h * layout.horizon,
				look: {wild, wet: splash ? 1 : this.mood.storm, splash, tint: look.tint, snow: look.snow}
			},
			x,
			w,
			h,
			base: layer.base + (Math.random() - 0.5) * 0.03,
			born: this.time + (delay || 0),
			reveal: splash ? 0.4 : 2.4 - wild * 1.6,
			fade: null
		});
	}

	addCloud(layer, x, delay) {
		let clouds = this.elements.filter((e) => e.kind == 'cloud' && e.fade == null);
		if (clouds.length >= 3) {
			this.retire(clouds[0]);
		}
		this.elements.push({
			kind: 'cloud',
			layer,
			bank: Math.floor(Math.random() * this.banks.length),
			x,
			y: LAYERS[layer].base - 0.14 - Math.random() * 0.2,
			w: 0.3 + Math.random() * 0.25,
			h: 0.06 + Math.random() * 0.05,
			vx: (Math.random() < 0.5 ? -1 : 1) * (0.002 + Math.random() * 0.004),
			born: this.time + delay,
			reveal: 3,
			fade: null
		});
	}

	// A plant in the foreground: in a top corner (plum, willow), on the water (lotus) or on
	// the shore (reeds, a pavilion). Each spot holds one at a time.
	addPlant(type, x) {
		let layout = this.layout;
		let rand = Math.random;
		// a single pavilion is a focal point; two would be a village
		if (type == 'pavilion' && this.elements.some((e) => e.type == 'pavilion' && e.fade == null)) {
			type = this.look.shore.find((other) => other != 'pavilion');
			if (!type) return;
		}
		let left = x < 0.5;
		let wild = clamp(this.mood.intensity, 0, 1);
		let scale = layout.pixelRatio;
		let b = this.broaden;
		let plant = {kind: 'plant', type, born: this.time, fade: null, phase: rand() * 6, flex: 0.05};
		let w;
		let h;
		if (type == 'plum' || type == 'willow') {
			plant.anchor = 'top';
			plant.slot = left ? 'corner-l' : 'corner-r';
			w = Math.min(layout.W * 0.42, layout.horizon * 0.85);
			h = layout.horizon * (type == 'willow' ? 0.62 : 0.5);
			if (type == 'plum') {
				let winter = this.season == 'winter';
				let made = makePlum(w, h, left, winter, scale, this.art);
				plant.canvas = made.canvas;
				plant.blossom = this.blossoms[winter ? 'plum' : 'peach'];
				plant.buds = made.buds.map((bud) => ({x: bud[0] / w, y: bud[1] / h, size: 8 + rand() * 7, at: null}));
				plant.flex = 0.03;
				for (let i = 0; i < 4; i++) {
					this.later(0.8 + i * 0.5, () => this.bloom());
				}
			} else {
				plant.canvas = makeWillow(w, h, left, scale, this.art);
				plant.flex = 0.12;
			}
			plant.x = left ? 0 : 1;
			plant.reveal = 2.5;
		} else if (type == 'lotus') {
			plant.anchor = 'water';
			plant.slot = left ? 'water-l' : 'water-r';
			h = layout.horizon * 0.26 / b;
			w = h * 1.4;
			plant.canvas = makeLotus(w, h, scale);
			plant.x = left ? 0.18 + rand() * 0.14 : 0.68 + rand() * 0.14;
			plant.flex = 0.03;
			plant.reveal = 2;
		} else {
			plant.anchor = 'bottom';
			plant.slot = left ? 'shore-l' : 'shore-r';
			plant.x = left ? 0.04 + rand() * 0.14 : 0.82 + rand() * 0.14;
			plant.reveal = 2 - wild;
			if (type == 'reeds') {
				h = layout.horizon * (0.16 + rand() * 0.08) / b;
				w = h * 0.8;
				plant.canvas = makeReeds(h, this.season == 'autumn', scale);
				plant.flex = 0.14;
			} else {
				h = layout.horizon * (0.08 + rand() * 0.04) / b;
				w = h * 1.5;
				plant.canvas = makePavilion(h, scale, this.art);
				plant.flex = 0;
			}
		}
		plant.w = w / layout.W;
		plant.h = h / layout.horizon;
		this.elements.forEach((e) => {
			if (e.kind == 'plant' && e.slot == plant.slot && e.fade == null) this.retire(e);
		});
		this.elements.push(plant);
	}

	// the new mountain washes over whatever stood in its place, and the oldest goes if the layer is full
	makeRoom(layer, x, w, capacity) {
		let live = this.elements.filter((e) => e.layer == layer && e.kind == 'massif' && e.fade == null);
		live.forEach((e) => {
			if (Math.abs(e.x - x) < (e.w + w) * 0.22) {
				this.retire(e);
			}
		});
		live = live.filter((e) => e.fade == null);
		if (live.length >= capacity) {
			live.sort((a, b) => Math.abs(a.x - x) - Math.abs(b.x - x));
			this.retire(live[0]);
		}
	}

	retire(e, seconds) {
		e.fade = this.time;
		e.fadeTime = seconds || 1.2 + this.mood.calm * 2.8;
	}

	bloom() {
		let plum = this.elements.find((e) => e.type == 'plum' && e.fade == null);
		if (!plum) return;
		let bud = plum.buds.find((b) => b.at == null);
		if (bud) bud.at = this.time;
	}

	strike(x) {
		let layout = this.layout;
		let walk = (px, y, end, spread) => {
			let points = [[px, y]];
			while (y < end) {
				y += 12 + Math.random() * 22;
				px += (Math.random() - 0.5) * spread;
				points.push([px, y]);
			}
			return points;
		};
		let main = walk(x * layout.W, layout.horizon * 0.04, layout.horizon * (0.45 + Math.random() * 0.2), 36);
		let forks = [];
		for (let i = 0; i < 2 && main.length > 5; i++) {
			let from = main[2 + Math.floor(Math.random() * Math.max(1, main.length - 4))];
			forks.push(walk(from[0], from[1], from[1] + layout.horizon * (0.08 + Math.random() * 0.12), 50));
		}
		this.bolt = {paths: [main].concat(forks), at: this.time};
		this.flash = 1;
		this.flyers.forEach((bird) => {
			bird.vx *= 3;
		});
	}

	emit(type, x, y) {
		if (this.flakes.length > 450) return;
		let rand = Math.random;
		let flake = {type, x, y, phase: rand() * 6.3, freq: 0.8 + rand() * 1.5, rot: rand() * 6.3, spin: (rand() - 0.5) * 4};
		if (type == 'snow') {
			Object.assign(flake, {size: 1.2 + rand() * 2.2, fall: 25 + rand() * 30, drift: 10 + rand() * 15});
		} else if (type == 'petal') {
			Object.assign(flake, {size: 6 + rand() * 4, fall: 20 + rand() * 20, drift: 20 + rand() * 25, sprite: pick(this.flakeArt.petal)});
		} else {
			Object.assign(flake, {size: 9 + rand() * 5, fall: 35 + rand() * 35, drift: 25 + rand() * 30, sprite: pick(this.flakeArt.leaf)});
		}
		this.flakes.push(flake);
	}

	// one flock at a time, and not too often
	spawnFlyer(kind) {
		if (this.flyers.some((bird) => bird.kind == kind) || this.time - this.lastFlyer < 8) return;
		this.lastFlyer = this.time;
		let layout = this.layout;
		let fromLeft = Math.random() < 0.5;
		let dir = fromLeft ? 1 : -1;
		let x0 = fromLeft ? -40 : layout.W + 40;
		let y0 = layout.horizon * (0.1 + Math.random() * 0.2);
		if (kind == 'swallows') {
			for (let i = 0; i < 2 + Math.floor(Math.random() * 2); i++) {
				this.flyers.push({
					kind, x: x0 - dir * i * 70, y: y0 + i * 20, base: y0 + i * 20, vx: dir * (150 + Math.random() * 60),
					size: 7 + Math.random() * 3, phase: Math.random() * 6.3, amp: 25 + Math.random() * 35, freq: 1.4 + Math.random()
				});
			}
		} else if (kind == 'geese') {
			// a V formation heading south
			let count = 7 + Math.floor(Math.random() * 5);
			for (let i = 0; i < count; i++) {
				let rank = Math.ceil(i / 2);
				let arm = i % 2 ? 1 : -1;
				this.flyers.push({
					kind, x: x0 - dir * rank * 20, y: y0 + arm * rank * 11, vx: dir * 34,
					size: 6 + Math.random(), phase: Math.random() * 6.3, flap: 3.5 + Math.random()
				});
			}
		} else {
			for (let i = 0; i < 3 + Math.floor(Math.random() * 3); i++) {
				this.flyers.push({
					kind, x: x0 - dir * (i * 26 + Math.random() * 20), y: y0 + (Math.random() - 0.5) * 28 + i * 5,
					vx: dir * (26 + Math.random() * 16), size: 4 + Math.random() * 3.5, phase: Math.random() * 6.3, flap: 5 + Math.random() * 3
				});
			}
		}
	}

	update(dt) {
		let layout = this.layout;
		if (!layout) return;
		this.time += dt;
		let mood = this.mood;
		mood.update(dt);
		let intensity = mood.intensity;
		let storm = mood.storm;
		let look = this.look;

		let due = this.pending.filter((p) => p.at <= this.time);
		this.pending = this.pending.filter((p) => p.at > this.time);
		due.forEach((p) => p.action());

		// the season turns once the music has asked for it for a few seconds
		let wanted = this.seasonWanted();
		if (wanted != this.season) {
			this.seasonPull += dt;
			if (this.seasonPull > 5 && this.time - this.seasonSince > 10) {
				this.enterSeason(wanted);
			}
		} else {
			this.seasonPull = 0;
		}
		ALL.forEach((name) => {
			this.weights[name] += ((name == this.season ? 1 : 0) - this.weights[name]) * (1 - Math.exp(-dt / 2.5));
		});

		this.wind = -storm * 0.18 - this.weights.autumn * 0.03 +
			Math.sin(this.time * 0.6) * 0.02 + Math.sin(this.time * 1.7 + 1) * 0.012 * (1 + storm * 3);
		this.flash *= Math.exp(-dt / 0.15);
		if (this.bolt && this.time - this.bolt.at > 0.45) {
			this.bolt = null;
		}

		this.elements = this.elements.filter((e) => {
			if (e.fade == null || this.time - e.fade < e.fadeTime) return true;
			// give the pixels back now rather than whenever the garbage collector gets round to
			// it: mobile Safari caps the memory all canvases together may use
			if (e.canvas) {
				e.canvas.width = 0;
				e.canvas.height = 0;
			}
			return false;
		});
		// painting a mountain takes a few milliseconds, so a burst of notes is spread over frames
		let waiting = this.elements.find((e) => e.kind == 'massif' && !e.canvas && e.fade == null);
		if (waiting) {
			waiting.canvas = makeMountain(waiting.brief.width, waiting.brief.height, LAYERS[waiting.layer], waiting.brief.look);
			waiting.brief = null;
		}
		this.elements.forEach((e) => {
			if (e.kind == 'cloud') {
				e.x += e.vx * dt * (1 + storm * 6);
				if (this.time - e.born > 40 && e.fade == null) this.retire(e);
			}
		});
		if (this.time > this.nextBloom) {
			this.bloom();
			this.nextBloom = this.time + 2 + Math.random() * 2;
		}

		// the sun or moon comes out once the music settles, somewhere new each time
		let orb = this.orb;
		let calmSky = intensity < 0.22;
		if (orb.vis < 0.002 && calmSky && !orb.rising) {
			orb.type = look.orb;
			orb.x = Math.random() < 0.5 ? 0.12 + Math.random() * 0.2 : 0.6 + Math.random() * 0.2;
			orb.y = 0.1 + Math.random() * 0.12;
			orb.r = 0.045 + Math.random() * 0.025;
			orb.rising = true;
		}
		if (!calmSky || orb.type != look.orb) {
			orb.rising = false;
		}
		orb.vis += ((orb.rising ? 1 : 0) - orb.vis) * (1 - Math.exp(-dt / (orb.rising ? 3 : 0.8)));

		this.storms.forEach((cloud) => {
			cloud.x += dt * cloud.speed * (0.004 + storm * 0.03);
		});
		this.mists.forEach((mist) => {
			mist.x += mist.speed * dt * (1 + storm * 5);
		});
		this.rainFall += dt * (500 + storm * 500);
		this.waves.forEach((wave, i) => {
			wave.phase += dt * wave.speed * (1 + intensity * 4);
			wave.x += dt * (0.004 + intensity * 0.03) * (i % 2 ? 1 : -1);
		});

		// petals, leaves and snow drift down; a storm whips them up
		let rates = {
			petal: this.weights.spring * (1.5 + storm * 30),
			leaf: this.weights.autumn * (1.2 + storm * 30),
			snow: this.weights.winter * (40 + storm * 180)
		};
		Object.keys(rates).forEach((type) => {
			this.carry[type] += rates[type] * dt;
			while (this.carry[type] >= 1) {
				this.carry[type] -= 1;
				this.emit(type, -100 + Math.random() * (layout.W + 300), -10);
			}
		});
		let gust = this.wind * 420;
		this.flakes = this.flakes.filter((f) => {
			f.x += (gust * (f.type == 'snow' ? 0.8 : 1.2) + Math.sin(this.time * f.freq + f.phase) * f.drift) * dt;
			f.y += f.fall * dt * (1 + storm * 1.5);
			f.rot += f.spin * dt * (1 + storm * 2);
			return f.y < layout.horizon + 10 && f.x > -120 && f.x < layout.W + 120;
		});

		// a fishing boat drifts by in quiet passages, and heads off when the weather turns
		if (!this.boat && intensity < 0.2 && this.time > this.nextBoat) {
			let dir = Math.random() < 0.5 ? 1 : -1;
			this.boat = {x: dir > 0 ? -40 : layout.W + 40, dir, alpha: 0};
		}
		if (this.boat) {
			let boat = this.boat;
			boat.x += boat.dir * (9 + storm * 60) * dt;
			boat.alpha += ((intensity < 0.45 ? 1 : 0) - boat.alpha) * (1 - Math.exp(-dt / 1.5));
			if (boat.x < -60 || boat.x > layout.W + 60 || (intensity >= 0.45 && boat.alpha < 0.02)) {
				this.boat = null;
				this.nextBoat = this.time + 25 + Math.random() * 25;
			}
		}

		// birds come over in quiet passages and scatter when the music erupts
		if (this.time > this.nextFlyer && intensity < 0.4 && look.flyer) {
			this.spawnFlyer(look.flyer);
			this.nextFlyer = this.time + 18 + Math.random() * 18;
		}
		this.flyers = this.flyers.filter((bird) => bird.x > -300 && bird.x < layout.W + 300 && bird.y > -60);
		this.flyers.forEach((bird) => {
			if (intensity > 0.65 && bird.kind != 'swallows') {
				bird.vx *= 1 + dt * 2;
				bird.y -= dt * 40;
			}
			bird.x += bird.vx * dt;
		});
	}

	// sky, sun or moon, mountains, mist, clouds, lightning and rain
	drawBack(ctx, mouse) {
		let layout = this.layout;
		if (!layout) return;
		let mood = this.mood;
		let storm = mood.storm;
		ctx.globalAlpha = 1;
		ctx.globalCompositeOperation = 'source-over';
		ctx.clearRect(0, 0, layout.W, layout.H);

		this.drawSky(ctx, storm);
		if (this.orb.vis > 0.01) {
			this.drawOrb(ctx);
		}

		LAYERS.forEach((layer, index) => {
			let dx = -mouse.x * layer.parallax * 2;
			let dy = -mouse.y * layer.parallax * 0.6;
			this.elements.forEach((e) => {
				if (e.layer == index && e.kind == 'massif') this.drawMassif(ctx, e, dx, dy);
			});
			if (index == 0) {
				// rain clouds drag across the distant peaks, and lightning strikes behind the nearer ones
				this.drawStormClouds(ctx, storm);
				if (this.bolt) this.drawBolt(ctx);
			}
			// cloud winding between the ranges: thick and slow when calm, torn and racing in a storm
			this.mists.forEach((mist) => {
				if (mist.layer != index) return;
				let w = mist.w * layout.W;
				let h = mist.h * layout.horizon;
				let x = (((mist.x % 1.6) + 1.6) % 1.6 - 0.3) * layout.W;
				ctx.globalAlpha = (0.35 + mood.calm * 0.3) * (0.8 + 0.2 * Math.sin(this.time * 0.25 + mist.phase));
				ctx.drawImage(this.banks[mist.bank], x - w / 2 + dx, mist.y * layout.horizon - h / 2 + dy, w, h);
			});
			this.elements.forEach((e) => {
				if (e.layer == index && e.kind == 'cloud') this.drawCloud(ctx, e, dx, dy);
			});
		});

		let rain = ALL.reduce((sum, name) => sum + this.weights[name] * SEASONS[name].rain, 0);
		if (storm * rain > 0.3) {
			this.drawRain(ctx, storm * rain);
		}
		if (this.flash > 0.01) {
			ctx.globalAlpha = this.flash * 0.35;
			ctx.fillStyle = 'rgb(255, 253, 246)';
			ctx.fillRect(0, 0, layout.W, layout.H);
		}
		ctx.globalAlpha = 1;
	}

	// each season washes the sky its own way, and a storm darkens it (summer storms most)
	drawSky(ctx, storm) {
		let layout = this.layout;
		// a grey wash over the whole sky, deepest overhead, with a bright haze low down where the cloud lies
		let base = ctx.createLinearGradient(0, 0, 0, layout.horizon);
		base.addColorStop(0, rgba(INK, 0.14));
		base.addColorStop(0.55, rgba(INK, 0.03));
		base.addColorStop(1, rgba(MIST, 0.4));
		ctx.fillStyle = base;
		ctx.fillRect(0, 0, layout.W, layout.horizon);
		ALL.forEach((name) => {
			let sky = SEASONS[name].sky;
			let weight = this.weights[name];
			if (!sky || weight < 0.01) return;
			let wash = ctx.createLinearGradient(0, 0, 0, layout.horizon);
			let strength = sky[1] * weight;
			if (sky[2] == 'high') {
				wash.addColorStop(0, rgba(sky[0], strength));
				wash.addColorStop(1, rgba(sky[0], strength * 0.3));
			} else {
				wash.addColorStop(0.2, rgba(sky[0], 0));
				wash.addColorStop(1, rgba(sky[0], strength));
			}
			ctx.fillStyle = wash;
			ctx.fillRect(0, 0, layout.W, layout.horizon);
		});
		if (storm > 0.01) {
			let dark = ctx.createLinearGradient(0, 0, 0, layout.horizon * 0.75);
			dark.addColorStop(0, rgba(INK, storm * 0.14 * (1 + this.weights.summer * 0.7)));
			dark.addColorStop(1, rgba(INK, 0));
			ctx.fillStyle = dark;
			ctx.fillRect(0, 0, layout.W, layout.horizon * 0.75);
		}
	}

	drawOrb(ctx) {
		let layout = this.layout;
		let orb = this.orb;
		let r = layout.horizon * orb.r;
		let x = orb.x * layout.W;
		let y = orb.y * layout.horizon;
		ctx.globalAlpha = orb.vis;
		if (orb.type == 'sun') {
			// a vermilion sun, softly glowing
			let glow = ctx.createRadialGradient(x, y, r * 0.5, x, y, r * 2.6);
			glow.addColorStop(0, 'rgba(214, 108, 80, 0.2)');
			glow.addColorStop(1, 'rgba(214, 108, 80, 0)');
			ctx.fillStyle = glow;
			ctx.fillRect(x - r * 2.6, y - r * 2.6, r * 5.2, r * 5.2);
			ctx.fillStyle = 'rgba(198, 68, 50, 0.72)';
			ctx.beginPath();
			ctx.arc(x, y, r * 0.8, 0, Math.PI * 2);
			ctx.fill();
		} else {
			// the moon is left as bare paper, picked out by the wash around it
			let halo = ctx.createRadialGradient(x, y, r * 0.98, x, y, r * 3.2);
			halo.addColorStop(0, rgba(INK, 0.1));
			halo.addColorStop(0.25, rgba(INK, 0.05));
			halo.addColorStop(1, rgba(INK, 0));
			ctx.fillStyle = halo;
			ctx.fillRect(x - r * 3.2, y - r * 3.2, r * 6.4, r * 6.4);
			ctx.fillStyle = 'rgba(255, 253, 247, 0.85)';
			ctx.beginPath();
			ctx.arc(x, y, r, 0, Math.PI * 2);
			ctx.fill();
		}
		ctx.globalAlpha = 1;
	}

	// faint grey clouds are always drifting high up; a storm thickens them into rain clouds
	drawStormClouds(ctx, storm) {
		let layout = this.layout;
		ctx.globalAlpha = 0.06 + storm * 0.2;
		this.storms.forEach((cloud) => {
			let cx = ((cloud.x % 1.4) + 1.4) % 1.4 - 0.2;
			cloud.parts.forEach((part) => {
				let w = part[2] * layout.W;
				let h = part[3] * layout.horizon * (1 + storm * 0.5);
				ctx.drawImage(this.stormSprite, (cx + part[0]) * layout.W - w / 2,
					(cloud.y + part[1]) * layout.horizon - h / 2, w, h);
			});
		});
		ctx.globalAlpha = 1;
	}

	drawBolt(ctx) {
		let age = this.time - this.bolt.at;
		let flicker = age < 0.08 || (age > 0.14 && age < 0.22) ? 1 : 0.35;
		let alpha = (1 - age / 0.45) * flicker;
		ctx.lineJoin = 'round';
		ctx.lineCap = 'round';
		[[5, rgba(INK, 0.35 * alpha)], [2, `rgba(255, 253, 246, ${alpha})`]].forEach((pass) => {
			ctx.lineWidth = pass[0];
			ctx.strokeStyle = pass[1];
			this.bolt.paths.forEach((path, i) => {
				ctx.globalAlpha = i ? 0.7 : 1;
				ctx.beginPath();
				path.forEach((p, k) => k ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]));
				ctx.stroke();
			});
		});
		ctx.globalAlpha = 1;
	}

	// two sheets of slanting rain, the far one finer and slower
	drawRain(ctx, amount) {
		let layout = this.layout;
		if (!this.rainPattern) {
			this.rainPattern = ctx.createPattern(this.rainTile, 'repeat');
		}
		let size = this.rainTile.width;
		[[1, 1, 0.32], [0.6, 0.55, 0.22]].forEach((sheet) => {
			let scale = sheet[0];
			let fall = this.rainFall * sheet[1];
			ctx.save();
			ctx.globalAlpha = smoothstep(0.3, 0.9, amount) * sheet[2];
			ctx.fillStyle = this.rainPattern;
			ctx.scale(scale, scale);
			ctx.translate((-fall * 0.3) % size, fall % size);
			ctx.fillRect(-size * 2, -size * 2, layout.W / scale + size * 4, layout.horizon / scale + size * 4);
			ctx.restore();
		});
	}

	fadeOf(e) {
		return e.fade == null ? 1 : 1 - smoothstep(0, e.fadeTime, this.time - e.fade);
	}

	drawMassif(ctx, e, dx, dy) {
		let layout = this.layout;
		let age = this.time - e.born;
		if (age <= 0 || !e.canvas) return;
		// painted from the ridge downwards, with the wet edge of the wash feathered off
		let shown = smoothstep(0, e.reveal, age);
		let w = e.w * layout.W;
		let h = e.h * layout.horizon;
		let x = e.x * layout.W - w / 2 + dx;
		let y = e.base * layout.horizon - h + dy;
		let part = Math.min(1, shown * 1.25);
		let opacity = Math.min(1, Math.pow(shown, 0.6) * this.fadeOf(e));
		for (let k = 0; k < 4 && part > 0; k++) {
			let from = k ? Math.min(1, part + (k - 1) * 0.05) : 0;
			let to = k ? Math.min(1, part + k * 0.05) : part;
			if (to <= from) break;
			ctx.globalAlpha = opacity * (1 - k / 4);
			ctx.drawImage(e.canvas, 0, e.canvas.height * from, e.canvas.width, e.canvas.height * (to - from),
				x, y + h * from, w, h * (to - from));
		}
	}

	drawCloud(ctx, e, dx, dy) {
		let layout = this.layout;
		let age = this.time - e.born;
		if (age <= 0) return;
		let w = e.w * layout.W * 1.6;
		let h = e.h * layout.horizon * 2;
		let x = ((e.x % 1.4) + 1.4) % 1.4 - 0.2;
		ctx.globalAlpha = smoothstep(0, e.reveal, age) * this.fadeOf(e) * (0.7 + this.mood.calm * 0.3);
		ctx.drawImage(this.banks[e.bank], x * layout.W - w / 2 + dx, e.y * layout.horizon - h / 2 + dy, w, h);
	}

	// water, plants, the boat, birds and drifting petals, leaves or snow
	drawFront(ctx, mouse) {
		let layout = this.layout;
		if (!layout) return;
		let shore = layout.horizon * SHORE;
		let dx = -mouse.x * LAYERS[2].parallax * 2;
		this.drawWater(ctx, shore);
		['water', 'bottom'].forEach((anchor) => {
			this.elements.forEach((e) => {
				if (e.kind == 'plant' && e.anchor == anchor) this.drawPlant(ctx, e, shore, dx);
			});
		});
		if (this.boat) {
			this.drawBoat(ctx, shore);
		}
		this.elements.forEach((e) => {
			if (e.kind == 'plant' && e.anchor == 'top') this.drawPlant(ctx, e, shore, 0);
		});
		this.drawFlyers(ctx);
		this.drawFlakes(ctx);
		ctx.globalAlpha = 1;
	}

	// plants sway in the wind: the shear is anchored at the roots, or at the branch for
	// things hanging from above
	drawPlant(ctx, e, shore, dx) {
		let layout = this.layout;
		let age = this.time - e.born;
		if (age <= 0) return;
		let shown = smoothstep(0, e.reveal, age);
		let w = e.w * layout.W;
		let h = e.h * layout.horizon;
		let sway = (this.wind + Math.sin(this.time * 1.3 + e.phase) * 0.012) * e.flex * 6;
		let c = e.canvas;
		ctx.save();
		ctx.globalAlpha = Math.min(1, Math.pow(shown, 0.5) * this.fadeOf(e));
		if (e.anchor == 'top') {
			// reaches in from the edge of the picture
			ctx.translate(e.x ? layout.W - w : 0, 0);
			ctx.transform(1, 0, sway, 1, 0, 0);
			if (e.x) {
				ctx.drawImage(c, c.width * (1 - shown), 0, c.width * shown, c.height, w * (1 - shown), 0, w * shown, h);
			} else {
				ctx.drawImage(c, 0, 0, c.width * shown, c.height, 0, 0, w * shown, h);
			}
			if (e.buds) {
				e.buds.forEach((bud) => {
					if (bud.at == null || (e.x ? 1 - bud.x : bud.x) > shown) return;
					let open = smoothstep(0, 0.5, this.time - bud.at);
					let s = bud.size * (0.35 + 0.65 * open);
					ctx.drawImage(e.blossom, bud.x * w - s / 2, bud.y * h - s / 2, s, s);
				});
			}
		} else {
			// grows from the roots up
			let base = e.anchor == 'water' ? shore + (layout.horizon - shore) * 0.55 : shore + 4;
			ctx.translate(e.x * layout.W + dx, base);
			ctx.transform(1, 0, -sway, 1, 0, 0);
			ctx.drawImage(c, 0, c.height * (1 - shown), c.width, c.height * shown, -w / 2, -h * shown, w, h * shown);
		}
		ctx.restore();
	}

	// a few broken strokes suggest the water: long and still when calm, short and choppy in a storm
	drawWater(ctx, shore) {
		let layout = this.layout;
		let wild = this.mood.intensity;
		let band = layout.horizon - shore;
		let count = 1 + Math.round(wild * 3);
		ctx.globalAlpha = 1;
		ctx.lineCap = 'round';
		ctx.lineWidth = 0.7 + wild * 0.5;
		for (let i = 0; i < count; i++) {
			let wave = this.waves[i];
			let y0 = shore + band * (0.15 + wave.y * 0.75);
			let length = wave.length * layout.W * (1 + wild * 0.8);
			let start = (((wave.x % 1) + 1) % 1) * (layout.W + length) - length;
			let amp = 0.6 + wild * 4.5 * (0.6 + wave.y * 0.6);
			let freq = 0.025 + wild * 0.04;
			let stroke = ctx.createLinearGradient(start, 0, start + length, 0);
			stroke.addColorStop(0, rgba(INK, 0));
			stroke.addColorStop(0.5, rgba(INK, 0.12 + wild * 0.12));
			stroke.addColorStop(1, rgba(INK, 0));
			ctx.strokeStyle = stroke;
			ctx.beginPath();
			for (let x = 0; x <= length; x += 4) {
				let px = start + x;
				let y = y0 + Math.sin(px * freq + wave.phase) * amp + Math.sin(px * freq * 2.3 + wave.phase * 1.7) * amp * 0.35 * wild;
				x ? ctx.lineTo(px, y) : ctx.moveTo(px, y);
			}
			ctx.stroke();
		}
	}

	drawBoat(ctx, shore) {
		let layout = this.layout;
		let boat = this.boat;
		let y = shore + (layout.horizon - shore) * 0.4 + Math.sin(this.time * 1.3) * 1.2;
		let s = Math.max(0.7, layout.W / 1600);
		ctx.save();
		ctx.translate(boat.x, y);
		ctx.scale(s * boat.dir, s);
		ctx.fillStyle = rgba(INK, 1);
		ctx.strokeStyle = rgba(INK, 1);
		ctx.lineCap = 'round';
		ctx.globalAlpha = boat.alpha * 0.85;
		ctx.beginPath();
		ctx.moveTo(-18, -3);
		ctx.quadraticCurveTo(-4, 4, 16, -4);
		ctx.quadraticCurveTo(0, 1, -18, -3);
		ctx.fill();
		// a fisherman in a straw hat
		ctx.lineWidth = 2.2;
		ctx.beginPath();
		ctx.moveTo(1, -2);
		ctx.lineTo(2, -10);
		ctx.stroke();
		ctx.beginPath();
		ctx.moveTo(-4, -10);
		ctx.lineTo(2, -14);
		ctx.lineTo(8, -10);
		ctx.closePath();
		ctx.fill();
		ctx.lineWidth = 0.8;
		ctx.beginPath();
		ctx.moveTo(3, -7);
		ctx.lineTo(22, -18);
		ctx.stroke();
		ctx.globalAlpha = boat.alpha * 0.4;
		ctx.beginPath();
		ctx.moveTo(22, -18);
		ctx.lineTo(23, 2);
		ctx.stroke();
		// its reflection
		ctx.globalAlpha = boat.alpha * 0.18;
		ctx.lineWidth = 1.2;
		ctx.beginPath();
		ctx.moveTo(-14, 3);
		ctx.lineTo(12, 3);
		ctx.moveTo(-8, 6);
		ctx.lineTo(6, 6);
		ctx.stroke();
		ctx.restore();
	}

	drawFlyers(ctx) {
		ctx.strokeStyle = rgba(INK, 1);
		ctx.fillStyle = rgba(INK, 1);
		ctx.lineWidth = 1.3;
		ctx.lineCap = 'round';
		this.flyers.forEach((bird) => {
			if (bird.kind == 'swallows') {
				// darting and swooping, with swept wings and a forked tail
				let y = bird.base + Math.sin(this.time * bird.freq + bird.phase) * bird.amp;
				let s = bird.size;
				let flap = 0.6 + 0.4 * Math.sin(this.time * 14 + bird.phase);
				ctx.save();
				ctx.translate(bird.x, y);
				ctx.scale(bird.vx > 0 ? 1 : -1, 1);
				ctx.globalAlpha = 0.85;
				ctx.beginPath();
				ctx.ellipse(0, 0, s * 0.8, s * 0.26, 0, 0, Math.PI * 2);
				ctx.moveTo(s * 0.2, 0);
				ctx.quadraticCurveTo(-s * 0.3, -s * 1.1 * flap, -s * 1.3, -s * 1.3 * flap);
				ctx.quadraticCurveTo(-s * 0.4, -s * 0.35, -s * 0.2, 0);
				ctx.moveTo(s * 0.2, 0);
				ctx.quadraticCurveTo(-s * 0.3, s * 0.9 * flap, -s * 1.2, s * 1.1 * flap);
				ctx.quadraticCurveTo(-s * 0.4, s * 0.3, -s * 0.2, 0);
				ctx.moveTo(-s * 0.7, 0);
				ctx.lineTo(-s * 1.7, -s * 0.45);
				ctx.lineTo(-s * 1.15, 0);
				ctx.lineTo(-s * 1.7, s * 0.45);
				ctx.closePath();
				ctx.fill();
				ctx.restore();
				return;
			}
			let flap = Math.sin(this.time * bird.flap + bird.phase);
			let s = bird.size;
			let y = bird.y + Math.sin(this.time * 0.8 + bird.phase) * 4;
			ctx.globalAlpha = bird.kind == 'geese' ? 0.65 : 0.7;
			ctx.beginPath();
			ctx.moveTo(bird.x - s, y - s * 0.55 * flap);
			ctx.quadraticCurveTo(bird.x - s * 0.45, y - s * 0.35, bird.x, y);
			ctx.quadraticCurveTo(bird.x + s * 0.45, y - s * 0.35, bird.x + s, y - s * 0.55 * flap);
			ctx.stroke();
		});
		ctx.globalAlpha = 1;
	}

	// petals and leaves spin and flutter; their transform is set directly, which is much
	// cheaper than saving and restoring the whole context for each one
	drawFlakes(ctx) {
		let ratio = this.layout.pixelRatio;
		this.flakes.forEach((f) => {
			if (f.type == 'snow') {
				ctx.globalAlpha = 0.95;
				ctx.drawImage(this.art.snow, f.x - f.size, f.y - f.size, f.size * 2, f.size * 2);
				return;
			}
			let cos = Math.cos(f.rot) * ratio;
			let sin = Math.sin(f.rot) * ratio;
			let flutter = 0.3 + 0.7 * Math.abs(Math.sin(this.time * 2.5 + f.phase));
			ctx.setTransform(cos, sin, -sin * flutter, cos * flutter, f.x * ratio, f.y * ratio);
			ctx.globalAlpha = 0.85;
			ctx.drawImage(f.sprite, -f.size / 2, -f.size * 0.35, f.size, f.size * 0.7);
		});
		ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
		ctx.globalAlpha = 1;
	}
}
