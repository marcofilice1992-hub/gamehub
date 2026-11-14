class_name Hud
extends Control
## Everything drawn over the hall: the scorecard, the bowler's panel, the swing meter, callouts, banners, coaching, heckles.
## A port of the browser version's draw() and card(). Laid out on a 1920×1080 frame; the window scales it.

var m: Match
var parts: Array = []
var hall: Hall
var perf := false                 # F3: frame rate, frame time, tier and draw calls
var _f3 := false              # 2D confetti: [pos, vel, life, max, size, colour]
var _vig: TextureRect

const W := 1920.0
const H := 1080.0

func _ready() -> void:
	set_anchors_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	# the vignette that frames the hall
	var g := Gradient.new()
	g.set_color(0, Color(0, 0, 0, 0)); g.set_color(1, Color(0, 0, 0, 0.55))
	g.set_offset(0, 0.33)
	var tex := GradientTexture2D.new()
	tex.gradient = g
	tex.fill = GradientTexture2D.FILL_RADIAL
	tex.fill_from = Vector2(0.5, 0.55)
	tex.fill_to = Vector2(0.5, 0.55 + 0.98)
	tex.width = 256; tex.height = 144
	_vig = TextureRect.new()
	_vig.texture = tex
	_vig.stretch_mode = TextureRect.STRETCH_SCALE
	_vig.set_anchors_preset(Control.PRESET_FULL_RECT)
	_vig.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_vig.show_behind_parent = true
	add_child(_vig)

func attach(match_node: Match) -> void:
	m = match_node
	m.fx.connect(_on_fx)

func _on_fx(kind: String, c: int) -> void:
	var red := Store.reduced()
	if kind == "strike":
		burst(Vector2(W / 2, 330), 20 if red else 90, Tune.PCOL[c], 240, 900, 1.1, 9)
		burst(Vector2(W / 2, 330), 40, Tune.TEXT, 200, 700, 0.9, 6)
	elif kind == "spare":
		burst(Vector2(W / 2, 330), 40, Tune.PCOL[c], 200, 600, 0.8, 7)

func burst(at: Vector2, count: int, col: Color, lo: float, hi: float, life: float, size: float) -> void:
	for i in count:
		var a := randf() * TAU
		var sp := randf_range(lo, hi)
		parts.append([at, Vector2(cos(a), sin(a)) * sp, life * randf_range(0.6, 1.0), life, size * randf_range(0.6, 1.2), col])
	if parts.size() > 300: parts = parts.slice(parts.size() - 300)

func _process(dt: float) -> void:
	var f3 := Input.is_physical_key_pressed(KEY_F3)
	if f3 and not _f3: perf = not perf
	_f3 = f3
	for p in parts:
		p[1] *= pow(0.12, dt)
		p[1].y += 900 * dt
		p[0] += p[1] * dt
		p[2] -= dt
	parts = parts.filter(func(p): return p[2] > 0)
	queue_redraw()

