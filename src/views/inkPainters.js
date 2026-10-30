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
			at: main + side * (0.12 + rand() * 0.22),
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
	let heightAt = (u) => {
		let h = 0;
		peaks.forEach((p) => {
			h = Math.max(h, p.h * profile(Math.abs(u - p.at) / (u < p.at ? p.left : p.right)));
		});
		h += detail(u) * (0.06 + wild * 0.14) * (0.3 + h);
		return clamp(h, 0, 1) * smoothstep(0, 0.06, u) * smoothstep(0, 0.06, 1 - u);
	};
	let ridgeAt = (x) => height * (1 - 0.95 * heightAt(x / width));
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
		body.addColorStop(0, rgba(SNOW, 0.95));
		body.addColorStop(0.5, rgba(SNOW, 0.55));
		body.addColorStop(1, rgba(SNOW, 0));
		ctx.fillStyle = body;
		ctx.fill(outline);
		ctx.strokeStyle = rgba(tone, 1);
		ctx.lineWidth = 1.5;
		ctx.globalAlpha = 0.25;
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
			let s = 14 + rand() * 18;
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
			let s = height * (0.15 + rand() * 0.25);
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
	for (let i = 0; i < 90; i++) {
		let u = rand();
		let top = height * (0.22 + billow(u * 8) * 0.35);
		let y = top + rand() * height * 0.4;
		let s = height * (0.3 + rand() * 0.5);
		ctx.globalAlpha = 0.18 + rand() * 0.3;
		ctx.drawImage(puff, u * width - s, y - s * 0.4, s * 2, s * 0.8);
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
