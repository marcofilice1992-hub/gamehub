class_name Hud
extends Control
## Everything drawn over the hall: the scorecard, the bowler's panel, the swing meter, callouts, banners, coaching, heckles.
## A port of the browser version's draw() and card(). Laid out on a 1920×1080 frame; the window scales it.

var m: Match
var parts: Array = []              # 2D confetti: [pos, vel, life, max, size, colour]
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
		Gx.rrect(self, W / 2 - w / 2, 236, w, 104, 52, Color(0.027, 0.035, 0.05, 0.9 * a), _fade(Tune.PCOL[b.c], a), 3)
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
		Gx.rrect(self, x, y, w, 76, 38, Color(0.027, 0.035, 0.05, 0.92 * a), hc, 3)
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
	if not q.is_empty():
		var a := clampf(minf((q.max - q.t) / 0.12, q.t / 0.35), 0, 1)
		var big: bool = q.text == "Strike" or q.text == "Turkey"
		var size: int = Gx.FS.xl if big else Gx.FS.lg
		var w := Gx.measure(q.text, { "size": size, "weight": 700 }) + 120
		Gx.rrect(self, W / 2 - w / 2, 250, w, 150 if big else 110, 28, Color(0.027, 0.035, 0.05, 0.82 * a), _fade(Tune.PCOL[q.c], a), 3)
		Gx.text(self, q.text, W / 2, 358 if big else 326, { "size": size, "weight": 700, "color": _fade(Tune.PCOL[q.c], a), "align": "center" })
		if q.sub != "": Gx.text(self, q.sub, W / 2, 444 if big else 404, { "size": Gx.FS.sm, "weight": 500, "align": "center", "alpha": a })
		if m.read_text != "" and st == "show":
			var rw := Gx.measure(m.read_text, { "size": Gx.FS.sm }) + 64
			Gx.rrect(self, W / 2 - rw / 2, 476, rw, 56, 28, Color(0.027, 0.035, 0.05, 0.85 * a), _fade(Gx.LINE2, a))
			Gx.text(self, m.read_text, W / 2, 513, { "size": Gx.FS.sm, "align": "center", "alpha": a })
	if st == "over" or st == "done":
		var w := m.won
		Gx.panel(self, W / 2 - 380, 430, 760, 150)
		Gx.text(self, "A draw" if w < 0 else Tune.NAMES[m.P[w].c] + " wins", W / 2, 530, { "size": Gx.FS.xl, "weight": 700, "align": "center", "color": Tune.TEXT if w < 0 else Tune.PCOL[m.P[w].c] })

func _fade(c: Color, a: float) -> Color:
	return Color(c.r, c.g, c.b, c.a * a)

## Both scorecards, the lead, and what the trailing player needs.
func card() -> void:
	var x := 60.0
	var y := 22.0
	var rh := 72.0
	var nw := 190.0
	var fw := 128.0
	var tw := 1800 - nw - fw * 9 - 180
	var P := m.P
	var done := m.state == "over" or m.state == "done"
	Gx.panel(self, x, y, 1800, rh * 2 + 12)
	for c in 2:
		var p: Dictionary = P[m.by(c)]
		var fr := Score.frames(p.rolls)
		var ry := y + 6 + c * rh
		var on: bool = p == m.cur and not done
		var col: Color = Tune.PCOL[c]
		if on: Gx.rrect(self, x + 6, ry + 2, 1788, rh - 4, 10, Gx.PSOFT[c])
		Gx.marker(self, c, x + 34, ry + rh / 2, 11)
		Gx.text(self, Tune.NAMES[c], x + 58, ry + rh / 2 + 9, { "size": Gx.FS.sm, "weight": 700, "color": Tune.TEXT if on else Tune.MUTED })
		var fx := x + nw
		for f in 10:
			var q: Dictionary = fr[f]
			var w := 180.0 if f == 9 else fw
			var live: bool = on and not m.turn.is_empty() and not m.turn.ro and m.turn.f == f
			Gx.rrect(self, fx + 3, ry + 5, w - 6, rh - 10, 8, Color(1, 1, 1, 0.07) if live else null, col if live else Gx.LINE2, 3.0 if live else 2.0)
			Gx.text(self, "  ".join(Score.marks(q, f)), fx + w - 16, ry + 31, { "size": Gx.FS.xs, "weight": 500, "mono": true, "align": "right" })
			var bs: Array = q.balls
			if q.total >= 0: Gx.text(self, str(q.total), fx + 16, ry + 60, { "size": Gx.FS.xs, "weight": 700, "mono": true })
			elif q.done or (f == 9 and bs.size() and (bs[0] == 10 or bs[0] + (bs[1] if bs.size() > 1 else 0) == 10)): Gx.text(self, "bonus", fx + 16, ry + 60, { "size": Gx.FS.xs, "color": Tune.FAINT })
			fx += w
		Gx.text(self, str(Score.shown(p.rolls)), x + 1800 - tw + 96, ry + rh / 2 + 13, { "size": Gx.FS.md, "weight": 700, "mono": true, "align": "right", "color": col if on else Tune.TEXT })
		Gx.text(self, "max %d" % Score.final_score(Score.fill(p.rolls, true)), x + 1800 - 22, ry + rh / 2 + 9, { "size": Gx.FS.xs, "mono": true, "align": "right", "color": Tune.FAINT })
	# the line under the card
	var a: Dictionary = P[m.by(0)]
	var b: Dictionary = P[m.by(1)]
	var sa := Score.shown(a.rolls)
	var sb := Score.shown(b.rolls)
	var msg := ""
	if not m.ro.is_empty():
		var r: Array = m.ro.back()
		msg = "Roll-off %d of 3: Blue %s, Amber %s" % [m.ro.size(), "to bowl" if r[a.n] == null else str(r[a.n]), "to bowl" if r[b.n] == null else str(r[b.n])]
	else:
		var lead: Dictionary = P[m.order[0]]
		var chase: Dictionary = P[m.order[1]]
		if Score.frames(lead.rolls)[9].done and not Score.frames(chase.rolls)[9].done:
			var need := Score.final_score(lead.rolls) + 1 - Score.final_score(Score.fill(chase.rolls, false))
			var can := Score.final_score(Score.fill(chase.rolls, true)) > Score.final_score(lead.rolls)
			if need <= 0: msg = Tune.NAMES[chase.c] + " is in front"
			elif can: msg = "%s needs %d more to win" % [Tune.NAMES[chase.c], need]
			else: msg = "%s cannot catch %s" % [Tune.NAMES[chase.c], Tune.NAMES[lead.c]]
		else: msg = "Level" if sa == sb else "%s leads by %d" % [Tune.NAMES[0 if sa > sb else 1], absi(sa - sb)]
	var mw := Gx.measure(msg, { "size": Gx.FS.xs, "weight": 500 }) + 56
	Gx.rrect(self, W / 2 - mw / 2, y + rh * 2 + 22, mw, 44, 22, Color(0.027, 0.035, 0.05, 0.86), Gx.LINE2)
	Gx.text(self, msg, W / 2, y + rh * 2 + 52, { "size": Gx.FS.xs, "weight": 500, "align": "center" })
