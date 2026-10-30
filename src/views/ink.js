// Helpers for painting with ink on rice paper.

export const INK = [26, 24, 21];
// aged rice paper: warm and a little toned, so white mist can glow against it
export const PAPER = [231, 222, 203];
export const MIST = [255, 252, 245];

export function mulberry32(seed) {
	return function() {
		seed = seed + 0x6D2B79F5 | 0;
		let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
		t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
		return ((t ^ t >>> 14) >>> 0) / 4294967296;
	};
}

// smooth 1D noise in [0, 1], repeating every `count` units
export function valueNoise(rand, count) {
	let values = [];
	for (let i = 0; i < count; i++) {
		values.push(rand());
	}
	return (x) => {
		let i = Math.floor(x);
		let t = (1 - Math.cos((x - i) * Math.PI)) / 2;
		let a = ((i % count) + count) % count;
		return values[a] * (1 - t) + values[(a + 1) % count] * t;
	};
}

// alpha is rounded so it never prints as "1e-7" or "NaN", which canvas would reject as a colour
export function rgba(rgb, alpha) {
	let a = alpha > 0 ? Math.min(1, Math.round(alpha * 10000) / 10000) : 0;
	return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${a})`;
}

export function smoothstep(a, b, x) {
	let t = Math.max(0, Math.min(1, (x - a) / (b - a)));
	return t * t * (3 - 2 * t);
}

export function mix(a, b, t) {
	return [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * t));
}

export function makePaper(size) {
	let canvas = document.createElement('canvas');
	canvas.width = canvas.height = size;
	let ctx = canvas.getContext('2d');
	let rand = mulberry32(7);
	ctx.fillStyle = rgba(PAPER, 1);
	ctx.fillRect(0, 0, size, size);
	let img = ctx.getImageData(0, 0, size, size);
	for (let i = 0; i < img.data.length; i += 4) {
		let grain = (rand() - 0.5) * 12;
		img.data[i] += grain;
		img.data[i + 1] += grain;
		img.data[i + 2] += grain * 0.9;
	}
	ctx.putImageData(img, 0, 0);
	ctx.lineWidth = 0.6;
	for (let i = 0; i < 110; i++) {
		let x = rand() * size;
		let y = rand() * size;
		let length = 6 + rand() * 24;
		let angle = rand() * Math.PI * 2;
		ctx.strokeStyle = rand() < 0.5 ? 'rgba(120, 100, 70, 0.08)' : 'rgba(255, 255, 255, 0.4)';
		ctx.beginPath();
		ctx.moveTo(x, y);
		ctx.quadraticCurveTo(
			x + Math.cos(angle + 0.6) * length / 2, y + Math.sin(angle + 0.6) * length / 2,
			x + Math.cos(angle) * length, y + Math.sin(angle) * length);
		ctx.stroke();
	}
	return canvas;
}

// A dab of ink (or of colour, given `rgb`) with a ragged edge and grainy body. With `rim`,
// the ink pools at the edge the way a drop does when it soaks into rice paper.
export function makeInkSprite(size, seed, rim, rgb = INK) {
	let canvas = document.createElement('canvas');
	canvas.width = canvas.height = size;
	let ctx = canvas.getContext('2d');
	let img = ctx.createImageData(size, size);
	let rand = mulberry32(seed);
	let lobes = rim ? 14 : 9;
	let edge = valueNoise(rand, lobes);
	let half = size / 2;
	for (let y = 0; y < size; y++) {
		for (let x = 0; x < size; x++) {
			let dx = (x + 0.5 - half) / half;
			let dy = (y + 0.5 - half) / half;
			let angle = (Math.atan2(dy, dx) / Math.PI + 1) / 2 * lobes;
			let r = Math.sqrt(dx * dx + dy * dy) / (rim ? 0.6 + edge(angle) * 0.4 : 0.78 + edge(angle) * 0.22);
			let alpha = rim ?
				(0.55 + 0.3 * smoothstep(0.55, 0.92, r)) * (1 - smoothstep(0.86, 1, r)) :
				1 - smoothstep(0.3, 1, r);
			let i = (y * size + x) * 4;
			img.data[i] = rgb[0];
			img.data[i + 1] = rgb[1];
			img.data[i + 2] = rgb[2];
			img.data[i + 3] = alpha * (0.78 + rand() * 0.22) * 255;
		}
	}
	ctx.putImageData(img, 0, 0);
	return canvas;
}

// a soft round wash, for mist (in paper colour) or storm clouds (in ink)
export function makeSoftSprite(size, rgb) {
	let canvas = document.createElement('canvas');
	canvas.width = canvas.height = size;
	let ctx = canvas.getContext('2d');
	let gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
	gradient.addColorStop(0, rgba(rgb, 0.9));
	gradient.addColorStop(0.5, rgba(rgb, 0.45));
	gradient.addColorStop(1, rgba(rgb, 0));
	ctx.fillStyle = gradient;
	ctx.fillRect(0, 0, size, size);
	return canvas;
}
