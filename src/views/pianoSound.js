// Plays the piano through the Web Audio API.
//
// An <audio> element per key takes a quarter of a second to start the first time it plays,
// and in a fast run the elements queue up behind one another, so the last note of a
// glissando sounds late. Decoded buffers start within a few milliseconds, any number can
// ring at once, and their fades work everywhere, including iOS, where an element's volume
// cannot be changed.
//
// Decoded audio is large, so only every third key is loaded; the keys in between play the
// nearest sample a semitone up or down. The middle of the keyboard loads first, and until a
// key's own sample arrives it borrows the closest one that has.

// seconds a released note takes to fade away, and a restruck one to make way
const RELEASE = 0.5;
const RESTRIKE = 0.03;
// samples are cut where they fall silent, and to this length at most
const MAX_SECONDS = 8;
// past this many ringing notes, the oldest are let go
const MAX_VOICES = 48;
// a borrowed sample shifted further than this sounds wrong, so the note stays silent instead
const MAX_SHIFT = 6;

export default class PianoSound {
	constructor() {
		let Context = window.AudioContext || window.webkitAudioContext;
		this.ctx = Context ? new Context() : null;
		this.buffers = {};
		this.voices = {};
		this.ringing = [];
		this.samples = [];
		for (let key = 2; key <= 86; key += 3) {
			this.samples.push(key);
		}
		this.samples.push(88);
		if (!this.ctx) return;
		// on iOS, Web Audio is silenced by the ring/silent switch unless the page asks to be a player
		if (navigator.audioSession) {
			navigator.audioSession.type = 'playback';
		}
		this.master = this.ctx.createGain();
		this.master.connect(this.ctx.destination);
		this.load();
	}

	// the middle of the keyboard first, where most playing happens, a few files at a time
	load() {
		let queue = this.samples.slice().sort((a, b) => Math.abs(a - 40) - Math.abs(b - 40));
		let next = () => {
			let key = queue.shift();
			if (key == null) return;
			fetch('mp3/' + key + '.mp3')
				.then((res) => res.arrayBuffer())
				.then((data) => new Promise((resolve, reject) => this.ctx.decodeAudioData(data, resolve, reject)))
				.then((buffer) => {
					this.buffers[key] = this.trim(buffer);
				})
				.catch(() => {})
				.then(next);
		};
		for (let i = 0; i < 4; i++) {
			next();
		}
	}

	// cuts the long silent tail (and anything past MAX_SECONDS) and fades the cut end out
	trim(buffer) {
		let rate = buffer.sampleRate;
		let first = buffer.getChannelData(0);
		let peak = 0;
		for (let i = 0; i < first.length; i++) {
			peak = Math.max(peak, Math.abs(first[i]));
		}
		let end = first.length - 1;
		while (end > 0 && Math.abs(first[end]) < peak * 0.004) {
			end--;
		}
		let length = Math.max(1, Math.min(buffer.length, end + Math.round(rate * 0.1), Math.round(rate * MAX_SECONDS)));
		let fade = Math.min(length, Math.round(rate * 0.3));
		let out = this.ctx.createBuffer(buffer.numberOfChannels, length, rate);
		for (let c = 0; c < buffer.numberOfChannels; c++) {
			let target = out.getChannelData(c);
			target.set(buffer.getChannelData(c).subarray(0, length));
			for (let i = 0; i < fade; i++) {
				target[length - 1 - i] *= i / fade;
			}
		}
		return out;
	}

	// browsers only let sound start once the visitor has interacted with the page
	unlock() {
		if (this.ctx && this.ctx.state != 'running') {
			this.ctx.resume().catch(() => {});
		}
	}

	// key is 1..88
	play(key) {
		if (!this.ctx) return;
		this.unlock();
		let sample = this.nearest(key);
		if (sample == null) return;
		this.stop(key, RESTRIKE);
		let source = this.ctx.createBufferSource();
		source.buffer = this.buffers[sample];
		source.playbackRate.value = Math.pow(2, (key - sample) / 12);
		let gain = this.ctx.createGain();
		source.connect(gain);
		gain.connect(this.master);
		let voice = {key, source, gain, fading: false};
		source.onended = () => {
			gain.disconnect();
			if (this.voices[key] == voice) delete this.voices[key];
			let index = this.ringing.indexOf(voice);
			if (index >= 0) this.ringing.splice(index, 1);
		};
		source.start(this.ctx.currentTime);
		this.voices[key] = voice;
		this.ringing.push(voice);
		while (this.ringing.length > MAX_VOICES) {
			this.fade(this.ringing.shift(), RESTRIKE);
		}
	}

	release(key) {
		this.stop(key, RELEASE);
	}

	stop(key, seconds) {
		let voice = this.voices[key];
		if (!voice) return;
		delete this.voices[key];
		this.fade(voice, seconds);
	}

	fade(voice, seconds) {
		if (voice.fading) return;
		voice.fading = true;
		let now = this.ctx.currentTime;
		let level = voice.gain.gain;
		level.cancelScheduledValues(now);
		level.setValueAtTime(level.value, now);
		level.linearRampToValueAtTime(0, now + seconds);
		try {
			voice.source.stop(now + seconds + 0.02);
		} catch (e) {
			// already stopped
		}
	}

	// the closest sample that has arrived
	nearest(key) {
		let best = null;
		this.samples.forEach((sample) => {
			if (this.buffers[sample] && (best == null || Math.abs(sample - key) < Math.abs(best - key))) {
				best = sample;
			}
		});
		return best != null && Math.abs(best - key) <= MAX_SHIFT ? best : null;
	}
}
