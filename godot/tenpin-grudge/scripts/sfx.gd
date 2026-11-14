extends Node
## Every sound is synthesised at start-up, as in the browser version: no audio files.
## play("tg-pin", vol, pitch, pan): vol 0..1, pitch as a playback rate, pan -1 (left) to 1 (right).

const RATE := 22050
var bank := {}
var players: Array[AudioStreamPlayer] = []
var next := 0
var enabled := true

func _ready() -> void:
	for i in 24:
		var p := AudioStreamPlayer.new()
		p.bus = "Master"
		add_child(p)
		players.append(p)
	_build()

# ---- A tiny synth -----------------------------------------------------------------------------------------
func _buf(sec: float) -> PackedFloat32Array:
	var b := PackedFloat32Array()
	b.resize(int(sec * RATE))
	return b

func _tone(b: PackedFloat32Array, f: float, dur: float, o := {}) -> void:
	var to: float = o.get("to", f)
	var vol: float = o.get("vol", 0.2)
	var start := int(o.get("delay", 0.0) * RATE)
	var n := int(dur * RATE)
	var wave: String = o.get("type", "triangle")
	var ph := 0.0
	for i in n:
		var j := start + i
		if j >= b.size(): break
		var t := float(i) / n
		var fr := f * pow(to / f, t)
		ph += fr / RATE
		var x: float = ph - floor(ph)
		var s := 0.0
		match wave:
			"sine": s = sin(TAU * x)
			"square": s = 1.0 if x < 0.5 else -1.0
			"sawtooth": s = 2.0 * x - 1.0
			_: s = 4.0 * absf(x - 0.5) - 1.0
		var env := minf(1.0, i / (0.008 * RATE)) * pow(1.0 - t, 2.2)
		b[j] += s * vol * env

func _noise(b: PackedFloat32Array, dur: float, o := {}) -> void:
	var freq: float = o.get("freq", 1000.0)
	var q: float = o.get("q", 0.8)
	var vol: float = o.get("vol", 0.25)
	var start := int(o.get("delay", 0.0) * RATE)
	var n := int(dur * RATE)
	# a band-pass biquad over white noise
	var w0 := TAU * freq / RATE
	var alpha := sin(w0) / (2.0 * q)
	var b0 := alpha; var a0 := 1.0 + alpha; var a1 := -2.0 * cos(w0); var a2 := 1.0 - alpha
	var x1 := 0.0; var x2 := 0.0; var y1 := 0.0; var y2 := 0.0
	var rng := RandomNumberGenerator.new()
	rng.seed = int(freq * 7 + dur * 1000)
	for i in n:
		var j := start + i
		if j >= b.size(): break
		var x0 := rng.randf() * 2.0 - 1.0
		var y0 := (b0 * x0 - b0 * x2 - a1 * y1 - a2 * y2) / a0
		x2 = x1; x1 = x0; y2 = y1; y1 = y0
		var t := float(i) / n
		var env := minf(1.0, i / (0.006 * RATE)) * pow(1.0 - t, 2.0)
		b[j] += y0 * vol * env * 2.5

func _store(name: String, b: PackedFloat32Array) -> void:
	var bytes := PackedByteArray()
	bytes.resize(b.size() * 2)
	for i in b.size():
		bytes.encode_s16(i * 2, int(clampf(b[i], -1.0, 1.0) * 32000.0))
	var s := AudioStreamWAV.new()
	s.format = AudioStreamWAV.FORMAT_16_BITS
	s.mix_rate = RATE
	s.stereo = false
	s.data = bytes
	bank[name] = s

func _build() -> void:
	var b: PackedFloat32Array
	b = _buf(0.06); _tone(b, 520, 0.04, { "vol": 0.12 }); _store("move", b)
	b = _buf(0.04); _tone(b, 880, 0.03, { "vol": 0.08 }); _store("tick", b)
	b = _buf(0.18); _tone(b, 660, 0.07); _tone(b, 990, 0.1, { "delay": 0.05 }); _store("select", b)
	b = _buf(0.12); _tone(b, 440, 0.09, { "to": 300, "vol": 0.16 }); _store("back", b)
	b = _buf(0.15); _tone(b, 150, 0.13, { "type": "square", "vol": 0.09 }); _store("deny", b)
	b = _buf(0.24); _tone(b, 523, 0.08); _tone(b, 784, 0.14, { "delay": 0.07 }); _store("join", b)
	b = _buf(0.24); _tone(b, 587, 0.07); _tone(b, 880, 0.16, { "delay": 0.06 }); _store("ready", b)
	b = _buf(0.8)
	for i in 4: _tone(b, [523, 659, 784, 1047][i], 0.22, { "delay": i * 0.11, "vol": 0.22 })
	_store("win", b)
	b = _buf(0.2); _tone(b, 110, 0.16, { "to": 60, "type": "sine", "vol": 0.22 }); _noise(b, 0.1, { "freq": 300, "vol": 0.12 }); _store("tg-release", b)
	b = _buf(0.18); _noise(b, 0.16, { "freq": 170, "q": 1.4, "vol": 0.07 }); _store("tg-roll", b)
	b = _buf(0.08); _noise(b, 0.06, { "freq": 2300, "q": 2.2, "vol": 0.2 }); _tone(b, 900, 0.05, { "to": 520, "type": "square", "vol": 0.05 }); _store("tg-pin", b)
	b = _buf(0.34); _noise(b, 0.3, { "freq": 240, "q": 0.9, "vol": 0.2 }); _tone(b, 160, 0.3, { "to": 80, "type": "sawtooth", "vol": 0.08 }); _store("tg-gutter", b)
	b = _buf(0.5)
	for i in 5: _tone(b, [523, 659, 784, 1047, 1319][i], 0.16, { "delay": i * 0.07, "vol": 0.2 })
	_store("tg-strike", b)
	b = _buf(0.4)
	for i in 3: _tone(b, [523, 784, 1047][i], 0.14, { "delay": i * 0.08, "vol": 0.16 })
	_store("tg-spare", b)
	b = _buf(0.55); _noise(b, 0.5, { "freq": 420, "q": 0.6, "vol": 0.08 }); _store("tg-sweep", b)
	b = _buf(0.36); _tone(b, 240, 0.32, { "type": "sawtooth", "to": 140, "vol": 0.1 }); _tone(b, 250, 0.32, { "type": "square", "to": 145, "vol": 0.05 }); _noise(b, 0.3, { "freq": 600, "q": 3, "vol": 0.06 }); _store("tg-heckle", b)

func play(name: String, vol := 1.0, pitch := 1.0) -> void:
	if not enabled or not bank.has(name): return
	var p := players[next]
	next = (next + 1) % players.size()
	p.stream = bank[name]
	p.pitch_scale = clampf(pitch, 0.25, 4.0)
	p.volume_db = linear_to_db(clampf(vol, 0.001, 2.0))
	p.play()
