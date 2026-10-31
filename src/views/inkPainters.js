// Painters for the landscape. Each one paints a single thing (a mountain, a tree, a stand
// of bamboo...) onto its own canvas, freshly randomised every time it is called.

import {INK, PAPER, MIST, valueNoise, rgba, smoothstep, mix, makeSoftSprite} from './ink.js';

export const VERMILION = [181, 55, 42];

// The scenery behind the keys is all soft washes, so it is painted at half resolution:
// it looks the same, and fills a quarter of the pixels every frame.
export const SKY_SCALE = 0.5;
export const SNOW = [251, 249, 244];

export function clamp(x, a, b) {
	return Math.max(a, Math.min(b, x));
}

export function canvasOf(width, height, scale) {
	let canvas = document.createElement('canvas');
	canvas.width = Math.max(1, Math.ceil(width * scale));
	canvas.height = Math.max(1, Math.ceil(height * scale));
	let ctx = canvas.getContext('2d');
	ctx.scale(scale, scale);
	return {canvas, ctx};
}

// fractal 1D noise from midpoint displacement, for natural, rocky skylines
function midpoint(rand, roughness) {
	let size = 256;
	let values = new Array(size + 1).fill(0);
	let amp = 1;
	for (let step = size; step > 1; step /= 2) {
		for (let i = step / 2; i < size; i += step) {
			values[i] = (values[i - step / 2] + values[i + step / 2]) / 2 + (rand() * 2 - 1) * amp;
		}
		amp *= roughness;
	}
	return (u) => {
		let f = clamp(u, 0, 1) * size;
		let i = Math.min(size - 1, Math.floor(f));
		return values[i] + (values[i + 1] - values[i]) * (f - i);
	};
}

function line(ctx, x0, y0, x1, y1) {
	ctx.beginPath();
	ctx.moveTo(x0, y0);
	ctx.lineTo(x1, y1);
	ctx.stroke();
}

// A gnarled limb grown in short kinked segments and laid down as closely overlapping dabs,
// so the line swells and frays like a dry brush. It forks as it goes. `options`:
// kink (how sharply each segment turns), droop (a steady bend), fork (chance of a side
// branch per segment), spread (how far side branches turn), depth (how many times it may
// fork), alpha, and the callbacks point(x, y, size) and tip(x, y, angle).
function growBranch(ctx, dab, x, y, angle, length, thick, options, depth = 0) {
	let rand = Math.random;
	let segments = 3 + Math.floor(rand() * 3);
	let step = length / segments;
	for (let s = 0; s < segments; s++) {
		angle += (rand() - 0.5) * options.kink + (options.droop || 0);
		let nx = x + Math.cos(angle) * step;
		let ny = y + Math.sin(angle) * step;
		let count = Math.max(2, Math.ceil(step / Math.max(0.7, thick * 0.28)));
		for (let k = 0; k <= count; k++) {
			let t = k / count;
			let px = x + (nx - x) * t;
			let py = y + (ny - y) * t;
			let size = Math.max(1, thick * (1 - 0.18 * t) * (0.85 + rand() * 0.3));
			ctx.globalAlpha = options.alpha * (0.7 + rand() * 0.3);
			ctx.drawImage(dab, px - size / 2, py - size / 2, size, size);
			if (options.point) options.point(px, py, size);
		}
		if (depth < options.depth && rand() < options.fork) {
			let turn = (rand() < 0.5 ? -1 : 1) * options.spread * (0.6 + rand() * 0.6);
			growBranch(ctx, dab, nx, ny, angle + turn, length * 0.6, thick * 0.6, options, depth + 1);
		}
		x = nx;
		y = ny;
		thick *= 0.82;
	}
	if (options.tip) options.tip(x, y, angle);
}

// One mountain, painted freehand rather than drawn: a wet wash that is darkest along the
// crest and soft at every edge, given body by broad flat touches of wash, cut across the
// waist by cloud, its foot dissolving into mist. Distant ranges are little more than a pale
// wash.
// look: {wild, wet, splash, tint, snow}. `wild` steepens it; `wet` soaks and darkens the ink;
// `splash` pours ink over it; `tint` colours the wash; `snow` leaves the upper slopes white
// against a dark sky. Rain is not painted into the mountain: it would stay after the storm.
export function makeMountain(width, height, layer, look) {
	let {canvas, ctx} = canvasOf(width, height, SKY_SCALE);
	let rand = Math.random;
	let wild = look.wild;
	let wet = look.wet;
	let tier = layer.tier;
	let tone = look.tint ? mix(layer.rgb, look.tint, 0.4) : layer.rgb;
	let soft = makeSoftSprite(64, tone);

	let main = 0.35 + rand() * 0.3;
	let peaks = [{at: main, h: 1, left: 0.18 + rand() * 0.14, right: 0.18 + rand() * 0.14}];
	for (let i = 0, count = 1 + Math.floor(rand() * 3) + (wild > 0.5 ? 1 : 0); i < count; i++) {
		let side = rand() < 0.5 ? -1 : 1;
		peaks.push({
			// clear of the sides, where its blurred edge would be cut off
			at: clamp(main + side * (0.12 + rand() * 0.22), 0.18, 0.82),
			h: 0.35 + rand() * 0.45,
			left: 0.1 + rand() * 0.12,
			right: 0.1 + rand() * 0.12
		});
	}
	// gentle music paints rounded domes, stormy music steeper, more broken crags
	let profile = (d) => {
		if (d >= 1) return 0;
		let bell = 1 - d * d * (3 - 2 * d);
		let cone = Math.pow(1 - d, 1.5);
		return bell + (cone - bell) * (0.15 + wild * 0.45);
	};
	let detail = midpoint(rand, 0.55 + wild * 0.12);
	let rawAt = (u) => {
		let h = 0;
		peaks.forEach((p) => {
			h = Math.max(h, p.h * profile(Math.abs(u - p.at) / (u < p.at ? p.left : p.right)));
		});
		h += detail(u) * (0.06 + wild * 0.14) * (0.3 + h);
		return Math.max(0, h) * smoothstep(0, 0.06, u) * smoothstep(0, 0.06, 1 - u);
	};
	// scaled so the highest crest stands just below the top, leaving room for the ink that
	// gathers and bleeds along it, rather than flattened against the edge
	let highest = 0;
	for (let u = 0; u <= 1; u += 0.005) {
		highest = Math.max(highest, rawAt(u));
	}
	let heightAt = (u) => rawAt(u) / (highest || 1);
	let room = Math.max(height * 0.14, 12);
	let ridgeAt = (x) => height - (height - room) * heightAt(x / width);
	let crest = new Path2D();
	for (let x = 0; x <= width; x += 3) {
		x ? crest.lineTo(x, ridgeAt(x)) : crest.moveTo(x, ridgeAt(x));
	}
	let outline = new Path2D(crest);
	outline.lineTo(width, height);
	outline.lineTo(0, height);
	outline.closePath();

	let ink = [0.5, 0.78, 1][tier] * (0.85 + wild * 0.2 + wet * 0.3);
	let blur = [6, 3.5, 2][tier] + wet * 3;
	ctx.lineJoin = 'round';
	ctx.lineCap = 'round';

	ctx.filter = `blur(${(look.snow ? blur * 0.6 : blur) * SKY_SCALE}px)`;
	if (look.snow) {
		// the snowfields are left pale, brighter than the leaden sky behind them
		let body = ctx.createLinearGradient(0, 0, 0, height);
		body.addColorStop(0, rgba(SNOW, tier ? 0.95 : 0.6));
		body.addColorStop(0.5, rgba(SNOW, tier ? 0.55 : 0.25));
		body.addColorStop(1, rgba(SNOW, 0));
		ctx.fillStyle = body;
		ctx.fill(outline);
		// with grey rock showing through lower down
		let rock = ctx.createLinearGradient(0, height * 0.3, 0, height);
		rock.addColorStop(0, rgba(tone, 0));
		rock.addColorStop(0.4, rgba(tone, ink * 0.25));
		rock.addColorStop(1, rgba(tone, 0));
		ctx.fillStyle = rock;
		ctx.fill(outline);
		ctx.strokeStyle = rgba(tone, 1);
		ctx.lineWidth = 1.5;
		ctx.globalAlpha = 0.35;
		ctx.stroke(crest);
	} else {
		// the body: a wet wash, darkest high up, every edge soft
		let body = ctx.createLinearGradient(0, height * 0.05, 0, height * 0.9);
		body.addColorStop(0, rgba(tone, Math.min(0.9, ink * 0.75)));
		body.addColorStop(0.5, rgba(tone, ink * 0.4));
		body.addColorStop(1, rgba(tone, 0));
		ctx.fillStyle = body;
		ctx.fill(outline);
		// ink gathers along the crest and bleeds a little past it
		ctx.strokeStyle = rgba(tone, 1);
		[[14, 0.18], [6, 0.22]].forEach((band) => {
			ctx.lineWidth = band[0] * (tier ? 1 : 1.6);
			ctx.globalAlpha = Math.min(1, ink * band[1]);
			ctx.stroke(crest);
		});
		// and pools where the brush lingered on the peaks
		peaks.forEach((p) => {
			for (let k = 0; k < 3; k++) {
				let x = (p.at + (rand() - 0.5) * 0.08) * width;
				let s = height * (0.15 + rand() * 0.2) * p.h;
				ctx.globalAlpha = ink * (0.15 + rand() * 0.15);
				ctx.drawImage(soft, x - s / 2, ridgeAt(x) - s * 0.15, s, s * 0.8);
			}
		});
	}
	ctx.filter = 'none';

	// broad, flat, overlapping touches of wash give the slopes a soft mottled body,
	// gathered under the crests; under snow only the lower slopes darken
	if (!(look.snow && tier == 0)) {
		let touches = width * (tier ? 0.5 : 0.15) * (1 + wild * 0.3);
		for (let i = 0; i < touches; i++) {
			let x = rand() * width;
			let top = ridgeAt(x);
			if (top > height * 0.85) continue;
			let y = top + 1 - Math.log(1 - rand() * 0.95) * height * 0.17 + (look.snow ? height * 0.14 : 0);
			if (y > height * 0.85) continue;
			// never wider than the room to either side, or the canvas's edge would cut it off
			let s = Math.min(14 + rand() * 18, x, width - x);
			ctx.globalAlpha = Math.min(1, (0.06 + rand() * 0.08) * ink / 0.6);
			ctx.drawImage(soft, x - s, y - s * 0.3, s * 2, s * 0.6);
		}
	}

	if (look.splash) {
		// ink poured over the peak in broad wet washes, spilling past the crest
		let px = main * width;
		ctx.filter = `blur(${blur * SKY_SCALE}px)`;
		for (let i = 0; i < 18; i++) {
			let x = px + (rand() - 0.5) * width * 0.35;
			let s = Math.min(height * (0.15 + rand() * 0.25), x * 2, (width - x) * 2);
			ctx.globalAlpha = 0.12 + rand() * 0.18;
			ctx.drawImage(soft, x - s / 2, ridgeAt(x) - s * 0.25 + rand() * height * 0.2, s, s * 0.7);
		}
		ctx.filter = 'none';
	}

	ctx.globalCompositeOperation = 'destination-out';
	// clouds wrapped around the waist of the mountain, sometimes two bands of them
	let bands = rand() < 0.45 + (1 - wild) * 0.35 ? (rand() < 0.35 ? 2 : 1) : 0;
	for (let b = 0; b < bands; b++) {
		let y = height * (0.32 + rand() * 0.3);
		let x = width * rand() * 0.4;
		let span = width * (0.4 + rand() * 0.45);
		for (let i = 0; i < 10; i++) {
			let w = span * (0.25 + rand() * 0.35);
			let h = height * (0.06 + rand() * 0.08);
			ctx.globalAlpha = 0.45 + rand() * 0.5;
			ctx.drawImage(soft, x + rand() * span - w / 2, y + (rand() - 0.5) * height * 0.06 - h / 2, w, h);
		}
	}
	// the foot of the mountain dissolves into cloud
	ctx.globalAlpha = 1;
	let foot = ctx.createLinearGradient(0, height * 0.42, 0, height * 0.92);
	foot.addColorStop(0, 'rgba(0, 0, 0, 0)');
	foot.addColorStop(1, 'rgba(0, 0, 0, 1)');
	ctx.fillStyle = foot;
	ctx.fillRect(0, 0, width, height);
	return canvas;
}

