// The landscape behind the keyboard. It is composed the way a landscape painting is: a river
// winding from the foreground into the far distance (深远), a cluster of tall peaks on one
// bank (高远) and lower ones with a village on the other, ranges fading flat into the haze
// beyond (平远), and rocks with a grove of trees in the near corner. Cloud drifts between the
// layers.
//
// The music keeps repainting it. Its harmony and register choose the season (bright, high
// music brings spring and summer; dark, low music brings autumn and winter) and its energy
// the weather; each new peak is painted in that season's colours and that mood's hand, in
// whichever part of the composition sits nearest the notes. Everything is generated on the
// spot, so the painting never repeats.

import {INK, MIST, rgba, smoothstep, makeSoftSprite, makeInkSprite} from './ink.js';
import {
	SKY_SCALE, SNOW, GREEN, OCHRE, MOSS, clamp, canvasOf, brushStroke, clump, makeStamps, makeMountain, makePeak, makeShore, makeVillage,
	makeMistBank, makeRainTile, makeWillow, makeReeds, makeLotus, makePavilion, makePlum, makeBlossom, makeFlake
} from './inkPainters.js';

export {SKY_SCALE};

// the land layer is drawn a little larger than the screen, so its parallax never shows an edge
export const LAND_PAD = 16;
// how far the land moves as the mouse crosses the screen, in css px (x, y)
export const LAND_SWAY = [36, 10];

// where plants on the banks stand, and where the lotus floats, as fractions of the stage height
const SHORE = 0.93;
const WATERLINE = 0.97;

// the far ranges, bare blue-grey washes
const FAR = {rgb: [100, 114, 126], tier: 0, parallax: 8};

const ALL = ['spring', 'summer', 'autumn', 'winter'];