func _draw() -> void:
	if m == null or m.P.is_empty(): return
	for p in parts:
		var c: Color = p[5]
		c.a = clampf(p[2] / p[3] * 1.5, 0, 1)
		draw_rect(Rect2(p[0] - Vector2(p[4], p[4]) / 2, Vector2(p[4], p[4])), c)
	card()
	if perf: _perf()
	var p: Dictionary = m.cur
	var s = p.seat
	var col: Color = Tune.PCOL[p.c]
	var st := m.state
	var key: bool = s.keyboard
	var ty: String = s.type
	if st == "intro":
		var sv := Store.data
		Gx.panel(self, W / 2 - 430, 420, 860, 260)
		Gx.text(self, "Tenpin Grudge", W / 2, 500, { "size": Gx.FS.lg, "weight": 700, "align": "center" })
		Gx.marker(self, p.c, W / 2 - 150, 556, 12)
		Gx.text(self, Tune.NAMES[p.c] + " bowls first", W / 2 - 124, 566, { "size": Gx.FS.sm, "color": col, "weight": 700 })
		Gx.text(self, "%s oil tonight: %s" % [m.oil.name, m.oil.note], W / 2, 612, { "size": Gx.FS.xs, "align": "center" })
		Gx.text(self, "Matches so far: Blue %d, Amber %d, drawn %d" % [int(sv.wins[0]), int(sv.wins[1]), int(sv.draws)], W / 2, 648, { "size": Gx.FS.xs, "color": Tune.MUTED, "align": "center" })
	if st == "stance" or st == "swing":
		var x := 60.0
		var y := H - 214
		var cm := int(round(absf(m.x0) * 100))
		var tag := " · roll-off" if m.turn.ro else " · frame %d · ball %d" % [m.turn.f + 1, m.turn.b + 1]
		tag += " · swinging" if st == "swing" else (" · ready" if m.armed else "")
		Gx.panel(self, x, y, 700, 186)
		Gx.marker(self, p.c, x + 36, y + 42, 11)
		Gx.eyebrow(self, Tune.NAMES[p.c] + tag, x + 60, y + 50, { "color": col })
		Gx.text(self, ("Standing %d cm %s" % [cm, "left" if m.x0 < 0 else "right"]) if cm else "Standing in the centre", x + 30, y + 94, { "size": Gx.FS.xs, "weight": 500 })
		var aim_s := ("Aiming %.1f° %s" % [absf(m.aim) / 10.0, "left" if m.aim < 0 else "right"]) if absf(m.aim) >= 0.5 else "Aiming straight"
		Gx.text(self, aim_s + " · Hook: " + Tune.HOOK_NAMES[p.hook].to_lower(), x + 30, y + 128, { "size": Gx.FS.xs, "weight": 500 })
		var bl: Dictionary = Tune.BALLS[p.ball]
		Gx.text(self, "%s ball, %s kg · %s oil" % [bl.name, str(bl.kg), m.oil.name], x + 30, y + 162, { "size": Gx.FS.xs, "weight": 500, "color": col })
		var spots := Tune.spots()
		for i in 10:                                         # the pins still standing
			var on := m.lane.up.has(i)
			var q: Vector2 = spots[i]
			Gx.circle(self, x + 610 + q.x / Tune.SP * 28, y + 132 - (q.y - Tune.HEAD) / Tune.ROW * 26, 10, Color("#F4F2EC") if on else null, null if on else Gx.LINE2, 2)
		var hx := W - 60 - 660
		Gx.panel(self, hx, y, 660, 186)
		var rows: Array
		if st == "swing": rows = [[["a" if key else "aim", "Let go to bowl" if key else "Push forward to bowl, straight"]], [["b", "Cancel the swing"]]]
		else: rows = [[["move", "Step sideways"], ["a" if key else "aim", "Hold to swing" if key else "Pull back to swing"]], [["lb", "Aim left"], ["rb", "Aim right"]], [["lt", "Hook left"], ["rt", "Hook right"], ["y", "Ball"]]]
		for i in rows.size(): Gx.hints(self, hx + 30, y + 44 + i * 50, rows[i], ty)
	if st == "swing":                                        # swing height, with the floor and the top marked, and the drift needle
		var floor_pw := 0.7 if m.assist(p) == 2 else 0.55
		var pw := m.swing_power()
		var x := W - 230
		var y := 380.0
		var h := 330.0
		Gx.panel(self, x - 34, y - 62, 196, h + 150)
		Gx.eyebrow(self, "Power", x - 10, y - 26)
		Gx.rrect(self, x, y, 34, h, 8, Gx.S3)
		var fh := h * (pw - 0.5) / 0.5
		Gx.rrect(self, x, y + h - fh, 34, fh, 8, Tune.BAD if m.sw.t > Tune.TIRE_AFTER else col)
		Gx.line(self, x - 8, y + h - h * (floor_pw - 0.5) / 0.5, x + 42, y + h - h * (floor_pw - 0.5) / 0.5, Tune.MUTED, 2)
		Gx.line(self, x - 8, y, x + 42, y, Tune.TEXT, 3)
		Gx.text(self, "%d%%" % int(round(pw * 100)), x + 56, y + h - fh + 8, { "size": Gx.FS.sm, "weight": 700, "mono": true })
		var dr: float = sin(m.sw.t * 3.1) * 0.4 if key else s.aim.x
		Gx.eyebrow(self, "Drift", x - 10, y + h + 40)
		Gx.rrect(self, x - 10, y + h + 54, 150, 10, 5, Gx.S3)
		Gx.line(self, x + 65, y + h + 48, x + 65, y + h + 70, Tune.MUTED, 2)
		Gx.circle(self, x + 65 + clampf(dr, -1, 1) * 70, y + h + 59, 9, Tune.GOOD if absf(dr) < 0.12 else Tune.BAD)
	if st == "roll":
		var x := 60.0
		var y := H - 132
		var ln := m.lane
		var what := "In the gutter" if ln.gutter else "Counting pins" if ln.hit else "Rolling straight" if m.spin == 0.0 \
			else ("Hooking " + ("left" if m.spin < 0 else "right")) if ln.ball and Tune.grip(-ln.ball.position.z, m.oil.len) > 0.5 else "Skidding on the oil"
		Gx.panel(self, x, y, 640, 100)
		Gx.marker(self, p.c, x + 36, y + 50, 11)
		Gx.eyebrow(self, Tune.NAMES[p.c] + " · " + what, x + 60, y + 58, { "color": col })
		Gx.text(self, "%d km/h" % int(round(m.kmh)), x + 612, y + 62, { "size": Gx.FS.sm, "weight": 700, "mono": true, "align": "right" })
	var b := m.banner
	if not b.is_empty() and st != "intro":
		var a := clampf(minf(b.t / 0.3, (1.6 - b.t) / 0.2), 0, 1)
		var w := 560.0
		Gx.screen(self, W / 2 - w / 2, 236, w, 104, 52, Tune.PCOL[b.c], a)
		Gx.marker(self, b.c, W / 2 - w / 2 + 56, 288, 15, { "color": _fade(Tune.PCOL[b.c], a) })
		Gx.text(self, b.text, W / 2 - w / 2 + 92, 284, { "size": Gx.FS.md, "weight": 700, "alpha": a })
		Gx.text(self, b.sub, W / 2 - w / 2 + 92, 320, { "size": Gx.FS.xs, "color": Tune.MUTED, "alpha": a })
	if m.coach and not s.bot and (st == "stance" or st == "swing") and p.balls < 2:
		var tip: Array
		if st == "swing": tip = [["a" if key else "aim", "Let go to bowl. The longer you held, the harder it goes." if key else "Push the stick up to bowl. Straight up keeps it on your line."]]
		elif not m.armed: tip = [["a" if key else "aim", "Let go of " + ("the key" if key else "the right stick") + " to get ready"]]
		elif m.t < 4: tip = [["move", "Step to a spot"], ["lb", ""], ["rb", "Aim at an arrow on the lane"]]
		elif m.t < 8: tip = [["lt", ""], ["rt", "Add hook if you like: it curves on the dry boards near the pins"]]
		else: tip = [["a" if key else "aim", "Hold to swing back" if key else "Pull the right stick down to swing back"]]
		var w := 1180.0
		var x := (W - w) / 2
		var y := 520.0
		Gx.panel(self, x, y, w, 84)
		Gx.eyebrow(self, "First game", x + 28, y + 48, { "color": col })
		Gx.hints(self, x + 200, y + 42, tip, ty)
	var hk := m.heckle
	if not hk.is_empty():                                    # the heckle, from the waiting player's side of the screen
		var a := clampf(minf(hk.t / 0.25, (1.8 - hk.t) / 0.12), 0, 1)
		var w := Gx.measure(hk.text, { "size": Gx.FS.md, "weight": 700 }) + 110
		var x: float = W - 80 - w if hk.c else 80.0
		var y := 300.0
		var hc := _fade(Tune.PCOL[hk.c], a)
		Gx.screen(self, x, y, w, 76, 38, Tune.PCOL[hk.c], a)
		var tx: float = x + (w - 70 if hk.c else 70.0)
		draw_colored_polygon(PackedVector2Array([Vector2(tx, y + 74), Vector2(x + (w - 40 if hk.c else 40.0), y + 104), Vector2(x + (w - 100 if hk.c else 100.0), y + 74)]), hc)
		Gx.marker(self, hk.c, x + 40, y + 38, 12, { "color": hc })
		Gx.text(self, hk.text, x + 68, y + 50, { "size": Gx.FS.md, "weight": 700, "color": hc })
	if st == "replay":
		var w := 520.0
		var x := (W - w) / 2
		var y := H - 132
		Gx.panel(self, x, y, w, 96)
		Gx.circle(self, x + 40, y + 48, 9, Tune.BAD if int(m.t * 2) % 2 else Color(0.94, 0.38, 0.43, 0.4))
		Gx.text(self, "Strike replay", x + 64, y + 58, { "size": Gx.FS.sm, "weight": 700 })
		Gx.hints(self, x + w - 150, y + 48, [["a", "Skip"]], Pads.last_type)
	var q := m.call
	if not q.is_empty() and st == "show":                  # the lane screen in the hall carries the word; the read sits below the pins
		var a2 := clampf(minf((q.max - q.t) / 0.12, q.t / 0.35), 0, 1)
		if m.read_text != "":
			var rw2 := Gx.measure(m.read_text, { "size": Gx.FS.sm }) + 64
			Gx.screen(self, W / 2 - rw2 / 2, H - 150, rw2, 60, 30, Color(Tune.PCOL[q.c], 0.6), a2, 2.0)
			Gx.text(self, m.read_text, W / 2, H - 110, { "size": Gx.FS.sm, "align": "center", "alpha": a2 })
	elif not q.is_empty():
		var a := clampf(minf((q.max - q.t) / 0.12, q.t / 0.35), 0, 1)
		var big: bool = q.text == "Strike" or q.text == "Turkey"
		var size: int = Gx.FS.xl if big else Gx.FS.lg
		var w := Gx.measure(q.text, { "size": size, "weight": 700 }) + 120
		Gx.screen(self, W / 2 - w / 2, 250, w, 150 if big else 110, 28, Tune.PCOL[q.c], a)
		Gx.text(self, q.text, W / 2, 358 if big else 326, { "size": size, "weight": 700, "color": _fade(Tune.PCOL[q.c], a), "align": "center" })
		if q.sub != "": Gx.text(self, q.sub, W / 2, 444 if big else 404, { "size": Gx.FS.sm, "weight": 500, "align": "center", "alpha": a })
		if m.read_text != "" and st == "show":
			var rw := Gx.measure(m.read_text, { "size": Gx.FS.sm }) + 64
			Gx.screen(self, W / 2 - rw / 2, 476, rw, 56, 28, Gx.LINE2, a, 2.0)
			Gx.text(self, m.read_text, W / 2, 513, { "size": Gx.FS.sm, "align": "center", "alpha": a })
	if st == "over" or st == "done":
		var w := m.won
		Gx.panel(self, W / 2 - 380, 430, 760, 150)
		Gx.text(self, "A draw" if w < 0 else Tune.NAMES[m.P[w].c] + " wins", W / 2, 530, { "size": Gx.FS.xl, "weight": 700, "align": "center", "color": Tune.TEXT if w < 0 else Tune.PCOL[m.P[w].c] })