// A long bank of cloud with a billowing upper edge, fading out at both ends, to drift
// between the mountains. `puff` is a soft white sprite.
export function makeMistBank(width, height, puff) {
	let {canvas, ctx} = canvasOf(width, height, SKY_SCALE);
	let rand = Math.random;
	let billow = valueNoise(rand, 16);
	let drift = valueNoise(rand, 16);
	for (let i = 0; i < 120; i++) {
		let u = rand();
		// thick in places, thinning to wisps and gaps in others, along a wavering line
		let thick = billow(u * 6);
		if (thick < 0.3 && rand() < 0.7) continue;
		let y = height * (0.5 + (drift(u * 3) - 0.5) * 0.45) + (rand() - 0.5) * height * 0.25 * thick;
		let s = height * (0.12 + thick * 0.4) * (0.7 + rand() * 0.6);
		ctx.globalAlpha = (0.12 + rand() * 0.25) * (0.5 + thick);
		ctx.drawImage(puff, u * width - s * 1.4, y - s * 0.35, s * 2.8, s * 0.7);
	}
	ctx.globalCompositeOperation = 'destination-out';
	ctx.globalAlpha = 1;
	let ends = ctx.createLinearGradient(0, 0, width, 0);
	ends.addColorStop(0, 'rgba(0, 0, 0, 1)');
	ends.addColorStop(0.2, 'rgba(0, 0, 0, 0)');
	ends.addColorStop(0.8, 'rgba(0, 0, 0, 0)');
	ends.addColorStop(1, 'rgba(0, 0, 0, 1)');
	ctx.fillStyle = ends;
	ctx.fillRect(0, 0, width, height);
	return canvas;
}

// A tile of slanting rain to scroll across the scene. Most streaks are pale, wiped through
// the ink the way a painter shows rain over dark mountains; a few faint grey ones show
// against the sky. Each streak is drawn wrapped so the tile repeats without seams.
export function makeRainTile(size) {
	let {canvas, ctx} = canvasOf(size, size, 1);
	let rand = Math.random;
	ctx.lineCap = 'round';
	for (let i = 0; i < 110; i++) {
		let x = rand() * size;
		let y = rand() * size;
		let length = 30 + rand() * 130;
		let pale = rand() < 0.6;
		ctx.strokeStyle = pale ? rgba(MIST, 0.18 + rand() * 0.3) : rgba(INK, 0.03 + rand() * 0.06);
		ctx.lineWidth = pale ? 1 + rand() * 1.6 : 0.6 + rand() * 0.8;
		for (let ox = -size; ox <= size; ox += size) {
			for (let oy = -size; oy <= size; oy += size) {
				line(ctx, x + ox, y + oy, x + ox - length * 0.3, y + oy + length);
			}
		}
	}
	return canvas;
}

// Willow hanging from a top corner of the picture: a crooked limb reaching in, and long
// strands that arc out from it and fall, fringed with little leaves.
export function makeWillow(width, height, fromLeft, scale, art) {
	let {canvas, ctx} = canvasOf(width, height, scale);
	let rand = Math.random;
	let leaf = rgba(mix(INK, [72, 104, 64], 0.4), 1);
	let anchors = [];
	let start = 0.35 + rand() * 0.35;
	growBranch(ctx, art.dab, fromLeft ? -6 : width + 6, height * (0.02 + rand() * 0.08), fromLeft ? start : Math.PI - start,
		width * 0.7, height * 0.04, {
			kink: 0.45,
			droop: 0,
			fork: 0.45,
			spread: 0.6,
			depth: 2,
			alpha: 0.6,
			point: (x, y, size) => {
				if (rand() < 0.08) anchors.push([x, y]);
			}
		});
	ctx.strokeStyle = leaf;
	ctx.lineCap = 'round';
	anchors.slice(0, 40).forEach((p) => {
		let dir = rand() < 0.5 ? -1 : 1;
		// every strand ends inside the canvas, or its tip would be cut off square at the edge
		let length = Math.min(height * (0.3 + rand() * 0.6), height - p[1] - 12);
		if (length < height * 0.08) return;
		let out = dir * (8 + rand() * 18);
		let drift = (rand() - 0.5) * width * 0.06;
		let at = (s) => {
			// out a little from the limb, then straight down under its own weight
			let a = 1 - s;
			return [
				a * a * p[0] + 2 * a * s * (p[0] + out) + s * s * (p[0] + out * 0.6 + drift),
				a * a * p[1] + 2 * a * s * (p[1] + length * 0.15) + s * s * (p[1] + length)
			];
		};
		// the strand thins and fades over its last third, as a willow tip does
		let width0 = 0.6 + rand() * 0.5;
		let alpha0 = 0.4 + rand() * 0.25;
		for (let s = 0.05; s <= 1.001; s += 0.05) {
			let fade = 1 - smoothstep(0.65, 1, s);
			let a = at(s - 0.05);
			let b = at(s);
			ctx.lineWidth = width0 * (0.4 + 0.6 * fade);
			ctx.globalAlpha = alpha0 * (0.15 + 0.85 * fade);
			line(ctx, a[0], a[1], b[0], b[1]);
		}
		ctx.lineWidth = 1.1;
		for (let s = 0.12; s < 0.95; s += 0.035 + rand() * 0.03) {
			let q = at(s);
			let side = rand() < 0.5 ? -1 : 1;
			let leafSize = 1 - smoothstep(0.7, 1, s) * 0.6;
			ctx.globalAlpha = (0.3 + rand() * 0.25) * (1 - smoothstep(0.75, 1, s) * 0.7);
			line(ctx, q[0], q[1], q[0] + side * (2 + rand() * 3) * leafSize, q[1] + (3 + rand() * 3) * leafSize);
		}
	});
	return canvas;
}