// What each season paints. `colors` are the washes laid over the ink of the peaks (upper and
// lower slopes), `tint` colours the far ranges, `sky` washes the sky ([colour, strength,
// where]), `fall` is what drifts down, `rain` how much of its storms fall as rain, and the
// lists are what grows in the top corners, on the water and on the banks.
const SEASONS = {
	spring: {
		colors: [GREEN, OCHRE], tint: [92, 132, 118], sky: [[232, 176, 168], 0.07, 'low'], orb: 'sun', fall: 'petal', rain: 0.7,
		corner: ['plum', 'willow'], water: [], shore: ['reeds', 'pavilion'], flyer: 'swallows'
	},
	summer: {
		colors: [[60, 110, 98], OCHRE], tint: [70, 118, 106], sky: null, orb: 'sun', fall: null, rain: 1,
		corner: ['willow'], water: ['lotus'], shore: ['reeds', 'pavilion'], flyer: 'birds'
	},
	autumn: {
		colors: [[158, 120, 74], [150, 92, 60]], tint: [168, 114, 62], sky: [[176, 124, 72], 0.1, 'low'], orb: 'moon', fall: 'leaf', rain: 0.4,
		corner: [], water: [], shore: ['reeds', 'pavilion'], flyer: 'geese'
	},
	winter: {
		colors: null, snow: true, sky: [INK, 0.17, 'high'], orb: 'moon', fall: 'snow', rain: 0,
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

// the kinds of element painted on the land layer
const LAND = {peak: true, shore: true, village: true};

function pick(list) {
	return list[Math.floor(Math.random() * list.length)];
}

// Lays out the picture. Positions are fractions of the stage (x of its width, y of its
// height above the keys) and are mirrored at random, so the main peaks stand on either side.
function makePlan() {
	let rand = Math.random;
	let flip = rand() < 0.5;
	let X = (x) => (flip ? 1 - x : x);
	let farY = 0.5 + rand() * 0.05;
	return {
		flip,
		farY,
		// light comes from the open side of the picture, so shadows fall toward the main peaks
		shade: flip ? 1 : -1,
		river: {
			curve: [[0.5 + rand() * 0.08, 1.02], [0.7 + rand() * 0.08, 0.86], [0.44 + rand() * 0.1, 0.7], [0.6 + rand() * 0.08, farY + 0.01]]
				.map((p) => [X(p[0]), p[1]]),
			near: 0.54 + rand() * 0.08,
			far: 0.035
		},
		// the main group rises tallest nearest the viewer; the far bank is lower
		mid: [
			{x: 0.07, base: 0.9, h: 0.8, w: 0.26},
			{x: 0.2, base: 0.83, h: 0.64, w: 0.21},
			{x: 0.32, base: 0.76, h: 0.5, w: 0.18},
			{x: 0.8, base: 0.8, h: 0.42, w: 0.2},
			{x: 0.94, base: 0.86, h: 0.52, w: 0.2}
		].map((slot) => Object.assign(slot, {x: X(slot.x + (rand() - 0.5) * 0.03)})),
		far: [0.1, 0.28, 0.46, 0.64, 0.84].map((x) => ({x: x + (rand() - 0.5) * 0.06})),
		near: [{x: X(0.12), w: 0.38, h: 0.24}].concat(rand() < 0.6 ? [{x: X(0.93), w: 0.24, h: 0.17}] : []),
		village: {x: X(0.76 + rand() * 0.05), base: 0.8, w: 0.12, h: 0.07}
	};
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
			snow: makeSoftSprite(32, SNOW),
			wash: makeSoftSprite(64, INK),
			puff: makeSoftSprite(64, MIST),
			moss: makeInkSprite(32, 11, false, MOSS)
		};
		this.art.stamps = makeStamps(this.art.moss);
		this.blossoms = {
			plum: makeBlossom(24, [192, 44, 56]),
			peach: makeBlossom(24, [236, 150, 160])
		};
		this.flakeArt = {
			petal: [makeFlake(10, 7, [238, 160, 168], false), makeFlake(10, 7, [244, 188, 192], false)],
			leaf: [makeFlake(14, 7, [178, 58, 42], true), makeFlake(14, 7, [190, 132, 60], true), makeFlake(14, 7, [140, 84, 48], true)]
		};
		this.plan = makePlan();
		this.mood = new Mood();
		this.time = 0;
		this.layout = null;
		this.elements = [];
		this.pending = [];
		this.flakes = [];
		this.flyers = [];
		this.boats = [];
		this.bolt = null;
		this.flash = 0;
		this.wind = 0;
		this.landDirty = true;
		this.landDrawn = -1;
		this.nextBoat = 0;
		this.fleetOut = false;
		// where the banks and sandbars reach into the river, once it is painted
		this.spits = null;
		this.bars = null;
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
		// banks of cloud: some lying along the foot of the far ranges, some winding between
		// the peaks, some low over the water, each at its own pace
		this.banks = [];
		for (let i = 0; i < 6; i++) {
			this.banks.push(makeMistBank(640, 160, this.art.puff));
		}
		let farY = this.plan.farY;
		let bands = [[0, farY - 0.06, farY + 0.01], [0, farY - 0.16, farY - 0.06], [1, 0.42, 0.62], [1, 0.62, 0.8], [2, 0.86, 0.98]];
		this.mists = bands.map((band) => ({
			layer: band[0],
			bank: Math.floor(Math.random() * this.banks.length),
			x: Math.random() * 1.6,
			y: band[1] + Math.random() * (band[2] - band[1]),
			w: 0.45 + Math.random() * 0.4,
			h: 0.07 + Math.random() * 0.07,
			speed: (0.003 + Math.random() * 0.007) * (Math.random() < 0.5 ? -1 : 1),
			phase: Math.random() * Math.PI * 2
		}));
		this.rainTile = makeRainTile(512);
		this.rainPattern = null;
		this.rainFall = 0;
		// clouds high in the sky: each a few overlapping washes
		this.storms = [];
		for (let i = 0; i < 5; i++) {
			let parts = [];
			for (let k = 0; k < 4; k++) {
				parts.push([(Math.random() - 0.5) * 0.25, (Math.random() - 0.5) * 0.08, 0.15 + Math.random() * 0.2, 0.08 + Math.random() * 0.1]);
			}
			this.storms.push({x: i / 5 + Math.random() * 0.1, y: 0.06 + Math.random() * 0.22, speed: 0.6 + Math.random() * 0.8, parts});
		}
		this.waves = [];
		for (let i = 0; i < 6; i++) {
			this.waves.push({t: 0.05 + Math.random() * 0.6, side: Math.random() - 0.5, length: 0.4 + Math.random() * 0.5, phase: Math.random() * Math.PI * 2, drift: Math.random()});
		}
	}

	// layout: {W, H, horizon, pixelRatio, landScale} in css px; horizon is the top of the keys
	resize(layout) {
		this.layout = layout;
		this.landDirty = true;
		if (this.river) {
			this.river.width = 0;
			this.river.height = 0;
		}
		this.river = null;
		// the banks are painted afresh, so the boats set out afresh
		this.spits = null;
		this.bars = null;
		this.boats = [];
		this.fleetOut = false;
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

	// the river's centre line at t (0 at the bottom of the picture, 1 where it vanishes)
	riverPoint(t) {
		let c = this.plan.river.curve;
		let a = 1 - t;
		return [0, 1].map((i) => a * a * a * c[0][i] + 3 * a * a * t * c[1][i] + 3 * a * t * t * c[2][i] + t * t * t * c[3][i]);
	}

	riverWidth(t) {
		let river = this.plan.river;
		return river.far + (river.near - river.far) * Math.pow(1 - t, 1.6);
	}

	// the river's banks at height y, and how far along it that is
	riverEdges(y) {
		let lo = 0;
		let hi = 1;
		for (let i = 0; i < 20; i++) {
			let mid = (lo + hi) / 2;
			if (this.riverPoint(mid)[1] > y) {
				lo = mid;
			} else {
				hi = mid;
			}
		}
		let t = (lo + hi) / 2;
		let p = this.riverPoint(t);
		let w = this.riverWidth(t);
		return [p[0] - w / 2, p[0] + w / 2, t];
	}

	// x moved onto whichever bank it is nearest at height y, `overhang` short of the water
	// (negative to keep that far back from it)
	onBank(x, y, overhang) {
		let edges = this.riverEdges(y);
		let middle = (edges[0] + edges[1]) / 2;
		return x < middle ? Math.min(x, edges[0] + overhang) : Math.max(x, edges[1] - overhang);
	}

	// The opening picture: every slot of the composition painted in turn, far to near, so the
	// landscape appears the way a painter would lay it in, then the season's own touches.
	paintOpening() {
		let wild = () => 0.05 + Math.random() * 0.12;
		let delay = 0.3;
		this.plan.far.forEach((slot) => {
			this.addMountain(0, slot.x, wild(), delay);
			delay += 0.15;
		});
		this.plan.mid.forEach((slot) => {
			this.addMountain(1, slot.x, wild(), delay);
			delay += 0.3;
		});
		this.addVillage(delay);
		this.plan.near.forEach((slot) => {
			this.addMountain(2, slot.x, wild(), delay + 0.3);
			delay += 0.3;
		});
		this.addCloud(1, 0.3 + Math.random() * 0.4, 1.8);
		this.later(delay + 0.5, () => this.paintSignature(this.plan.flip ? 0.2 : 0.8));
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

		// a hammered chord in a storm: lightning in summer, otherwise ink poured onto a dark wet peak
		if (mood.heldCount >= 3 && gap < 0.12 && intensity > 0.4 && this.time - this.lastAccent > 1.5) {
			this.lastAccent = this.time;
			if (this.season == 'summer' || (mood.storm > 0.6 && Math.random() < 0.4)) {
				this.strike(x);
			} else {
				this.addMountain(1, clamp(x, 0.05, 0.95), clamp(intensity, 0, 0.8), 0, true);
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
		if (roll < 0.5) {
			// gentle music repaints the distance, stormy music the looming peaks and the near shore
			let depth = Math.random() * (1 + wild);
			let layer = depth < 0.35 ? 0 : depth < 1.2 ? 1 : 2;
			this.addMountain(layer, x, wild, 0);
		} else if (roll < 0.6 && wild < 0.35) {
			this.addCloud(Math.floor(Math.random() * 2), x, 0);
		} else if (high > 0.62 && look.corner.length && Math.random() < 0.6) {
			this.addPlant(pick(look.corner), x);
		} else if (high > 0.62 && look.flyer && Math.random() < 0.5) {
			this.spawnFlyer(look.flyer);
		} else if (high < 0.35 && look.water.length && Math.random() < 0.6) {
			this.addPlant(pick(look.water), x);
		} else if (Math.random() < 0.4) {
			this.addPlant(pick(look.shore), x);
		} else {
			this.addMountain(1, x, wild, 0);
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
		// the new season washes over the whole land a piece at a time, from the distance forward
		let wild = this.mood.intensity * 0.8;
		let plan = this.plan;
		let at = 0.5;
		[[0, plan.far], [1, plan.mid], [2, plan.near]].forEach(([layer, slots]) => {
			slots.forEach((slot) => {
				this.later(at, () => this.addMountain(layer, slot.x, wild, 0));
				at += layer ? 1.1 : 0.4;
			});
		});
		this.later(2, () => this.paintSignature(Math.random()));
		this.later(at, () => this.addVillage(0));
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

	// Paints a new piece into the slot of the composition nearest x, washing out whatever
	// stood there: a far range (layer 0), a peak of the middle distance (1) or the near shore (2).
	addMountain(layer, x, wild, delay, splash) {
		let layout = this.layout;
		let plan = this.plan;
		let look = this.look;
		let rand = Math.random;
		let kind = ['massif', 'peak', 'shore'][layer];
		let slots = [plan.far, plan.mid, plan.near][layer];
		let index = 0;
		slots.forEach((slot, i) => {
			if (Math.abs(slot.x - x) < Math.abs(slots[index].x - x)) index = i;
		});
		let slot = slots[index];
		this.elements.forEach((e) => {
			if (e.kind == kind && e.slot == index && e.fade == null) this.retire(e);
		});
		let b = this.broaden;
		let wet = splash ? 1 : this.mood.storm;
		let element = {kind, slot: index, born: this.time + (delay || 0), reveal: splash ? 0.5 : 2.4 - wild * 1.4, fade: null};
		if (layer == 0) {
			let w = (0.28 + rand() * 0.16) * b;
			let h = (0.14 + rand() * 0.12) * (0.85 + wild * 0.4) / Math.sqrt(b);
			Object.assign(element, {x: slot.x, w, h, base: plan.farY + 0.015});
			element.make = () => makeMountain(w * layout.W, h * layout.horizon, FAR, {wild, wet, tint: look.tint, snow: look.snow});
		} else if (layer == 1) {
			let w = slot.w * (0.9 + rand() * 0.25) * b;
			let h = Math.min(slot.base - 0.02, slot.h * (0.85 + rand() * 0.25) * (0.9 + wild * 0.25) / Math.sqrt(b));
			let peak = {
				wild, wet, karst: rand() < 0.75, near: index == 0, shade: plan.shade, colors: look.colors, snow: look.snow,
				// the further back it stands, the more the haze takes it
				depth: clamp((0.9 - slot.base) / 0.14, 0, 1),
				// one fall of water in the picture at a time
				waterfall: slot.h >= 0.5 && !this.elements.some((e) => e.waterfall && e.fade == null && e.slot != index) &&
					rand() < 0.1 + wet * 0.15 + (this.season == 'summer' ? 0.1 : 0)
			};
			Object.assign(element, {x: this.onBank(slot.x, slot.base, w * 0.25), w, h, base: slot.base, waterfall: peak.waterfall});
			element.make = () => makePeak(w * layout.W, h * layout.horizon, peak, this.art, layout.landScale);
		} else {
			let w = slot.w * b;
			let h = slot.h / Math.sqrt(b);
			Object.assign(element, {x: slot.x, w, h, base: 1.01, reveal: 1.8});
			let shore = {shade: plan.shade, outer: slot.x < 0.5 ? -1 : 1, colors: look.colors};
			element.make = () => makeShore(w * layout.W, h * layout.horizon, shore, this.art, layout.landScale);
		}
		this.elements.push(element);
		this.landDirty = true;
	}

	addVillage(delay) {
		let layout = this.layout;
		let v = this.plan.village;
		this.elements.forEach((e) => {
			if (e.kind == 'village' && e.fade == null) this.retire(e);
		});
		this.elements.push({
			kind: 'village', x: this.onBank(v.x, v.base, -v.w * 0.6), w: v.w, h: v.h, base: v.base, born: this.time + delay, reveal: 1.5, fade: null,
			make: () => makeVillage(v.w * layout.W, v.h * layout.horizon, this.art, layout.landScale)
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
			y: layer ? 0.4 + Math.random() * 0.2 : this.plan.farY - 0.12 - Math.random() * 0.1,
			w: 0.3 + Math.random() * 0.25,
			h: 0.06 + Math.random() * 0.05,
			vx: (Math.random() < 0.5 ? -1 : 1) * (0.002 + Math.random() * 0.004),
			born: this.time + delay,
			reveal: 3,
			fade: null
		});
	}

	// A plant in the foreground: in a top corner (plum, willow), on the water (lotus) or on
	// a bank of the river (reeds, a pavilion). Each spot holds one at a time.
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
		} else {
			// on the water, or standing on the bank, just beyond the river's edge
			let edges = this.riverEdges(type == 'lotus' ? WATERLINE : SHORE);
			if (type == 'lotus') {
				plant.anchor = 'water';
				plant.slot = left ? 'water-l' : 'water-r';
				h = layout.horizon * 0.22 / b;
				w = h * 1.4;
				plant.canvas = makeLotus(w, h, scale);
				plant.x = left ? edges[0] + 0.05 + rand() * 0.06 : edges[1] - 0.05 - rand() * 0.06;
				plant.flex = 0.03;
				plant.reveal = 2;
			} else {
				plant.anchor = 'bottom';
				plant.slot = left ? 'shore-l' : 'shore-r';
				plant.x = left ? edges[0] - 0.01 - rand() * 0.04 : edges[1] + 0.01 + rand() * 0.04;
				plant.reveal = 2 - wild;
				if (type == 'reeds') {
					h = layout.horizon * (0.14 + rand() * 0.06) / b;
					w = h * 0.8;
					plant.canvas = makeReeds(h, this.season == 'autumn', scale);
					plant.flex = 0.14;
				} else {
					h = layout.horizon * (0.06 + rand() * 0.03) / b;
					w = h * 1.5;
					plant.canvas = makePavilion(h, scale, this.art);
					plant.flex = 0;
				}
			}
		}
		plant.w = w / layout.W;
		plant.h = h / layout.horizon;
		this.elements.forEach((e) => {
			if (e.kind == 'plant' && e.slot == plant.slot && e.fade == null) this.retire(e);
		});
		this.elements.push(plant);
	}

	retire(e, seconds) {
		e.fade = this.time;
		e.fadeTime = seconds || 1.2 + this.mood.calm * 2.8;
		if (LAND[e.kind]) this.landDirty = true;
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
			if (e.job) e.job.return();
			if (LAND[e.kind]) this.landDirty = true;
			return false;
		});
		// Painting takes a few milliseconds a piece, so it is done one thing at a time, a few
		// milliseconds a frame: the bigger paintings are generators that pause between pieces.
		let waiting = this.elements.find((e) => (e.make || e.job) && e.fade == null);
		if (waiting) {
			if (waiting.make) {
				let made = waiting.make();
				waiting.make = null;
				if (typeof made.next == 'function') {
					waiting.job = made;
				} else {
					waiting.canvas = made;
				}
			}
			if (waiting.job) {
				let start = performance.now();
				let step;
				do {
					step = waiting.job.next();
				} while (!step.done && performance.now() - start < 5);
				if (step.done) {
					waiting.canvas = step.value;
					waiting.job = null;
				}
			}
			if (waiting.canvas && LAND[waiting.kind]) this.landDirty = true;
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
			orb.y = 0.08 + Math.random() * 0.1;
			orb.r = 0.04 + Math.random() * 0.02;
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
		this.waves.forEach((wave) => {
			wave.phase += dt * (1 + intensity * 4);
			wave.drift += dt * (0.01 + intensity * 0.04);
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

		this.moveBoats(dt);

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

	// how many fishing boats are out on the river, by the width of the picture
	get fleet() {
		return clamp(Math.round(this.layout.W / 400), 3, 4);
	}

	// how large a boat is drawn at height y (a fraction of the stage): smaller further off
	boatScale(y) {
		let t = this.riverEdges(y)[2];
		return Math.max(0.2, Math.pow(1 - t, 1.4)) * Math.max(0.7, this.layout.W / 1600) * 1.7;
	}

	// The stretch of open water a boat of scale s can cross at height y, as [from, to] in
	// fractions of the width: inside the river, and clear of the banks and sandbars reaching
	// into it at that height and of the rocks in the near corners. null if there is too little.
	waterAt(y, s) {
		let layout = this.layout;
		let edges = this.riverEdges(y);
		// the hull reaches about 6s above its waterline and 4s below it, and is 40s long
		let up = y - 6 * s / layout.horizon;
		let down = y + 4 * s / layout.horizon;
		let room = 24 * s / layout.W;
		let margin = Math.max(room, (edges[1] - edges[0]) * 0.04);
		let from = edges[0] + margin;
		let to = edges[1] - margin;
		this.spits.forEach((spit) => {
			if (down < spit.top || up > spit.bottom) return;
			if (spit.side) {
				to = Math.min(to, spit.tip - room);
			} else {
				from = Math.max(from, spit.tip + room);
			}
		});
		this.bars.forEach((bar) => {
			if (down < bar.top || up > bar.bottom) return;
			// keep to the wider stretch beside the sandbar
			if (bar.x - from > to - bar.x) {
				to = Math.min(to, bar.x - bar.half - room);
			} else {
				from = Math.max(from, bar.x + bar.half + room);
			}
		});
		this.plan.near.forEach((slot) => {
			let half = slot.w * this.broaden / 2;
			if (down < 1.01 - slot.h) return;
			if (slot.x < 0.5) {
				from = Math.max(from, slot.x + half + room);
			} else {
				to = Math.min(to, slot.x - half - room);
			}
		});
		return to - from > room * 4 ? [from, to] : null;
	}

	// A fishing boat on a stretch of open water no other boat is using. `anywhere` puts it
	// somewhere along it straight away; otherwise it sets out from one end. Returns whether
	// it found room.
	launchBoat(anywhere) {
		let rand = Math.random;
		let farY = this.plan.farY;
		for (let tries = 0; tries < 20; tries++) {
			let y = farY + 0.06 + Math.sqrt(rand()) * (0.96 - farY - 0.06);
			if (this.boats.some((boat) => Math.abs(boat.y - y) < 0.05)) continue;
			let s = this.boatScale(y);
			let water = this.waterAt(y, s);
			if (!water) continue;
			let dir = rand() < 0.5 ? 1 : -1;
			let kind = pick(['punt', 'punt', 'fisher', 'sail']);
			this.boats.push({
				y, s, dir, water, kind,
				x: anywhere ? water[0] + rand() * (water[1] - water[0]) : water[dir > 0 ? 0 : 1],
				// css px a second: unhurried, a boat with an angler barely drifting
				speed: (5 + rand() * 7) * s * (kind == 'fisher' ? 0.4 : 1),
				born: anywhere ? -10 : this.time,
				phase: rand() * 6.3
			});
			// the further off, the sooner drawn, so nearer boats pass in front
			this.boats.sort((a, b) => a.y - b.y);
			return true;
		}
		return false;
	}

	// Fishing boats ply across the river from bank to bank, whatever the music is doing: as
	// one reaches the other side and fades from view, another sets out.
	moveBoats(dt) {
		if (!this.spits) return;
		if (!this.fleetOut) {
			this.fleetOut = true;
			for (let i = 0; i < this.fleet; i++) {
				this.launchBoat(true);
			}
		}
		// a boat fading out as it nears the far side no longer counts, so the next one is
		// already setting out by the time it is gone
		let staying = this.boats.filter((boat) => this.boatAhead(boat) > boat.speed * 3).length;
		if (staying < this.fleet && this.time > this.nextBoat) {
			// on a narrow river there may be no clear stretch just now: try again shortly
			this.nextBoat = this.time + (this.launchBoat(false) ? 2 + Math.random() * 3 : 0.5);
		}
		this.boats = this.boats.filter((boat) => {
			boat.x += boat.dir * boat.speed * dt / this.layout.W;
			return this.boatAhead(boat) > 0;
		});
	}

	// how far a boat still has to go, in css px
	boatAhead(boat) {
		return (boat.dir > 0 ? boat.water[1] - boat.x : boat.x - boat.water[0]) * this.layout.W;
	}

	// sky, sun or moon, the far ranges and the cloud lying along them, and lightning
	drawBack(ctx, mouse) {
		let layout = this.layout;
		if (!layout) return;
		let storm = this.mood.storm;
		ctx.globalAlpha = 1;
		ctx.globalCompositeOperation = 'source-over';
		ctx.clearRect(0, 0, layout.W, layout.H);

		this.drawSky(ctx, storm);
		if (this.orb.vis > 0.01) {
			this.drawOrb(ctx);
		}
		this.drawStormClouds(ctx, storm);
		let dx = -mouse.x * FAR.parallax * 2;
		let dy = -mouse.y * FAR.parallax * 0.6;
		this.elements.forEach((e) => {
			if (e.kind == 'massif') this.drawRevealed(ctx, e, dx, dy);
		});
		this.drawMists(ctx, 0, mouse);
		this.elements.forEach((e) => {
			if (e.kind == 'cloud' && e.layer == 0) this.drawCloud(ctx, e, dx, dy);
		});
		if (this.bolt) this.drawBolt(ctx);
		ctx.globalAlpha = 1;
	}

	// The river, the peaks of the middle distance, the village and the near shore. These
	// change only when something is painted in or fades away, so they are redrawn only then;
	// returns whether it drew.
	drawLand(ctx) {
		let layout = this.layout;
		if (!layout) return false;
		let busy = this.elements.some((e) => LAND[e.kind] && e.canvas && (e.fade != null || this.time - e.born < e.reveal + 0.1));
		// something slowly appearing or fading looks the same redrawn thirty times a second
		if (!this.landDirty && !(busy && this.time - this.landDrawn > 1 / 32)) return false;
		this.landDirty = false;
		this.landDrawn = this.time;
		ctx.globalAlpha = 1;
		ctx.globalCompositeOperation = 'source-over';
		ctx.clearRect(-LAND_PAD, -LAND_PAD, layout.W + LAND_PAD * 2, layout.H + LAND_PAD * 2);
		this.drawRiver(ctx);
		this.elements.filter((e) => e.kind == 'peak').sort((a, b) => a.base - b.base).forEach((e) => this.drawRevealed(ctx, e, 0, 0));
		this.elements.forEach((e) => {
			if (e.kind == 'village') this.drawRevealed(ctx, e, 0, 0);
		});
		this.elements.forEach((e) => {
			if (e.kind == 'shore') this.drawRevealed(ctx, e, 0, 0);
		});
		ctx.globalAlpha = 1;
		return true;
	}

	// cloud winding between the nearer peaks and over the water, the clouds the music adds,
	// rain, and the flash of lightning
	drawMist(ctx, mouse) {
		let layout = this.layout;
		if (!layout) return;
		ctx.globalAlpha = 1;
		ctx.clearRect(0, 0, layout.W, layout.H);
		this.drawMists(ctx, 1, mouse);
		this.drawMists(ctx, 2, mouse);
		this.elements.forEach((e) => {
			if (e.kind == 'cloud' && e.layer == 1) this.drawCloud(ctx, e, -mouse.x * LAND_SWAY[0], -mouse.y * LAND_SWAY[1]);
		});
		let rain = ALL.reduce((sum, name) => sum + this.weights[name] * SEASONS[name].rain, 0);
		if (this.mood.storm * rain > 0.3) {
			this.drawRain(ctx, this.mood.storm * rain);
		}
		if (this.flash > 0.01) {
			ctx.globalAlpha = this.flash * 0.35;
			ctx.fillStyle = 'rgb(255, 253, 246)';
			ctx.fillRect(0, 0, layout.W, layout.H);
		}
		ctx.globalAlpha = 1;
	}

	// thick and slow when calm, torn and racing in a storm
	drawMists(ctx, layer, mouse) {
		let layout = this.layout;
		let parallax = [8, 18, 25][layer];
		this.mists.forEach((mist) => {
			if (mist.layer != layer) return;
			let w = mist.w * layout.W;
			let h = mist.h * layout.horizon;
			let x = (((mist.x % 1.6) + 1.6) % 1.6 - 0.3) * layout.W - mouse.x * parallax * 2;
			ctx.globalAlpha = [0.4, 0.16, 0.24][layer] * (1 + this.mood.calm * 0.6) * (0.8 + 0.2 * Math.sin(this.time * 0.25 + mist.phase));
			ctx.drawImage(this.banks[mist.bank], x - w / 2, mist.y * layout.horizon - h / 2 - mouse.y * parallax * 0.6, w, h);
		});
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

	// The river, painted once per layout as a painter leaves water: as bare paper. What shows
	// it is the land: low banks reaching into the stream from either side, one behind
	// another and smaller with distance, so the water winds between them, with a sandbar or
	// two and a few lines of current.
	paintRiver() {
		let layout = this.layout;
		let W = layout.W;
		let H = layout.horizon;
		let farY = this.plan.farY;
		let rand = Math.random;
		let {canvas, ctx} = canvasOf(W, H, layout.landScale);
		this.spits = [];
		this.bars = [];

		// the far water shines where it meets the mist
		let shine = ctx.createLinearGradient(0, (farY - 0.02) * H, 0, (farY + 0.12) * H);
		shine.addColorStop(0, rgba(MIST, 0));
		shine.addColorStop(0.3, rgba(MIST, 0.4));
		shine.addColorStop(1, rgba(MIST, 0));
		ctx.fillStyle = shine;
		ctx.fillRect(0, (farY - 0.02) * H, W, 0.14 * H);

		// the banks, alternating sides as they come forward; one under each group of peaks,
		// under the village, and where the plants stand by the water
		let sideOf = (x, y) => {
			let edges = this.riverEdges(y);
			return x < (edges[0] + edges[1]) / 2 ? 0 : 1;
		};
		let levels = [{y: farY + 0.02 + rand() * 0.03, side: rand() < 0.5 ? 0 : 1}];
		levels.push({y: farY + 0.08 + rand() * 0.04, side: 1 - levels[0].side});
		this.plan.mid.forEach((slot) => levels.push({y: slot.base + 0.005, side: sideOf(slot.x, slot.base)}));
		levels.push({y: this.plan.village.base + 0.005, side: sideOf(this.plan.village.x, this.plan.village.base)});
		levels.push({y: SHORE + 0.004, side: 0}, {y: SHORE + 0.004, side: 1});
		levels.sort((a, b) => a.y - b.y);
		levels.filter((level, i) => !levels.slice(0, i).some((other) => other.side == level.side && level.y - other.y < 0.03))
			.forEach((level) => this.paintBank(ctx, level.y, level.side));

		// a few long, faint lines of current
		for (let i = 0; i < 6; i++) {
			let t = Math.pow(rand(), 1.3) * 0.7;
			let p = this.riverPoint(t);
			let w = this.riverWidth(t) * W;
			let x = p[0] * W + (rand() - 0.5) * w * 0.5;
			let length = w * (0.15 + rand() * 0.3);
			let y = p[1] * H;
			ctx.strokeStyle = rgba(INK, 1);
			brushStroke(ctx, [[x - length / 2, y], [x, y + (rand() - 0.5) * 2], [x + length / 2, y]], 0.5 + (1 - t), 0.07 + (1 - t) * 0.08, 0.7);
		}
		// a low sandbar out in the stream, with grass on it
		let t = 0.3 + rand() * 0.3;
		let p = this.riverPoint(t);
		let w = this.riverWidth(t) * W;
		this.paintBar(ctx, p[0] * W + (rand() < 0.5 ? -1 : 1) * w * 0.15, p[1] * H, w * (0.25 + rand() * 0.15), 1 - t);
		ctx.globalAlpha = 1;
		return canvas;
	}

	// A bank at height y (a fraction of the stage) on `side` (0 left, 1 right): a low spit of
	// land ending in a rounded point a little past the river's edge, its face dark where it
	// meets the water and its far end lost in mist, with grass dotted along it.
	paintBank(ctx, y, side) {
		let layout = this.layout;
		let W = layout.W;
		let H = layout.horizon;
		let rand = Math.random;
		let near = clamp((y - this.plan.farY) / (1 - this.plan.farY), 0, 1);
		let edges = this.riverEdges(y);
		let out = side ? 1 : -1;
		let tip = (edges[side] - out * this.riverWidth(edges[2]) * (rand() * 0.25 - 0.03)) * W;
		let length = W * (0.12 + rand() * 0.12) * (0.6 + near * 0.8);
		let face = 2 + near * 12;
		let base = y * H;
		// boats keep clear of it
		this.spits.push({side, tip: tip / W, top: (base - face - 1) / H, bottom: (base + 2) / H});
		let bottom = [];
		let top = [];
		for (let k = 0; k <= 16; k++) {
			let t = k / 16;
			let x = tip + out * length * t;
			// a rounded point, then a low hump of land behind it
			let rise = Math.sqrt(smoothstep(0, 0.25, t)) * (0.75 + 0.25 * Math.sin(t * Math.PI * 1.5 + side));
			bottom.push([x, base + Math.sin(t * 7 + tip) * face * 0.1]);
			top.push([x, base - face * rise - 0.5]);
		}
		let land = new Path2D();
		bottom.forEach((q, i) => i ? land.lineTo(q[0], q[1]) : land.moveTo(q[0], q[1]));
		for (let i = top.length - 1; i >= 0; i--) {
			land.lineTo(top[i][0], top[i][1]);
		}
		land.closePath();
		// darkest at the point and along the water, fading away from the river
		let fill = ctx.createLinearGradient(tip, 0, tip + out * length, 0);
		fill.addColorStop(0, rgba(INK, 0.1 + near * 0.12));
		fill.addColorStop(0.5, rgba(INK, 0.06 + near * 0.06));
		fill.addColorStop(1, rgba(INK, 0));
		ctx.globalAlpha = 1;
		ctx.fillStyle = fill;
		ctx.fill(land);
		ctx.globalAlpha = 0.06 + near * 0.06;
		ctx.drawImage(this.art.wash, Math.min(tip, tip + out * length), base - face * 2.5, length, face * 2.5);
		ctx.strokeStyle = rgba(INK, 1);
		brushStroke(ctx, bottom.slice(0, 7 + Math.floor(rand() * 4)), 0.7 + near * 1.5, 0.3 + near * 0.4, 0.55);
		brushStroke(ctx, top.slice(1, 6), 0.5 + near, 0.15 + near * 0.15, 0.7);
		for (let k = 1; k < 9; k++) {
			if (rand() < 0.45) clump(ctx, this.art, top[k][0], top[k][1] + 1, 1.5 + near * 3.5, 0.3 + near * 0.35);
		}
		// its reflection: a couple of broken lines on the water off the point
		for (let k = 0; k < 2; k++) {
			let x = tip - out * rand() * 6;
			let reach = (6 + near * 30) * (0.5 + rand() * 0.5);
			let ly = base + face * (0.4 + k * 0.5) + 1;
			brushStroke(ctx, [[x, ly], [x + out * reach * 0.5, ly], [x + out * reach, ly]], 0.5 + near * 0.6, 0.1 + near * 0.1, 0.7);
		}
	}

	// a low sandbar in the stream, length px long at (x, y), with grass and reeds on it
	paintBar(ctx, x, y, length, near) {
		this.bars.push({x: x / this.layout.W, half: length / 2 / this.layout.W, top: (y - 3 - near * 3) / this.layout.horizon, bottom: (y + 3) / this.layout.horizon});
		ctx.globalAlpha = 0.18;
		ctx.drawImage(this.art.wash, x - length / 2, y - 2 - near * 3, length, 4 + near * 6);
		ctx.strokeStyle = rgba(INK, 1);
		brushStroke(ctx, [[x - length / 2, y + 1], [x, y + 2], [x + length / 2, y + 1]], 0.8 + near, 0.35, 0.6);
		for (let g = x - length * 0.4; g < x + length * 0.4; g += 4 + Math.random() * 6) {
			if (Math.random() < 0.6) clump(ctx, this.art, g, y + 1, 1.5 + near * 2.5, 0.45);
		}
	}

	// The river and its banks. Nothing is reflected in the water: as in a painting, it is
	// left bare, and the peaks' feet are lost in the cloud above it.
	drawRiver(ctx) {
		let layout = this.layout;
		if (!this.river) {
			this.river = this.paintRiver();
		}
		ctx.globalAlpha = 1;
		ctx.drawImage(this.river, 0, 0, layout.W, layout.horizon);
	}

	fadeOf(e) {
		return e.fade == null ? 1 : 1 - smoothstep(0, e.fadeTime, this.time - e.fade);
	}

	// painted from the top downwards, with the wet edge of the wash feathered off
	drawRevealed(ctx, e, dx, dy) {
		let layout = this.layout;
		let age = this.time - e.born;
		if (age <= 0 || !e.canvas) return;
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
		ctx.globalAlpha = smoothstep(0, e.reveal, age) * this.fadeOf(e) * (0.4 + this.mood.calm * 0.2);
		ctx.drawImage(this.banks[e.bank], x * layout.W - w / 2 + dx, e.y * layout.horizon - h / 2 + dy, w, h);
	}

	// ripples, plants, boats, birds and drifting petals, leaves or snow
	drawFront(ctx, mouse) {
		let layout = this.layout;
		if (!layout) return;
		// what stands on the land moves with it
		ctx.save();
		ctx.translate(-mouse.x * LAND_SWAY[0], -mouse.y * LAND_SWAY[1]);
		this.drawWater(ctx);
		this.boats.forEach((boat) => this.drawBoat(ctx, boat));
		['water', 'bottom'].forEach((anchor) => {
			this.elements.forEach((e) => {
				if (e.kind == 'plant' && e.anchor == anchor) this.drawPlant(ctx, e, 0);
			});
		});
		ctx.restore();
		this.elements.forEach((e) => {
			if (e.kind == 'plant' && e.anchor == 'top') this.drawPlant(ctx, e, 0);
		});
		this.drawFlyers(ctx);
		this.drawFlakes(ctx);
		ctx.globalAlpha = 1;
	}

	// plants sway in the wind: the shear is anchored at the roots, or at the branch for
	// things hanging from above
	drawPlant(ctx, e, dx) {
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
			let base = layout.horizon * (e.anchor == 'water' ? WATERLINE : SHORE);
			ctx.translate(e.x * layout.W + dx, base);
			ctx.transform(1, 0, -sway, 1, 0, 0);
			ctx.drawImage(c, 0, c.height * (1 - shown), c.width, c.height * shown, -w / 2, -h * shown, w, h * shown);
		}
		ctx.restore();
	}

	// a few broken ripples on the river, shorter with distance; choppier in a storm
	drawWater(ctx) {
		let layout = this.layout;
		let wild = this.mood.intensity;
		let count = 2 + Math.round(wild * 3);
		ctx.lineCap = 'round';
		for (let i = 0; i < count; i++) {
			let wave = this.waves[i];
			let t = wave.t;
			let p = this.riverPoint(t);
			let width = this.riverWidth(t);
			let scale = Math.pow(1 - t, 1.3);
			let length = width * wave.length * layout.W * 0.5;
			let cx = (p[0] + wave.side * width * 0.6 + Math.sin(wave.drift) * width * 0.15) * layout.W;
			let y0 = p[1] * layout.horizon;
			let amp = (0.5 + wild * 3) * scale;
			let stroke = ctx.createLinearGradient(cx - length / 2, 0, cx + length / 2, 0);
			stroke.addColorStop(0, rgba(INK, 0));
			stroke.addColorStop(0.5, rgba(INK, (0.1 + wild * 0.12) * (0.4 + scale)));
			stroke.addColorStop(1, rgba(INK, 0));
			ctx.strokeStyle = stroke;
			ctx.lineWidth = 0.6 + scale * 0.8;
			ctx.beginPath();
			for (let x = -length / 2; x <= length / 2; x += 4) {
				let y = y0 + Math.sin(x * 0.05 + wave.phase) * amp;
				if (x == -length / 2) {
					ctx.moveTo(cx + x, y);
				} else {
					ctx.lineTo(cx + x, y);
				}
			}
			ctx.stroke();
		}
	}

	// A boat on the river: a poler standing at the stern, an angler sitting with his rod, or
	// a sail. It fades in as it sets out and out as it nears the other side, and the further
	// off it is the paler it is.
	drawBoat(ctx, boat) {
		let layout = this.layout;
		let s = boat.s;
		let ahead = this.boatAhead(boat);
		let near = clamp((boat.y - this.plan.farY) / (1 - this.plan.farY), 0, 1);
		let alpha = smoothstep(0, 2.5, this.time - boat.born) * smoothstep(0, boat.speed * 3, ahead) * (0.5 + 0.5 * near);
		if (alpha < 0.01) return;
		let x = boat.x * layout.W;
		let y = boat.y * layout.horizon + Math.sin(this.time * 1.3 + boat.phase) * 0.6 * s;
		ctx.save();
		ctx.translate(x, y);
		// the bow is drawn to the right
		ctx.scale(s * boat.dir, s);
		ctx.fillStyle = rgba(INK, 1);
		ctx.strokeStyle = rgba(INK, 1);
		ctx.lineCap = 'round';
		ctx.globalAlpha = alpha * 0.85;
		ctx.beginPath();
		ctx.moveTo(-20, -3);
		ctx.quadraticCurveTo(-4, 5, 18, -4);
		ctx.quadraticCurveTo(0, 1, -20, -3);
		ctx.fill();
		if (boat.kind == 'sail') {
			// a mast and a battened sail, washed pale
			ctx.lineWidth = 1.4;
			ctx.beginPath();
			ctx.moveTo(0, -2);
			ctx.lineTo(1, -38);
			ctx.stroke();
			ctx.beginPath();
			ctx.moveTo(1, -36);
			ctx.lineTo(13, -33);
			ctx.lineTo(15, -6);
			ctx.lineTo(2, -5);
			ctx.closePath();
			ctx.globalAlpha = alpha * 0.2;
			ctx.fill();
			ctx.globalAlpha = alpha * 0.7;
			ctx.lineWidth = 0.9;
			ctx.stroke();
			ctx.lineWidth = 0.6;
			for (let k = 1; k < 5; k++) {
				let f = k / 5;
				ctx.beginPath();
				ctx.moveTo(1 + f * 1, -36 + f * 31);
				ctx.lineTo(13 + f * 2, -33 + f * 27);
				ctx.stroke();
			}
		} else if (boat.kind == 'punt') {
			// a covered boat (乌篷船): a woven awning amidships, and a boatman in a straw hat
			// standing at the stern, pushing on a long pole
			let push = Math.sin(this.time * 0.8 + boat.phase) * 2;
			ctx.beginPath();
			ctx.moveTo(-3, -1);
			ctx.quadraticCurveTo(-2, -10, 5, -10);
			ctx.quadraticCurveTo(12, -10, 12, -2);
			ctx.closePath();
			ctx.globalAlpha = alpha * 0.75;
			ctx.fill();
			ctx.globalAlpha = alpha * 0.85;
			this.drawBoatman(ctx, -12, -2, true);
			ctx.lineWidth = 0.9;
			ctx.beginPath();
			ctx.moveTo(-7 + push * 0.3, -24);
			ctx.lineTo(-27 + push, 6);
			ctx.stroke();
		} else {
			// an angler in a straw hat sitting amidships, the line down in the water
			this.drawBoatman(ctx, 0, -2, false);
			ctx.lineWidth = 0.8;
			ctx.beginPath();
			ctx.moveTo(3, -7);
			ctx.lineTo(22, -18);
			ctx.stroke();
			ctx.globalAlpha = alpha * 0.4;
			ctx.lineWidth = 0.5;
			ctx.beginPath();
			ctx.moveTo(22, -18);
			ctx.lineTo(23, 3);
			ctx.stroke();
		}
		// its reflection
		ctx.globalAlpha = alpha * 0.18;
		ctx.lineWidth = 1.2;
		ctx.beginPath();
		ctx.moveTo(-15, 3);
		ctx.lineTo(13, 3);
		ctx.moveTo(-8, 6);
		ctx.lineTo(6, 6);
		ctx.stroke();
		ctx.restore();
	}

	// a figure in a broad, flat straw hat (斗笠), standing or sitting with its feet at (x, y)
	drawBoatman(ctx, x, y, standing) {
		let tall = standing ? 12 : 7;
		ctx.lineWidth = 3;
		ctx.beginPath();
		ctx.moveTo(x, y);
		ctx.quadraticCurveTo(x + 0.5, y - tall * 0.6, x + 1.5, y - tall);
		ctx.stroke();
		ctx.beginPath();
		ctx.moveTo(x - 6, y - tall - 0.5);
		ctx.quadraticCurveTo(x + 1.5, y - tall - 6, x + 9, y - tall - 0.5);
		ctx.quadraticCurveTo(x + 1.5, y - tall - 2, x - 6, y - tall - 0.5);
		ctx.fill();
	}

	drawFlyers(ctx) {
		ctx.strokeStyle = rgba(INK, 1);
		ctx.fillStyle = rgba(INK, 1);
		ctx.lineWidth = 1.3;
		ctx.lineCap = 'round';
		this.flyers.forEach((bird) => {
			if (bird.kind == 'swallows') {
				// darting and swooping, seen from below as painters show them: two long sickle
				// wings swept back, a small body and a forked tail
				let y = bird.base + Math.sin(this.time * bird.freq + bird.phase) * bird.amp;
				let s = bird.size;
				let flap = 0.55 + 0.45 * Math.abs(Math.sin(this.time * 9 + bird.phase));
				ctx.save();
				ctx.translate(bird.x, y);
				ctx.scale(bird.vx > 0 ? 1 : -1, 1);
				ctx.globalAlpha = 0.85;
				ctx.beginPath();
				ctx.ellipse(0, 0, s * 0.5, s * 0.15, 0, 0, Math.PI * 2);
				// filled on its own, or the wings crossing it would cut it out
				ctx.fill();
				ctx.beginPath();
				[-1, 1].forEach((side) => {
					ctx.moveTo(s * 0.2, 0);
					ctx.quadraticCurveTo(s * 0.05, side * s * 0.9 * flap, -s * 0.75, side * s * 1.6 * flap);
					ctx.quadraticCurveTo(-s * 0.15, side * s * 0.7 * flap, -s * 0.25, 0);
				});
				ctx.moveTo(-s * 0.4, 0);
				ctx.lineTo(-s * 1.25, -s * 0.28);
				ctx.lineTo(-s * 0.8, 0);
				ctx.lineTo(-s * 1.25, s * 0.28);
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