func _perf() -> void:
	var x := W - 420.0
	var y := 200.0
	Gx.panel(self, x, y, 360, 150)
	var fps := Engine.get_frames_per_second()
	Gx.text(self, "%d fps · %.1f ms" % [fps, 1000.0 / maxf(1.0, fps)], x + 20, y + 40, { "size": Gx.FS.sm, "weight": 700, "mono": true })
	Gx.text(self, "Graphics: " + (hall.tier_label() if hall else "?"), x + 20, y + 80, { "size": Gx.FS.xs, "color": Tune.MUTED })
	Gx.text(self, "%d draw calls · %.1fM triangles" % [Performance.get_monitor(Performance.RENDER_TOTAL_DRAW_CALLS_IN_FRAME),
		Performance.get_monitor(Performance.RENDER_TOTAL_PRIMITIVES_IN_FRAME) / 1e6], x + 20, y + 116, { "size": Gx.FS.xs, "color": Tune.MUTED })

func _fade(c: Color, a: float) -> Color:
	return Color(c.r, c.g, c.b, c.a * a)

## Which frame a player's latest ball went into.
static func last_frame(rolls: Array) -> int:
	if rolls.is_empty(): return -1
	var fr := Score.frames(rolls)
	var n := 0
	for f in 10:
		n += fr[f].balls.size()
		if n >= rolls.size(): return f
	return 9