// A stand of reeds at the water's edge, plumes tinged ochre in autumn.
export function makeReeds(height, autumn, scale) {
	let width = height * 0.8;
	let {canvas, ctx} = canvasOf(width, height, scale);
	let rand = Math.random;
	let plume = rgba(mix(INK, [176, 128, 72], autumn ? 0.55 : 0), 1);
	let stalks = 10 + Math.floor(rand() * 10);
	ctx.lineCap = 'round';
	for (let i = 0; i < stalks; i++) {
		let x0 = width * (0.3 + rand() * 0.4);
		let length = height * (0.55 + rand() * 0.45);
		let lean = (rand() - 0.5) * height * 0.35;
		let tx = x0 + lean;
		let ty = height - length;
		ctx.strokeStyle = rgba(INK, 1);
		ctx.lineWidth = 0.7 + rand() * 0.6;
		ctx.globalAlpha = 0.45 + rand() * 0.25;
		ctx.beginPath();
		ctx.moveTo(x0, height);
		ctx.quadraticCurveTo(x0 + lean * 0.2, height - length * 0.5, tx, ty);
		ctx.stroke();
		if (rand() < 0.6) {
			let side = rand() < 0.5 ? -1 : 1;
			let ly = height - length * (0.2 + rand() * 0.3);
			ctx.lineWidth = 1.1;
			ctx.globalAlpha = 0.4;
			ctx.beginPath();
			ctx.moveTo(x0 + lean * 0.05, ly);
			ctx.quadraticCurveTo(x0 + side * height * 0.12, ly - height * 0.12, x0 + side * height * 0.22, ly + height * 0.02);
			ctx.stroke();
		}
		ctx.strokeStyle = plume;
		ctx.lineWidth = 0.6;
		for (let k = 0; k < 10; k++) {
			let angle = Math.PI / 2 + (rand() - 0.5) * 1.6;
			let fl = height * (0.03 + rand() * 0.04);
			ctx.globalAlpha = 0.3 + rand() * 0.2;
			line(ctx, tx, ty + k * 1.2, tx + Math.cos(angle) * fl, ty + k * 1.2 + Math.sin(angle) * fl);
		}
	}
	return canvas;
}

// Lotus: broad leaves washed in dark ink with pale veins, and pink flowers held up on
// long stems. The canvas stands on the water at its bottom edge.
export function makeLotus(width, height, scale) {
	let {canvas, ctx} = canvasOf(width, height, scale);
	let rand = Math.random;
	let stem = (x0, y0) => {
		ctx.strokeStyle = rgba(INK, 0.7);
		ctx.lineWidth = 1.2 + rand() * 0.6;
		ctx.beginPath();
		ctx.moveTo(x0, y0);
		ctx.quadraticCurveTo(x0 + (rand() - 0.5) * 12, (y0 + height) / 2, x0 + (rand() - 0.5) * 10, height);
		ctx.stroke();
	};
	let leaves = [];
	for (let i = 0, count = 2 + Math.floor(rand() * 3); i < count; i++) {
		let rx = width * (0.13 + rand() * 0.1);
		leaves.push([width * (0.18 + rand() * 0.64), height * (0.5 + rand() * 0.38), rx, rx * (0.32 + rand() * 0.1), (rand() - 0.5) * 0.4]);
	}
	let flowers = [];
	for (let i = 0, count = 1 + Math.floor(rand() * 2); i < count; i++) {
		flowers.push([width * (0.25 + rand() * 0.5), height * (0.18 + rand() * 0.22), height * (0.08 + rand() * 0.04)]);
	}
	let bud = [width * (0.2 + rand() * 0.6), height * (0.25 + rand() * 0.2)];
	leaves.forEach((l) => stem(l[0], l[1]));
	flowers.forEach((f) => stem(f[0], f[1] + f[2] * 0.3));
	stem(bud[0], bud[1]);

	leaves.sort((a, b) => a[1] - b[1]).forEach((l) => {
		ctx.save();
		ctx.translate(l[0], l[1]);
		ctx.rotate(l[4]);
		let edge = valueNoise(rand, 12);
		let path = new Path2D();
		for (let k = 0; k <= 40; k++) {
			let a = k / 40 * Math.PI * 2;
			let r = 0.9 + edge(k / 40 * 12) * 0.15;
			k ? path.lineTo(Math.cos(a) * l[2] * r, Math.sin(a) * l[3] * r) : path.moveTo(Math.cos(a) * l[2] * r, Math.sin(a) * l[3] * r);
		}
		let wash = ctx.createLinearGradient(0, -l[3], 0, l[3]);
		wash.addColorStop(0, rgba(INK, 0.72 + rand() * 0.2));
		wash.addColorStop(1, rgba(INK, 0.4 + rand() * 0.2));
		ctx.fillStyle = wash;
		ctx.fill(path);
		ctx.strokeStyle = rgba(PAPER, 0.32);
		ctx.lineWidth = 0.9;
		for (let k = 0; k < 11; k++) {
			let a = k / 11 * Math.PI * 2 + rand() * 0.2;
			line(ctx, 0, 0, Math.cos(a) * l[2] * 0.85, Math.sin(a) * l[3] * 0.85);
		}
		ctx.restore();
	});

	let petal = (x, y, angle, length, alpha) => {
		ctx.save();
		ctx.translate(x, y);
		ctx.rotate(angle);
		let w = length * 0.45;
		let fill = ctx.createLinearGradient(0, 0, 0, -length);
		fill.addColorStop(0, `rgba(244, 206, 206, ${alpha})`);
		fill.addColorStop(1, `rgba(214, 92, 112, ${alpha})`);
		ctx.fillStyle = fill;
		ctx.strokeStyle = 'rgba(150, 52, 64, 0.55)';
		ctx.lineWidth = 0.7;
		ctx.beginPath();
		ctx.moveTo(0, 0);
		ctx.quadraticCurveTo(-w, -length * 0.45, 0, -length);
		ctx.quadraticCurveTo(w, -length * 0.45, 0, 0);
		ctx.fill();
		ctx.stroke();
		ctx.restore();
	};
	flowers.forEach((f) => {
		let base = f[1] + f[2] * 0.3;
		[-1.2, 1.2, -0.8, 0.8, -0.4, 0.4, 0].forEach((a, i) => petal(f[0], base, a * (0.8 + rand() * 0.3), f[2] * (i < 2 ? 0.8 : 1), 0.9));
		ctx.globalAlpha = 0.8;
		ctx.fillStyle = 'rgba(196, 160, 72, 1)';
		ctx.beginPath();
		ctx.arc(f[0], base - f[2] * 0.25, f[2] * 0.12, 0, Math.PI * 2);
		ctx.fill();
		ctx.globalAlpha = 1;
	});
	petal(bud[0], bud[1], 0, height * 0.07, 0.95);
	return canvas;
}

// A small pavilion with upswept eaves, standing on a little rocky rise.
export function makePavilion(size, scale, art) {
	let width = size * 1.5;
	let height = size;
	let {canvas, ctx} = canvasOf(width, height, scale);
	let rand = Math.random;
	let w = width;
	let h = height;
	for (let i = 0; i < 14; i++) {
		let s = size * (0.06 + rand() * 0.12);
		ctx.globalAlpha = 0.3 + rand() * 0.3;
		ctx.drawImage(art.dab, w * (0.15 + rand() * 0.7) - s / 2, h * (0.92 + rand() * 0.06) - s / 2, s, s * 0.6);
	}
	ctx.globalAlpha = 1;
	ctx.strokeStyle = rgba(INK, 0.85);
	ctx.lineCap = 'round';
	ctx.lineWidth = 2;
	line(ctx, w * 0.18, h * 0.9, w * 0.82, h * 0.9);
	ctx.lineWidth = 1.6;
	[0.3, 0.5, 0.7].forEach((x) => line(ctx, w * x, h * 0.47, w * x, h * 0.9));
	ctx.lineWidth = 1;
	ctx.strokeStyle = rgba(INK, 0.55);
	line(ctx, w * 0.3, h * 0.76, w * 0.7, h * 0.76);
	ctx.fillStyle = rgba(INK, 0.86);
	ctx.beginPath();
	ctx.moveTo(w * 0.04, h * 0.4);
	ctx.quadraticCurveTo(w * 0.18, h * 0.48, w * 0.3, h * 0.47);
	ctx.lineTo(w * 0.7, h * 0.47);
	ctx.quadraticCurveTo(w * 0.82, h * 0.48, w * 0.96, h * 0.4);
	ctx.quadraticCurveTo(w * 0.78, h * 0.38, w * 0.6, h * 0.18);
	ctx.lineTo(w * 0.5, h * 0.1);
	ctx.lineTo(w * 0.4, h * 0.18);
	ctx.quadraticCurveTo(w * 0.22, h * 0.38, w * 0.04, h * 0.4);
	ctx.fill();
	ctx.beginPath();
	ctx.arc(w * 0.5, h * 0.07, size * 0.03, 0, Math.PI * 2);
	ctx.fill();
	return canvas;
}

// A gnarled plum branch reaching in from a top corner, zig-zagging the way plum wood does,
// with moss dots on the old wood. Returns the canvas and the spots along the twigs where
// blossoms can open. In winter the branch carries snow.
export function makePlum(width, height, fromLeft, winter, scale, art) {
	let {canvas, ctx} = canvasOf(width, height, scale);
	let rand = Math.random;
	let buds = [];
	let snowy = [];
	let start = 0.3 + rand() * 0.4;
	growBranch(ctx, art.dab, fromLeft ? -8 : width + 8, height * (0.02 + rand() * 0.12), fromLeft ? start : Math.PI - start,
		width * 0.62, height * 0.07, {
			kink: 1.0,
			droop: 0.02,
			fork: 0.7,
			spread: 0.85,
			depth: 3,
			alpha: 0.62,
			point: (x, y, size) => {
				if (size < 6 && rand() < 0.06) buds.push([x + (rand() - 0.5) * 8, y + (rand() - 0.5) * 8]);
				if (size > 7 && rand() < 0.012) {
					ctx.globalAlpha = 0.85;
					ctx.drawImage(art.dab, x - 2, y - size * 0.55, 4, 2.5);
				}
				if (size > 4 && rand() < 0.05) snowy.push([x, y, size]);
			},
			tip: (x, y) => buds.push([x, y])
		});
	if (winter) {
		snowy.forEach((p) => {
			let s = p[2] * (1.3 + rand());
			ctx.globalAlpha = 0.95;
			ctx.drawImage(art.snow, p[0] - s / 2, p[1] - s * 0.8, s, s * 0.6);
		});
	}
	for (let i = buds.length - 1; i > 0; i--) {
		let j = Math.floor(rand() * (i + 1));
		let t = buds[i];
		buds[i] = buds[j];
		buds[j] = t;
	}
	return {canvas, buds: buds.slice(0, 48)};
}

// one open blossom: five round petals, a darker heart and a few stamens
export function makeBlossom(size, rgb) {
	let {canvas, ctx} = canvasOf(size, size, 2);
	let c = size / 2;
	let r = size * 0.2;
	for (let i = 0; i < 5; i++) {
		let a = i / 5 * Math.PI * 2 - Math.PI / 2;
		ctx.fillStyle = rgba(mix(rgb, [255, 255, 255], 0.15 + (i % 2) * 0.1), 0.88);
		ctx.beginPath();
		ctx.arc(c + Math.cos(a) * r * 1.1, c + Math.sin(a) * r * 1.1, r, 0, Math.PI * 2);
		ctx.fill();
	}
	ctx.fillStyle = rgba(mix(rgb, INK, 0.35), 0.9);
	ctx.beginPath();
	ctx.arc(c, c, r * 0.45, 0, Math.PI * 2);
	ctx.fill();
	ctx.strokeStyle = rgba(INK, 0.6);
	ctx.lineWidth = 0.5;
	for (let i = 0; i < 6; i++) {
		let a = i / 6 * Math.PI * 2;
		line(ctx, c, c, c + Math.cos(a) * r * 1.1, c + Math.sin(a) * r * 1.1);
	}
	return canvas;
}

// a single falling petal or leaf, to be spun as it drifts down
export function makeFlake(width, height, rgb, pointed) {
	let {canvas, ctx} = canvasOf(width, height, 2);
	ctx.fillStyle = rgba(rgb, 0.9);
	ctx.beginPath();
	if (pointed) {
		ctx.moveTo(0, height / 2);
		ctx.quadraticCurveTo(width * 0.45, 0, width, height / 2);
		ctx.quadraticCurveTo(width * 0.45, height, 0, height / 2);
	} else {
		ctx.ellipse(width / 2, height / 2, width / 2, height / 2, 0, 0, Math.PI * 2);
	}
	ctx.fill();
	if (pointed) {
		ctx.strokeStyle = rgba(mix(rgb, INK, 0.4), 0.6);
		ctx.lineWidth = 0.5;
		line(ctx, 0, height / 2, width * 0.9, height / 2);
	}
	return canvas;
}

// ---------------------------------------------------------------------------------------
// The painted landscape proper: the peaks of the middle distance, the rocky shore and its
// trees in front, and a village. They follow the order a landscape painter works in:
// outline the forms (勾), texture them along their structure (皴), rub in the shadows (擦),
// dot moss and trees onto the ridges (点), and wash with ink and a little colour (染). The
// ink is built up in layers (积墨), pale washes first and darker touches over them, so its
// tone varies the way it does where a brush has gone over the paper again and again.

export const GREEN = [74, 118, 108];
export const OCHRE = [172, 124, 74];
// the green-black of moss dots and foliage
export const MOSS = [34, 48, 40];
// how much of its canvas's height a peak's summit reaches: the rest is room for the moss
// and little trees on top and the ink of its outline
const PEAK_TOP = 0.92;
// the pale ground a peak or a rock is laid in on: a painted mountain hides what is behind it
const BODY = mix(PAPER, MIST, 0.55);
// what colours turn toward in the distance
const HAZE = [122, 138, 148];

// A brush stroke along `points` ([x, y] in drawing order), laid down as bristles side by
// side: it swells after the press, narrows as the brush lifts, and breaks into dry streaks
// toward its end and along its edges. The caller sets strokeStyle.
// A landscape takes thousands of these, so each bristle's unbroken stretches are stroked as
// one path, broken only where its width or ink changes noticeably.
export function brushStroke(ctx, points, width, alpha, dryness) {
	let n = points.length;
	if (n < 2) return;
	let rand = Math.random;
	let normals = [];
	for (let i = 0; i < n; i++) {
		let a = points[Math.max(0, i - 1)];
		let b = points[Math.min(n - 1, i + 1)];
		let length = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
		normals.push([-(b[1] - a[1]) / length, (b[0] - a[0]) / length]);
	}
	let bristles = Math.max(1, Math.min(6, Math.round(width / 1.1)));
	let wetness = valueNoise(rand, 24);
	ctx.lineCap = 'round';
	ctx.lineJoin = 'round';
	for (let k = 0; k < bristles; k++) {
		let lane = bristles == 1 ? 0 : k / (bristles - 1) - 0.5;
		let phase = rand() * 24;
		let run = [];
		let runWidth = 0;
		let runAlpha = 0;
		let flush = () => {
			if (run.length > 1) {
				ctx.lineWidth = runWidth;
				ctx.globalAlpha = runAlpha;
				ctx.beginPath();
				run.forEach((q, j) => j ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]));
				ctx.stroke();
			}
			run = [];
		};
		for (let i = 1; i < n; i++) {
			let t = i / (n - 1);
			let wet = wetness(phase + i * 0.45) + 0.4 - dryness * (t + Math.abs(lane) * 1.2);
			if (wet < 0.2) {
				flush();
				continue;
			}
			let swell = Math.min(1, 0.35 + t * 4) * (1 - 0.7 * t * t);
			let offset = lane * width * swell;
			let w = bristles == 1 ? Math.max(0.4, width * swell) : Math.max(0.5, width / bristles * 1.5);
			let ink = Math.min(1, alpha * (0.5 + 0.5 * Math.min(1, wet)));
			if (run.length && (Math.abs(w - runWidth) > runWidth * 0.3 || Math.abs(ink - runAlpha) > 0.12)) {
				flush();
			}
			if (!run.length) {
				run.push([points[i - 1][0] + normals[i - 1][0] * offset, points[i - 1][1] + normals[i - 1][1] * offset]);
				runWidth = w;
				runAlpha = ink;
			}
			run.push([points[i][0] + normals[i][0] * offset, points[i][1] + normals[i][1] * offset]);
		}
		flush();
	}
}

// fills `path` with a vertical gradient: stops are [y, rgb, alpha]
function shadeDown(ctx, path, stops) {
	let gradient = ctx.createLinearGradient(0, stops[0][0], 0, stops[stops.length - 1][0]);
	let span = stops[stops.length - 1][0] - stops[0][0] || 1;
	stops.forEach((stop) => gradient.addColorStop(clamp((stop[0] - stops[0][0]) / span, 0, 1), rgba(stop[1], stop[2])));
	ctx.fillStyle = gradient;
	ctx.fill(path);
}

// Touches of soft ink (or of light) laid over a form: `spot()` gives each one's [x, y, size],
// or null to skip it. The caller clips to the form.
function mottle(ctx, sprite, count, alpha, spot) {
	let rand = Math.random;
	for (let i = 0; i < count; i++) {
		let s = spot();
		if (!s) continue;
		ctx.globalAlpha = alpha * (0.35 + rand() * 0.65);
		ctx.drawImage(sprite, s[0] - s[2] / 2, s[1] - s[2] * 0.35, s[2], s[2] * 0.7);
	}
	ctx.globalAlpha = 1;
}

// A landscape is dotted with thousands of clumps of moss and clusters of leaves. Painting
// each one dab by dab is slow, so a few of each are painted once, as stamps, and the
// landscape is printed with those.
// Each stamp is painted at twice the size it is drawn at most, so it stays crisp.
const CLUMP = 16;
const LEAVES = 40;

function stampOf(width, height, paint) {
	let {canvas, ctx} = canvasOf(width, height, 2);
	paint(ctx);
	return canvas;
}