var _seen := [0, 0]
var _card_y := 0.0                 # the scorecard slides away while the lane screen in the hall shows the result
var _pop := [0.0, 0.0]
var _pop_f := [-1, -1]

## The scorecard, drawn as a close-up of the screen over lane 14: the same indigo glass, neon frame in the bowler's
## colour, lane badge and frame boxes. A new mark lights its box for a moment, as it lands on the screen in the hall.
func card() -> void:
	var want := -230.0 if m.state == "show" else 0.0
	_card_y += (want - _card_y) * (1.0 - exp(-10.0 * get_process_delta_time()))
	if _card_y < -225: return
	var x := 60.0
	var y := 14.0 + _card_y
	var w := 1800.0
	var rh := 60.0
	var h := 12 + rh * 2 + 6 + 12
	var P := m.P
	var done := m.state == "over" or m.state == "done"
	var acc: Color = Tune.TEXT if done and m.won < 0 else Tune.PCOL[m.cur.c]
	var dt := get_process_delta_time()
	Gx.grad_rrect(self, x, y, w, h, 18, Gx.SCREEN_TOP, Gx.SCREEN_BOT)
	Gx.glow_rrect(self, x, y, w, h, 18, acc, 3.0, 0.8 + 1.2 * m.flash)
	# lane badge, as on the screens over the lanes
	Gx.rrect(self, x + 16, y + 16, 92, h - 32, 12, acc)
	Gx.text(self, "LANE", x + 62, y + 50, { "size": 17, "weight": 800, "color": Color("#0B0A14"), "align": "center", "track": 2.0 })
	Gx.text(self, "14", x + 62, y + 104, { "size": 50, "weight": 800, "color": Color("#0B0A14"), "align": "center" })
	var fx0 := x + 330.0
	var fw := 118.0
	for c in 2:
		var p: Dictionary = P[m.by(c)]
		var fr := Score.frames(p.rolls)
		var ry := y + 12 + c * (rh + 6)
		var on: bool = p == m.cur and not done
		var col: Color = Tune.PCOL[c]
		if p.rolls.size() > _seen[c]:
			_pop[c] = 1.0
			_pop_f[c] = last_frame(p.rolls)
		_seen[c] = p.rolls.size()
		_pop[c] = maxf(0.0, _pop[c] - dt * 1.4)
		if on: Gx.rrect(self, x + 124, ry, w - 140, rh, 12, Color(col.r, col.g, col.b, 0.13))
		Gx.marker(self, c, x + 152, ry + rh / 2, 11)
		Gx.text(self, Tune.NAMES[c].to_upper(), x + 176, ry + rh / 2 + 11, { "size": 30, "weight": 800, "color": col if on else Color(0.93, 0.92, 0.97, 0.75), "glow": col if on else Color(0, 0, 0, 0) })
		var fx := fx0
		for f in 10:
			var q: Dictionary = fr[f]
			var fwid := 168.0 if f == 9 else fw
			var live: bool = on and not m.turn.is_empty() and not m.turn.ro and m.turn.f == f
			var pop: float = _pop[c] if _pop_f[c] == f else 0.0
			var fill := Color(1, 1, 1, 0.04).lerp(Color(col.r, col.g, col.b, 0.55), pop)
			if live: fill = Color(1, 1, 1, 0.09)
			Gx.rrect(self, fx + 3, ry + 4, fwid - 6, rh - 8, 8, fill, null)
			if live: Gx.glow_rrect(self, fx + 3, ry + 4, fwid - 6, rh - 8, 8, col, 2.5, 0.8)
			else: Gx.rrect(self, fx + 3, ry + 4, fwid - 6, rh - 8, 8, null, Color(1, 1, 1, 0.16), 1.5)
			Gx.text(self, "  ".join(Score.marks(q, f)), fx + fwid - 14, ry + 27, { "size": 21, "weight": 700, "mono": true, "align": "right", "color": Color("#F4F6FA") })
			var bs: Array = q.balls
			if q.total >= 0: Gx.text(self, str(q.total), fx + 14, ry + 50, { "size": 19, "weight": 700, "mono": true, "color": Color(0.93, 0.92, 0.97, 0.8) })
			elif q.done or (f == 9 and bs.size() and (bs[0] == 10 or bs[0] + (bs[1] if bs.size() > 1 else 0) == 10)): Gx.text(self, "bonus", fx + 14, ry + 50, { "size": 17, "color": Tune.FAINT })
			fx += fwid
		Gx.text(self, str(Score.shown(p.rolls)), x + w - 120, ry + rh / 2 + 15, { "size": 42, "weight": 700, "mono": true, "align": "right", "color": col if on else Color("#F4F6FA") })
		Gx.text(self, "MAX", x + w - 22, ry + rh / 2 - 4, { "size": 13, "weight": 700, "align": "right", "color": Tune.FAINT, "track": 1.5 })
		Gx.text(self, str(Score.final_score(Score.fill(p.rolls, true))), x + w - 22, ry + rh / 2 + 16, { "size": 17, "mono": true, "align": "right", "color": Tune.FAINT })
	# the line under the card: who leads, or what the trailing player needs
	var msg := m.status_line()
	var mw := Gx.measure(msg, { "size": Gx.FS.xs, "weight": 500 }) + 56
	Gx.grad_rrect(self, W / 2 - mw / 2, y + h + 10, mw, 42, 21, Gx.SCREEN_TOP, Gx.SCREEN_BOT)
	Gx.rrect(self, W / 2 - mw / 2, y + h + 10, mw, 42, 21, null, Color(acc.r, acc.g, acc.b, 0.55), 2.0)
	Gx.text(self, msg, W / 2, y + h + 39, { "size": Gx.FS.xs, "weight": 500, "align": "center" })