export function makeStamps(moss) {
	let rand = Math.random;
	let stamps = {clumps: [], leaves: {round: [], upright: []}};
	for (let v = 0; v < 8; v++) {
		// a few dabs huddled together, some standing up from the line they sit on
		stamps.clumps.push(stampOf(CLUMP * 3, CLUMP * 2.6, (ctx) => {
			for (let i = 0, count = 3 + Math.floor(rand() * 5); i < count; i++) {
				let w = CLUMP * (0.4 + rand() * 0.45);
				let h = w * (0.8 + rand() * 0.8);
				ctx.globalAlpha = 0.5 + rand() * 0.5;
				ctx.drawImage(moss, CLUMP * 1.5 + (rand() - 0.5) * CLUMP * 1.7 - w / 2, CLUMP * 2.25 - rand() * CLUMP * 0.7 - h * 0.75, w, h);
			}
		}));
	}
	Object.keys(stamps.leaves).forEach((style) => {
		for (let v = 0; v < 5; v++) {
			// dotted leaves, densest underneath and on the right, the side away from the light
			stamps.leaves[style].push(stampOf(LEAVES * 2.6, LEAVES * 1.9, (ctx) => {
				let r = LEAVES;
				let x = r * 1.3;
				let y = r * 1;
				for (let i = 0, count = Math.round(16 + r * 1.8); i < count; i++) {
					let a = rand() * Math.PI * 2;
					let d = Math.sqrt(rand());
					let px = x + Math.cos(a) * r * d;
					let py = y + Math.sin(a) * r * d * 0.72;
					let dark = (py - y) / r * 0.45 + (px - x) / r * 0.25;
					let s = r * (0.2 + rand() * 0.14);
					ctx.globalAlpha = clamp(0.55 + dark + rand() * 0.3, 0.15, 1);
					if (style == 'upright') {
						ctx.drawImage(moss, px - s * 0.32, py - s * 0.65, s * 0.64, s * 1.3);
					} else {
						ctx.drawImage(moss, px - s * 0.45, py - s * 0.45, s * 0.9, s * 0.9);
					}
				}
			}));
		}
	});
	return stamps;
}

// A clump of moss dots (点苔), or of trees too far off to draw as trees, sitting on a ridge
// or a ledge at (x, y).
export function clump(ctx, art, x, y, size, alpha) {
	let stamp = pick(art.stamps.clumps);
	let k = size / CLUMP;
	ctx.globalAlpha = alpha;
	ctx.drawImage(stamp, x - CLUMP * 1.5 * k, y - CLUMP * 2.25 * k, CLUMP * 3 * k, CLUMP * 2.6 * k);
}

// The leaves of a tree, dotted in clusters (点叶): round pepper dots or upright dots, as the
// painting manuals teach. The underside and the side away from the light are dotted
// densest and darkest.
function foliage(ctx, art, x, y, r, alpha, style, shade) {
	ctx.globalAlpha = alpha * 0.25;
	ctx.drawImage(art.wash, x - r * 1.2, y - r * 0.75, r * 2.4, r * 1.5);
	let stamp = pick(art.stamps.leaves[style] || art.stamps.leaves.round);
	let k = r / LEAVES;
	ctx.globalAlpha = alpha;
	if (shade < 0) {
		// the shadows fall to the left: the stamp is turned round
		ctx.save();
		ctx.translate(x, y);
		ctx.scale(-1, 1);
		ctx.drawImage(stamp, -LEAVES * 1.3 * k, -LEAVES * k, LEAVES * 2.6 * k, LEAVES * 1.9 * k);
		ctx.restore();
	} else {
		ctx.drawImage(stamp, x - LEAVES * 1.3 * k, y - LEAVES * k, LEAVES * 2.6 * k, LEAVES * 1.9 * k);
	}
	ctx.globalAlpha = 1;
}

// the ridge of a form: points from left to right, `heightAt(u)` (0..1 of the canvas height)
// sampled across [from, to] of its width
function ridgeOf(width, height, from, to, heightAt) {
	let points = [];
	for (let u = Math.max(0, from); u <= Math.min(1, to) + 1e-6; u += 2 / width) {
		points.push([u * width, height * (1 - heightAt(u))]);
	}
	return points;
}

function closedPath(points, bottom) {
	let path = new Path2D();
	points.forEach((q, i) => i ? path.lineTo(q[0], q[1]) : path.moveTo(q[0], q[1]));
	path.lineTo(points[points.length - 1][0], bottom);
	path.lineTo(points[0][0], bottom);
	path.closePath();
	return path;
}

// the outline of a form in short strokes, so the line has fresh presses and breaks; heavy
// on the shaded side, light and broken where the light falls
function outlineRidge(ctx, points, centre, shade, weight, alpha, lowest) {
	ctx.strokeStyle = rgba(INK, 1);
	let rand = Math.random;
	for (let s = 0; s < points.length - 1;) {
		let length = 6 + Math.floor(rand() * 14);
		let piece = points.slice(s, s + length + 1).filter((q) => q[1] < lowest);
		s += length;
		if (piece.length < 2) continue;
		let shaded = (piece[0][0] - centre) * shade > 0;
		if (rand() < (shaded ? 0.95 : 0.65)) {
			brushStroke(ctx, piece, weight * (shaded ? 1.6 : 0.9), alpha * (shaded ? 1 : 0.6), 0.55);
		}
	}
}

// A waterfall the way a painter leaves one: the water is bare paper (留白), no brighter than
// the paper, and what shows it is the rock: the shadowed notch it pours from, the dark cliff
// on either side darkest against the water, broken outlines, and a few faint threads of
// falling water. It drops in one leap or two, widening a little as it falls, a jutting rock
// hiding where it strikes between them, and fades away into the cloud below.
// Painted 'source-atop' a peak's column; (x, top) is where it pours out, k its scale.
function paintWaterfall(ctx, art, x, top, length, k, ink) {
	let rand = Math.random;
	let leaps = rand() < 0.35 ? 2 : 1;
	let y = top;
	ctx.strokeStyle = rgba(INK, 1);
	ctx.globalAlpha = ink * 0.45;
	ctx.drawImage(art.wash, x - 6 * k, y - 6 * k, 12 * k, 9 * k);
	for (let leap = 0; leap < leaps; leap++) {
		let last = leap == leaps - 1;
		let drop = length * (leaps == 1 ? 1 : leap ? 0.6 : 0.4);
		let lean = (rand() - 0.5) * 5 * k;
		let left = [];
		let right = [];
		for (let i = 0; i <= 10; i++) {
			let t = i / 10;
			let middle = x + lean * t * t;
			// narrow where it slips out of the rock, then spreading
			let half = (1.2 + Math.sqrt(t) * 3.8 + leap * 1.5) * k;
			// here and there a rock juts into the stream from one side or the other
			let bite = rand() < 0.2 ? 1.8 * k : 0;
			let side = rand() < 0.5;
			left.push([middle - half + (side ? bite : 0) + (rand() - 0.5) * 1.4 * k, y + drop * t]);
			right.push([middle + half - (side ? 0 : bite) + (rand() - 0.5) * 1.4 * k, y + drop * t]);
		}
		// the cliff on either side, in deep shadow where it meets the water: uneven touches
		// of wash, heaviest partway down and fading out above and below, and a few short
		// axe strokes
		[[left, -1], [right, 1]].forEach(([edge, side]) => {
			edge.forEach((q, i) => {
				let t = i / (edge.length - 1);
				let w = (5 + rand() * 6) * k;
				let h = (7 + rand() * 7) * k;
				ctx.globalAlpha = ink * (0.2 + rand() * 0.2) * Math.sin(Math.PI * (0.1 + t * 0.8));
				ctx.drawImage(art.wash, q[0] + side * (w * 0.35 + rand() * 2 * k) - w / 2, q[1] - h / 2, w, h);
			});
		});
		[[left, -1], [right, 1]].forEach(([edge, side]) => {
			for (let i = 1; i < 9; i += 2 + Math.floor(rand() * 2)) {
				let q = edge[i];
				let reach = (4 + rand() * 6) * k;
				brushStroke(ctx, [[q[0] + side * k, q[1]], [q[0] + side * reach * 0.6, q[1] + reach * 0.4], [q[0] + side * reach, q[1] + reach * 0.9]],
					(1.5 + rand()) * k, ink * 0.5, 0.6);
			}
		});
		// the water, paper again, thinning away at the foot of the last leap
		let water = new Path2D();
		left.forEach((q, i) => i ? water.lineTo(q[0], q[1]) : water.moveTo(q[0], q[1]));
		for (let i = right.length - 1; i >= 0; i--) {
			water.lineTo(right[i][0], right[i][1]);
		}
		water.closePath();
		ctx.globalAlpha = 1;
		shadeDown(ctx, water, [[y, BODY, 0.9], [y + drop * 0.6, BODY, 0.85], [y + drop, BODY, last ? 0 : 0.7]]);
		brushStroke(ctx, left.slice(0, last ? 8 : 11), 1.1 * k, ink * 0.6, 0.6);
		brushStroke(ctx, right.slice(0, last ? 8 : 11), 1.4 * k, ink * 0.7, 0.6);
		// threads of falling water down its length
		for (let j = 0; j < 4; j++) {
			let f = 0.15 + j * 0.23 + (rand() - 0.5) * 0.1;
			let thread = left.map((q, i) => [q[0] + (right[i][0] - q[0]) * f, q[1]]).slice(1 + Math.floor(rand() * 2), 7 + Math.floor(rand() * 4));
			brushStroke(ctx, thread, 0.5 * k, ink * 0.24, 0.75);
		}
		if (last) {
			// where it lands, spray spreading sideways and lost in the cloud
			let foot = left[left.length - 1][1];
			for (let j = 0; j < 3; j++) {
				let w = (26 + rand() * 18) * k;
				ctx.globalAlpha = 0.25 + rand() * 0.15;
				ctx.drawImage(art.puff, x + lean - w / 2 + (rand() - 0.5) * 8 * k, foot - (6 + j * 3) * k, w, 8 * k);
			}
		}
		if (!last) {
			// a jutting rock hides where it strikes and leaps again
			let ledge = y + drop;
			ctx.globalAlpha = ink * 0.5;
			ctx.drawImage(art.wash, x + lean - 11 * k, ledge - 3 * k, 22 * k, 9 * k);
			brushStroke(ctx, [[x + lean - 10 * k, ledge + 1.5 * k], [x + lean, ledge - k], [x + lean + 10 * k, ledge + 2 * k]], 1.5 * k, ink * 0.75, 0.5);
			clump(ctx, art, x + lean + (rand() - 0.5) * 8 * k, ledge, 3.2 * k, ink * 0.6);
			x += lean + (rand() - 0.5) * 4 * k;
			y = ledge + 4 * k;
		}
	}
	ctx.globalAlpha = 1;
}

// A peak of the middle distance: a cluster of karst columns (rounded tops, sheer sides, as
// along the Li river) or a broader massif. Each column is painted whole over the ones behind
// it, on a pale ground that hides them, with a drift of cloud left between, so the cluster
// has depth the way a painted one does.
// look: {wild, wet, karst, near, depth, shade, colors: [upper, lower] | null, snow, waterfall}.
// `depth` (0 nearest .. 1) fades it into the haze; `shade` is +1 when light comes from the
// left and the shadows fall on the right.
// Painting one takes a good many milliseconds, so this is a generator: it pauses (yields)
// between pieces of the work, so the painting can be spread over frames, and finally
// returns the canvas.
export function* makePeak(width, height, look, art, scale) {
	let {canvas, ctx} = canvasOf(width, height, scale);
	let sheet = canvasOf(width, height, scale);
	let rand = Math.random;
	let wild = look.wild;
	let shade = look.shade;
	let karst = look.karst;
	let haze = look.depth || 0;
	let ink = (1 - haze * 0.35) * (look.near ? 1.1 : 0.95) * (0.85 + wild * 0.25 + look.wet * 0.3);
	let colors = look.colors && look.colors.map((c) => mix(c, HAZE, haze * 0.5));

	let columns = [{c: 0.36 + rand() * 0.28, w: (karst ? 0.16 : 0.27) + rand() * 0.07, h: 1}];
	for (let i = 0, extra = karst ? 2 + Math.floor(rand() * 3) : 1 + Math.floor(rand() * 2); i < extra; i++) {
		let side = rand() < 0.5 ? -1 : 1;
		columns.push({
			c: clamp(columns[0].c + side * (0.12 + rand() * 0.3), 0.1, 0.9),
			w: (karst ? 0.08 : 0.14) + rand() * 0.08,
			h: 0.28 + rand() * 0.5
		});
	}
	columns.forEach((col) => {
		col.p = karst ? 2.1 + rand() * 1.2 - wild * 0.6 : 1.35 + rand() * 0.4;
		// one flank steeper than the other, a crest that is never quite smooth, and
		// shoulders stepping down the flanks; some towers rise from a broader body
		col.skew = (rand() - 0.5) * 0.8;
		col.noise = midpoint(rand, 0.5 + wild * 0.15);
		col.rough = 0.045 + wild * 0.05;
		col.tier = karst && rand() < 0.5 ? {narrow: 0.5 + rand() * 0.2, body: 0.55 + rand() * 0.2} : null;
		col.knolls = [];
		for (let k = 0, n = 1 + Math.floor(rand() * 2); k < n; k++) {
			col.knolls.push({at: (rand() < 0.5 ? -1 : 1) * (0.35 + rand() * 0.4), w: 0.25 + rand() * 0.25, h: 0.4 + rand() * 0.35});
		}
	});
	// the tallest stand furthest back
	columns.sort((a, b) => b.h - a.h);
	let dome = (a, p) => (a < 1 ? Math.pow(1 - Math.pow(a, p), 1 / p) : 0);
	// the column's form without its broken crest or its skirt; d is measured in its widths
	let massOf = (col, d) => {
		d /= d < 0 ? 1 - col.skew : 1 + col.skew;
		let ad = Math.abs(d);
		let h = col.tier ? Math.max(dome(ad / col.tier.narrow, col.p), col.tier.body * dome(ad, 3)) : dome(ad, col.p);
		col.knolls.forEach((k) => {
			h = Math.max(h, k.h * dome(Math.abs(d - k.at) / k.w, 2.6));
		});
		return h;
	};
	// The cluster is moved and if need be narrowed to lie within the canvas, with a margin,
	// or a column running off the edge would be cut off there in a sheer wall.
	let from = Infinity;
	let to = -Infinity;
	columns.forEach((col) => {
		for (let d = -3; d <= 3; d += 0.02) {
			if (massOf(col, d) > 0.02) {
				from = Math.min(from, col.c + d * col.w);
				to = Math.max(to, col.c + d * col.w);
			}
		}
	});
	let fit = Math.min(1, 0.84 / (to - from));
	let shift = 0.5 - (from + to) / 2 * fit;
	columns.forEach((col) => {
		col.c = col.c * fit + shift;
		col.w *= fit;
	});
	let rawOf = (col, u) => {
		let d = (u - col.c) / col.w;
		let h = massOf(col, d);
		// a broad skirt at the foot, sloping away to nothing at the canvas's sides
		let ad = Math.abs(d / (d < 0 ? 1 - col.skew : 1 + col.skew));
		if (ad < 1.6) h = Math.max(h, 0.2 * (1 - ad * ad / 2.56) * smoothstep(0, 0.08, u) * smoothstep(0, 0.08, 1 - u));
		return h <= 0 ? 0 : Math.max(0, h + col.noise(clamp(u, 0, 1)) * col.rough * (0.4 + h));
	};
	// Each column is scaled so that its highest point stands exactly as tall as intended: its
	// broken crest is never flattened against a ceiling, and there is room above it for the
	// moss and little trees on the summit.
	columns.forEach((col) => {
		let top = 0;
		for (let u = col.c - col.w * 2; u <= col.c + col.w * 2; u += 0.004) {
			top = Math.max(top, rawOf(col, u));
		}
		col.top = top || 1;
	});
	// the room above the summit is at least 16px, for the moss and little trees on it,
	// which are the same size however small the peak is drawn
	let summit = Math.min(PEAK_TOP, 1 - 16 / height);
	let heightOf = (col, u) => summit * col.h * rawOf(col, u) / col.top;

	ctx.lineJoin = 'round';
	for (let index = 0; index < columns.length; index++) {
		let col = columns[index];
		let s = sheet.ctx;
		s.globalCompositeOperation = 'source-over';
		s.globalAlpha = 1;
		s.clearRect(0, 0, width, height);
		// as far out as its knolls and skirt reach, or the outline would end in a sheer drop
		let points = ridgeOf(width, height, col.c - col.w * 2.3, col.c + col.w * 2.3, (u) => heightOf(col, u));
		let outline = closedPath(points, height);
		let top = height * (1 - summit * col.h);
		let tall = height - top;
		let cx = col.c * width;
		let cw = col.w * width;
		s.lineJoin = 'round';

		// 染: the pale ground, an ink wash darkest at the crest, and a little colour. All
		// that is laid inside the column from here on is drawn 'source-atop' the ground, so
		// it stays within the outline (clipping to the outline costs far more).
		s.fillStyle = rgba(BODY, 0.95);
		s.fill(outline);
		s.globalCompositeOperation = 'source-atop';
		shadeDown(s, outline, [[top, INK, ink * (look.snow ? 0.1 : 0.42)], [top + tall * 0.45, INK, ink * 0.2], [height, INK, ink * 0.05]]);
		if (colors) {
			shadeDown(s, outline, [[top, colors[0], 0.55], [top + tall * 0.6, colors[0], 0.35], [height, colors[1], 0.4]]);
		}
		// 擦: the shaded flank rubbed darker
		let rub = s.createLinearGradient(cx - shade * cw * 0.3, 0, cx + shade * cw * 1.1, 0);
		rub.addColorStop(0, rgba(INK, 0));
		rub.addColorStop(1, rgba(INK, ink * (look.snow ? 0.18 : 0.3)));
		s.fillStyle = rub;
		s.fill(outline);
		// 积墨: soft touches of ink gathering under the crest and on the shaded side, and a
		// few lighter patches where the light falls
		let area = cw * tall;
		mottle(s, art.wash, Math.round(area / 140), ink * 0.13, () => {
			let x = cx + (rand() * 2 - 1) * cw * 1.1 + shade * cw * 0.3 * rand();
			return [x, top + Math.pow(rand(), 1.7) * tall * 0.8, cw * (0.2 + rand() * 0.45)];
		});
		mottle(s, art.puff, Math.round(area / 900), 0.3, () =>
			[cx - shade * cw * (0.15 + rand() * 0.6), top + tall * (0.1 + rand() * 0.6), cw * (0.3 + rand() * 0.4)]);

		// folds running down from the crest, each with its shaded side rubbed in
		let folds = [];
		for (let i = 0, count = karst ? 2 + Math.floor(rand() * 3) : 1 + Math.floor(rand() * 3); i < count; i++) {
			let u = col.c + (rand() * 1.4 - 0.7) * col.w;
			let x = u * width;
			let y0 = height * (1 - heightOf(col, u));
			if (y0 > height * 0.8) continue;
			let side = (u - col.c) / col.w;
			let length = (height - y0) * (0.4 + rand() * 0.4);
			let fold = [];
			for (let k = 0; k <= 10; k++) {
				let t = k / 10;
				fold.push([x + side * cw * 0.35 * t * t + col.noise(clamp(u + t * 0.1, 0, 1)) * 5, y0 + 2 + length * t]);
			}
			folds.push(fold);
		}
		s.filter = 'blur(2.5px)';
		s.strokeStyle = rgba(INK, 1);
		folds.forEach((fold) => {
			let band = cw * 0.18;
			s.lineWidth = band;
			s.globalAlpha = ink * 0.16;
			s.beginPath();
			fold.forEach((q, i) => i ? s.lineTo(q[0] + shade * band * 0.45, q[1]) : s.moveTo(q[0] + shade * band * 0.45, q[1]));
			s.stroke();
		});
		s.filter = 'none';

		yield;

		// 皴: bundles of long strokes running down the flanks with the roundness of the rock,
		// like strands of hemp (披麻), some branching off the folds; densest under the crest
		// and on the shaded side. Stormy music makes them shorter and harder.
		let bundles = Math.round(area / (look.near ? 1300 : 1700));
		for (let i = 0; i < bundles; i++) {
			let fold = folds.length && rand() < 0.4 ? folds[Math.floor(rand() * folds.length)] : null;
			let start;
			let side;
			if (fold) {
				start = fold[1 + Math.floor(rand() * 5)];
				side = rand() < 0.5 ? -1 : 1;
			} else {
				side = rand() * 2 - 1;
				let u = col.c + side * col.w * 0.9;
				start = [u * width, height * (1 - heightOf(col, u)) + 3 + Math.pow(rand(), 1.5) * tall * 0.4];
			}
			let shaded = (start[0] - cx) * shade > 0;
			if (!shaded && rand() < 0.45) continue;
			let length = tall * (0.08 + rand() * 0.14) * (1 - wild * 0.3);
			let bow = side * length * (0.35 + wild * 0.2);
			let fade = 1 - smoothstep(0, tall * 0.8, start[1] - top);
			let count = 3 + Math.floor(rand() * 4);
			let gap = (look.near ? 3 : 2.4) * (0.8 + rand() * 0.5);
			for (let k = 0; k < count; k++) {
				let off = (k - (count - 1) / 2) * gap;
				let reach = length * (0.6 + rand() * 0.4);
				let points = [];
				for (let j = 0; j <= 4; j++) {
					let t = j / 4;
					points.push([start[0] + off * (1 + 0.3 * t) + bow * t * t, start[1] + Math.abs(off) * 0.4 + reach * t]);
				}
				brushStroke(s, points, (0.8 + rand() * 0.9) * (look.near ? 1.25 : 1) * (1 + wild * 0.4),
					ink * (0.26 + rand() * 0.3) * (shaded ? 1.15 : 0.7) * fade, 0.55);
			}
		}
		folds.forEach((fold) => brushStroke(s, fold.slice(0, 7), 1.2 * (look.near ? 1.2 : 0.9), ink * 0.45, 0.65));

		// ledges across the face, with moss on them and shadow under them
		for (let i = 0, count = karst ? Math.floor(rand() * 3) : 1; i < count; i++) {
			let y = top + tall * (0.2 + rand() * 0.4);
			let x0 = cx + (rand() - 0.8) * cw * 0.8;
			let x1 = x0 + cw * (0.3 + rand() * 0.5);
			let ledge = [];
			for (let k = 0; k <= 6; k++) {
				ledge.push([x0 + (x1 - x0) * k / 6, y + (k / 6) * shade * 4 + (rand() - 0.5) * 2]);
			}
			s.globalAlpha = ink * 0.25;
			s.drawImage(art.wash, x0, y, x1 - x0, tall * 0.07);
			brushStroke(s, ledge, 1.2, ink * 0.5, 0.6);
			for (let x = x0; x < x1; x += 6 + rand() * 8) {
				if (rand() < 0.6) clump(s, art, x, y + 1, look.near ? 3.6 : 3, ink * 0.65);
			}
		}

		// patches of trees and moss gathering in the folds and on the upper face
		folds.forEach((fold) => {
			for (let k = 1; k < 7; k += 2 + Math.floor(rand() * 2)) {
				clump(s, art, fold[k][0] + shade * 3, fold[k][1] + 3, look.near ? 4.2 : 3.4, ink * 0.65);
			}
		});
		for (let i = 0, count = Math.round(area / 1100); i < count; i++) {
			let x = cx + (rand() * 2 - 1) * cw * 0.85;
			let y = height * (1 - heightOf(col, x / width)) + 6 + Math.pow(rand(), 1.6) * tall * 0.45;
			for (let k = 0, n = 1 + Math.floor(rand() * 3); k < n; k++) {
				clump(s, art, x + (rand() - 0.5) * 10, y + (rand() - 0.5) * 6, look.near ? 3.8 : 3.1, ink * 0.6);
			}
		}

		// the waterfall pours from a cleft in the tallest column, the one at the back, if it
		// is broad enough to hold one: on a slender column it would split it like an archway
		if (look.waterfall && index == 0 && cw > 70) {
			let x = cx + (rand() - 0.5) * cw * 0.5;
			paintWaterfall(s, art, x, height * (1 - heightOf(col, x / width)) + tall * (0.12 + rand() * 0.1),
				tall * (0.3 + rand() * 0.1), clamp(cw / 70, 0.6, 1.4), ink);
		}

		if (look.snow) {
			// snow lies on the crests: the paper is left bare and brightened there
			shadeDown(s, outline, [[top, SNOW, 0.85], [top + tall * 0.3, SNOW, 0.35], [top + tall * 0.55, SNOW, 0]]);
		}
		s.globalCompositeOperation = 'source-over';

		// 勾 and 点: the outline, then moss and little trees along the crest
		outlineRidge(s, points, cx, shade, look.near ? 1.4 : 1.1, ink * 0.65, height * 0.85);
		points.forEach((q, i) => {
			if (i % 4 || q[1] > top + tall * 0.55 || rand() < 0.45) return;
			let size = (look.near ? 4.6 : 3.6) * (0.7 + rand() * 0.6);
			// a little tree standing up from the ridge, where there is room above it
			if (rand() < 0.12 && q[1] > size * 5) {
				s.strokeStyle = rgba(INK, 1);
				s.lineWidth = 0.8;
				s.globalAlpha = ink * 0.7;
				line(s, q[0], q[1] + 1, q[0] + (rand() - 0.5) * 2, q[1] - size * 2);
				clump(s, art, q[0], q[1] - size * 1.6, size * 1.1, ink * 0.8);
			} else {
				clump(s, art, q[0], q[1] + 2, size, ink * 0.75);
			}
		});

		// the foot dissolves into cloud
		s.globalCompositeOperation = 'destination-out';
		s.globalAlpha = 1;
		let foot = s.createLinearGradient(0, top + tall * 0.5, 0, height);
		foot.addColorStop(0, 'rgba(0, 0, 0, 0)');
		foot.addColorStop(1, 'rgba(0, 0, 0, 1)');
		s.fillStyle = foot;
		s.fillRect(0, 0, width, height);
		s.globalCompositeOperation = 'source-over';
		ctx.globalAlpha = 1;
		ctx.drawImage(sheet.canvas, 0, 0, width, height);

		// cloud drifting between this column and the ones in front of it
		let next = columns[index + 1];
		if (next) {
			let y = height * (1 - summit * next.h * (0.3 + rand() * 0.3));
			for (let k = 0; k < 4; k++) {
				let x = clamp(next.c + (rand() - 0.5) * next.w * 2, 0.05, 0.95) * width;
				// kept within the canvas, or its edge would cut the cloud off
				let w = Math.min(next.w * width * (1 + rand() * 1.5), 2 * Math.min(x, width - x));
				let h = height * (0.04 + rand() * 0.06);
				ctx.globalAlpha = 0.15 + rand() * 0.25;
				ctx.drawImage(art.puff, x - w / 2, y + (rand() - 0.5) * height * 0.08 - h / 2, w, h);
			}
		}
		yield;
	}
	sheet.canvas.width = 0;
	sheet.canvas.height = 0;

	ctx.globalCompositeOperation = 'destination-out';
	// cloud wrapped around the waist
	if (rand() < 0.35 + (1 - wild) * 0.3) {
		let y = height * (0.35 + rand() * 0.25);
		let span = width * (0.4 + rand() * 0.4);
		let x = rand() * (width - span);
		for (let i = 0; i < 9; i++) {
			let w = span * (0.25 + rand() * 0.35);
			let h = height * (0.04 + rand() * 0.05);
			ctx.globalAlpha = 0.4 + rand() * 0.45;
			ctx.drawImage(art.wash, x + rand() * span - w / 2, y + (rand() - 0.5) * height * 0.05 - h / 2, w, h);
		}
	}
	ctx.globalAlpha = 1;
	let foot = ctx.createLinearGradient(0, height * 0.8, 0, height);
	foot.addColorStop(0, 'rgba(0, 0, 0, 0)');
	foot.addColorStop(1, 'rgba(0, 0, 0, 1)');
	ctx.fillStyle = foot;
	ctx.fillRect(0, 0, width, height);
	ctx.globalCompositeOperation = 'source-over';
	return canvas;
}

// The near shore, in a lower corner of the picture: a bank of heavy rocks, their faces split
// into planes by axe-cut strokes (斧劈皴), rising toward the edge of the picture.
// look: {shade, outer, colors}; `outer` is -1 when the picture's edge is on the left.
// Like makePeak, a generator that pauses between rocks and returns the canvas.
export function* makeShore(width, height, look, art, scale) {
	let {canvas, ctx} = canvasOf(width, height, scale);
	let rand = Math.random;
	let shade = look.shade;
	let outer = look.outer;
	let band = height * (0.7 + rand() * 0.25);
	let edgeward = (u) => (outer < 0 ? 1 - u : u);
	let rocks = [];
	for (let i = 0, count = 3 + Math.floor(rand() * 3); i < count; i++) {
		// each rock, foot and all, lies within the canvas, or its edge would cut it off
		let w = 0.08 + rand() * 0.12;
		let c = w * 1.5 + 0.01 + rand() * (0.98 - w * 3);
		rocks.push({c, w, h: (0.3 + rand() * 0.55) * (0.4 + 0.6 * edgeward(c)), p: 1.8 + rand() * 1.2, tilt: (rand() - 0.5) * 0.4, noise: midpoint(rand, 0.55)});
	}
	rocks.sort((a, b) => b.h - a.h);
	let heightOf = (rock, u) => {
		let d = Math.abs(u - rock.c) / rock.w;
		if (d >= 1.5) return 0;
		// a rounded mass whose foot spreads in a low slope, so that it sits on the ground
		// rather than ending in a sheer wall
		let dome = d < 1 ? Math.pow(1 - Math.pow(d, rock.p), 1 / rock.p) : 0;
		let shape = Math.max(dome, 0.3 * (1 - d * d / 2.25));
		let h = rock.h * shape * (1 + rock.tilt * (u - rock.c) / rock.w);
		return clamp(h + rock.noise(u) * 0.1 * rock.h * shape, 0, 1) * band / height;
	};
	let topOf = (x) => {
		let h = 0;
		rocks.forEach((rock) => {
			h = Math.max(h, heightOf(rock, x / width));
		});
		return height * (1 - h);
	};

	let sheet = canvasOf(width, height, scale);
	for (let r = 0; r < rocks.length; r++) {
		let rock = rocks[r];
		let points = ridgeOf(width, height, rock.c - rock.w * 1.5, rock.c + rock.w * 1.5, (u) => heightOf(rock, u));
		if (points.length < 2) continue;
		let outline = closedPath(points, height);
		let top = height - rock.h * band;
		let cx = rock.c * width;
		let cw = rock.w * width;
		// each rock is painted on its own sheet, everything inside it 'source-atop' its
		// pale ground so it stays within the outline, then laid down
		let s = sheet.ctx;
		s.globalCompositeOperation = 'source-over';
		s.globalAlpha = 1;
		s.clearRect(0, 0, width, height);
		s.fillStyle = rgba(BODY, 0.95);
		s.fill(outline);
		s.globalCompositeOperation = 'source-atop';
		shadeDown(s, outline, [[top, INK, 0.42], [top + 8, INK, 0.3], [height, INK, 0.14]]);
		if (look.colors) {
			shadeDown(s, outline, [[top, look.colors[0], 0.3], [height, look.colors[1], 0.35]]);
		}
		let rub = s.createLinearGradient(cx - shade * cw * 0.2, 0, cx + shade * cw, 0);
		rub.addColorStop(0, rgba(INK, 0));
		rub.addColorStop(1, rgba(INK, 0.4));
		s.fillStyle = rub;
		s.fill(outline);
		mottle(s, art.wash, Math.round(cw * rock.h * band / 120), 0.12, () =>
			[cx + (rand() * 2 - 1) * cw, top + rand() * rock.h * band, cw * (0.2 + rand() * 0.4)]);
		// axe cuts: a crease or two splitting the rock into planes, and broad slanting
		// strokes along the shaded plane of each
		s.strokeStyle = rgba(INK, 1);
		for (let k = 0, creases = 1 + Math.floor(rand() * 2); k < creases; k++) {
			let x = cx + (rand() - 0.5) * cw * 0.9;
			let y = topOf(x);
			let slant = shade * (0.3 + rand() * 0.4);
			let length = (height - y) * (0.5 + rand() * 0.4);
			let crease = [];
			for (let j = 0; j <= 5; j++) {
				let t = j / 5;
				crease.push([x + slant * length * t, y + length * t]);
			}
			brushStroke(s, crease, 1.8, 0.6, 0.5);
			for (let j = 0, cuts = 5 + Math.floor(rand() * 5); j < cuts; j++) {
				let from = crease[Math.floor(rand() * 4)];
				let along = cw * (0.08 + rand() * 0.12) * shade;
				let cut = (8 + rand() * 14);
				brushStroke(s, [[from[0] + along, from[1]], [from[0] + along + slant * cut * 0.5, from[1] + cut * 0.5], [from[0] + along + slant * cut, from[1] + cut]],
					3 + rand() * 4, 0.3 + rand() * 0.3, 0.75);
			}
		}
		s.globalCompositeOperation = 'source-over';
		ctx.globalAlpha = 1;
		ctx.drawImage(sheet.canvas, 0, 0, width, height);
		outlineRidge(ctx, points, cx, shade, 1.8, 0.8, height - 2);
		for (let x = points[0][0] + 4; x < points[points.length - 1][0] - 4; x += 6 + rand() * 9) {
			let y = topOf(x);
			if (rand() < 0.5 && y < height - 6) clump(ctx, art, x, y + 2, 4.5, 0.8);
		}
		yield;
	}

	sheet.canvas.width = 0;
	sheet.canvas.height = 0;
	// the water lapping at the foot of the rocks
	ctx.strokeStyle = rgba(INK, 1);
	for (let i = 0; i < 4; i++) {
		let x = width * (0.1 + rand() * 0.8);
		let w = width * (0.06 + rand() * 0.1);
		brushStroke(ctx, [[x, height - 2 - i * 3], [x + w * 0.5, height - 3 - i * 3], [x + w, height - 2 - i * 3]], 0.9, 0.3, 0.6);
	}
	ctx.globalAlpha = 1;
	return canvas;
}

function pick(list) {
	return list[Math.floor(Math.random() * list.length)];
}

// A few houses with dark tiled roofs and pale walls among trees, on a low bank.
export function makeVillage(width, height, art, scale) {
	let {canvas, ctx} = canvasOf(width, height, scale);
	let rand = Math.random;
	ctx.globalAlpha = 0.35;
	ctx.drawImage(art.wash, -width * 0.1, height * 0.72, width * 1.2, height * 0.4);
	let houses = [];
	for (let i = 0, count = 3 + Math.floor(rand() * 4); i < count; i++) {
		houses.push({x: width * (0.12 + rand() * 0.76), y: height * (0.62 + rand() * 0.3), s: height * (0.2 + rand() * 0.12)});
	}
	houses.sort((a, b) => a.y - b.y);
	let style = pick(['round', 'upright']);
	houses.forEach((house, i) => {
		let x = house.x;
		let y = house.y;
		let s = house.s;
		if (i % 2 == 0) foliage(ctx, art, x + s * (rand() < 0.5 ? -1.3 : 1.3), y - s * 1.1, s * 0.9, 0.7, style, 1);
		ctx.globalAlpha = 1;
		ctx.fillStyle = rgba(MIST, 0.95);
		ctx.fillRect(x - s * 0.7, y - s * 0.55, s * 1.4, s * 0.55);
		ctx.strokeStyle = rgba(INK, 0.55);
		ctx.lineWidth = 0.8;
		ctx.strokeRect(x - s * 0.7, y - s * 0.55, s * 1.4, s * 0.55);
		ctx.fillStyle = rgba(INK, 0.78);
		ctx.beginPath();
		ctx.moveTo(x - s * 0.95, y - s * 0.5);
		ctx.quadraticCurveTo(x - s * 0.7, y - s * 0.58, x - s * 0.6, y - s * 0.9);
		ctx.lineTo(x + s * 0.6, y - s * 0.9);
		ctx.quadraticCurveTo(x + s * 0.7, y - s * 0.58, x + s * 0.95, y - s * 0.5);
		ctx.closePath();
		ctx.fill();
		ctx.fillStyle = rgba(INK, 0.6);
		ctx.fillRect(x - s * 0.12, y - s * 0.32, s * 0.24, s * 0.32);
	});
	return canvas;
}
