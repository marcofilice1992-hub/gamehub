class_name Match
extends Node3D
## One match of Tenpin Grudge: whose ball it is, the stance and swing, the roll, the count, the card, roll-offs and the result.
## A straight port of the browser version's Grudge class. The hall (visuals) and HUD read this node; neither changes it.

signal finished(result: Dictionary)
signal fx(kind: String, c: int)              # "strike", "spare", "flash": the HUD and hall play their parts

var sim := false                             # headless bot matches: no recording, no replays, no coaching
var quick := false                           # bots skip their pause before bowling (screenshot runs)
var rng := RandomNumberGenerator.new()
var lane: Lane
var P: Array = []                            # two players: { n, seat, c, rolls, x0, aim, streak, splits, fast, bot_n, ball, hook, balls, split, plan }
var order := [0, 1]
var ro: Array = []                           # roll-offs: [[a, b]], null until bowled
var oil: Dictionary
var state := "intro"
var t := 0.0
var n := 0
var cur: Dictionary
var turn := {}
var fresh := true
var x0 := 0.0
var aim := 0.0                               # tenths of a degree, -40..40
var spin := 0.0
var sw := { "t": 0.0, "idle": 0.0, "rum": 0.0 }
var armed := false
var read_text := ""
var call := {}                               # the big result callout: { t, max, text, sub, c }
var banner := {}                             # whose turn: { t, c, text, sub }
var heckle := {}
var heckle_t := 0.0
var heckles := 0
var hold := 0.0
var replay_next := false
var rp0 := 0
var rp_end := 0.0
var rp_frame = null
var flash := 0.0
var shake := 0.0
var coach := false
var power := 0.0
var kmh := 0.0
var won := -1
var _roll_t := 0.0
var _rum_t := 0.0
var _slow_t := 0.0
var _hitstop := 0.0
var _after: Array = []                       # [time, callable]

const AIM := 40                              # Tune.AIM_MAX / Tune.AIM_TAP

func setup(seats: Array, seed_value: int, is_sim := false) -> void:
	sim = is_sim
	rng.seed = seed_value
	lane = Lane.new()
	lane.rng.seed = seed_value * 31 + 7
	lane.record = not sim
	add_child(lane)
	var two := seats.size() > 1
	var sv: Dictionary = Store.data
	P = []
	for i in 2:
		var seat = seats[i if two else 0]
		var c: int = seat.index if two else i
		P.append({ "n": i, "seat": seat, "c": c, "rolls": [], "x0": 0.0, "aim": 0.0, "streak": 0, "splits": 0, "fast": 0.0, "bot_n": -1,
			"ball": int(sv.balls[c]), "hook": int(sv.hooks[c]), "balls": 0, "split": false, "plan": {} })
	var ll := int(sv.last_loser)
	var first: int
	if ll == 0 or ll == 1: first = 0 if P[0].c != ll else 1
	else: first = 0 if rng.randf() < 0.5 else 1
	order = [first, 1 - first]
	oil = Tune.OILS[rng.randi() % Tune.OILS.size()]
	lane.oil = oil.len
	coach = not sim and not bool(sv.coached)
	cur = P[first]
	lane.rack()

func assist(p: Dictionary) -> int:
	return int(Store.data.assists[p.seat.index])

## Whose ball is next, or an empty dictionary when the match is over.
func plan() -> Dictionary:
	for f in 10:
		for i in order:
			var fr: Dictionary = Score.frames(P[i].rolls)[f]
			if not fr.done: return { "n": i, "f": f, "b": fr.balls.size(), "ro": 0 }
	if Score.final_score(P[0].rolls) != Score.final_score(P[1].rolls): return {}
	var r = ro.back() if not ro.is_empty() else null
	if r == null or (r[0] != null and r[1] != null):
		if r != null and (r[0] != r[1] or ro.size() >= 3): return {}
		r = [null, null]
		ro.append(r)
	return { "n": order[0] if r[order[0]] == null else order[1], "ro": ro.size(), "f": 9, "b": 0 }

func begin() -> void:
	var tn := plan()
	if tn.is_empty():
		end()
		return
	var p: Dictionary = P[tn.n]
	var changed: bool = p != cur or n == 0
	turn = tn
	cur = p
	n += 1
	var need := 10 if tn.ro else Score.standing(p.rolls)
	if need == 10 or changed: lane.rack()
	else: lane.tidy()
	fresh = need == 10
	x0 = p.x0; aim = p.aim; spin = 0.0; sw.t = 0.0
	state = "stance"; t = 0.0; armed = false; read_text = ""
	if changed:
		heckles = 0
		if not p.seat.bot: p.seat.rumble(0.5, 180)
		banner = { "t": 1.6, "c": p.c, "text": Tune.NAMES[p.c] + " to bowl", "sub": ("Roll-off, ball %d" % tn.ro) if tn.ro else "Frame %d" % (tn.f + 1) }
		Sfx.play("ready", 1.0, 0.9 if p.c else 1.1)

## The aim line, as far as this seat's assist shows it. Points are Vector2(x, d).
func guide() -> PackedVector2Array:
	var p := cur
	var a := assist(p)
	var hk: float = Tune.HOOK * Tune.BALLS[p.ball].hook
	if state == "stance" or state == "swing":
		var ang := deg_to_rad(aim / 10.0)
		var pts := Tune.trace(x0, Tune.START, sin(ang) * 8, cos(ang) * 8, Tune.HOOK_STEPS[p.hook] if a == 2 else 0.0, false, hk, oil.len)
		if a == 0:
			var cut := PackedVector2Array()
			for q in pts: if q.y <= 4.7: cut.append(q)
			return cut
		return pts
	if state == "roll" and a == 2 and lane.live and not lane.hit and not lane.gutter and lane.ball:
		var b := lane.ball
		return Tune.trace(b.position.x, -b.position.z, b.linear_velocity.x, -b.linear_velocity.z, spin, false, hk, oil.len)
	return PackedVector2Array()

func _process(dt: float) -> void:
	for q in P:
		if q.seat.bot: bot(q.seat)
	update(dt)

func after(sec: float, f: Callable) -> void:
	_after.append([sec, f])

func update(dt: float) -> void:
	var p := cur
	var s = p.seat
	t += dt
	flash = maxf(0.0, flash - dt * 1.2)
	shake = maxf(0.0, shake - dt * 1.5)
	for a in _after.duplicate():
		a[0] -= dt
		if a[0] <= 0:
			_after.erase(a)
			a[1].call()
	if _slow_t > 0:
		_slow_t -= dt
		if _slow_t <= 0: lane.pace = 1.0
	if _hitstop > 0:
		_hitstop -= dt
		if _hitstop <= 0: lane.pace = 1.0
	if not banner.is_empty():
		banner.t -= dt
		if banner.t <= 0: banner = {}
	if not call.is_empty():
		call.t -= dt
		if call.t <= 0: call = {}
	if state == "intro":
		if t > 2.0 or P.any(func(q): return q.seat.pressed("a")): begin()
		return
	if state == "over":
		if t > 1.6: finish()
		return
	if state == "done": return
	# the player who is waiting can heckle: a jeer, a bubble and a buzz in the bowler's hands. It never touches the ball.
	heckle_t -= dt
	if not heckle.is_empty():
		heckle.t -= dt
		if heckle.t <= 0: heckle = {}
	if state in ["stance", "swing", "roll"]:
		for q in P:
			if q == p or q.seat == s or not q.seat.pressed("x") or heckle_t > 0 or heckles >= 3: continue
			heckle = { "t": 1.8, "c": q.c, "text": Tune.HECKLES[rng.randi() % Tune.HECKLES.size()] }
			heckle_t = 2.5
			heckles += 1
			Sfx.play("tg-heckle")
			s.rumble(0.35, 220, 0.6)
	if state == "replay":
		var i := rp0 + int(t * 60 * Tune.REPLAY_SPEED)
		if i >= lane.rec.size() or lane.rec[i][88] > rp_end or P.any(func(q): return not q.seat.bot and q.seat.pressed("a")):
			rp_frame = null
			Sfx.play("tg-sweep")
			begin()
		else: rp_frame = lane.rec[i]
		return
	if state == "stance":
		var key: bool = s.keyboard
		if s.pressed("y"):
			p.ball = (p.ball + 1) % Tune.BALLS.size()
			Store.data.balls[p.c] = p.ball
			Sfx.play("select", 1.0, [1.25, 1.0, 0.8][p.ball])
		x0 = clampf(x0 + s.move.x * Tune.STEP_SPEED * dt, -0.45, 0.45)
		for pair in [["lb", -1], ["rb", 1]]:              # a tap moves the aim a tenth of a degree; holding sweeps it
			if s.pressed(pair[0]):
				aim = clampf(round(aim) + pair[1] * Tune.AIM_TAP * 10, -AIM, AIM)
				Sfx.play("tick")
			elif s.held(pair[0]) > 0.25: aim = clampf(aim + pair[1] * Tune.AIM_SWEEP * 10 * dt, -AIM, AIM)
		for pair in [["lt", -1], ["rt", 1]]:
			if s.pressed(pair[0]):
				var h := clampi(p.hook + pair[1], 0, Tune.HOOK_STEPS.size() - 1)
				if h != p.hook:
					p.hook = h
					Store.data.hooks[p.c] = h
					Sfx.play("tick", 1.0, 0.8 + h * 0.08)
				else: Sfx.play("deny")
		# the swing only starts once the stick has been let go since the turn began, so nothing carries over from the last shot
		if not armed and t > Tune.TURN_LOCK and (not s.down("a") if key else absf(s.aim.y) < 0.3): armed = true
		if armed and (s.pressed("a") if key else s.aim.y > 0.6):
			state = "swing"; sw.t = 0.0; sw.idle = 0.0
		return
	if state == "swing":
		var key: bool = s.keyboard
		sw.t += dt
		if t - sw.rum > 0.12:
			sw.rum = t
			s.rumble(0.1 + 0.25 * minf(1.0, sw.t / 0.8), 100, 0.0)
		if s.pressed("b"):
			state = "stance"
			Sfx.play("back")
			return
		if not key:
			sw.idle = sw.idle + dt if absf(s.aim.y) < 0.25 else 0.0
			if sw.idle > 0.6:
				state = "stance"
				return
		if (not s.down("a")) if key else s.aim.y < -0.5: release(sin(sw.t * 3.1) * 0.4 if key else s.aim.x)
		return
	if state == "roll":
		lane.spin = spin
		if lane.live and lane.ball and not lane.hit and not lane.gutter and spin != 0.0 and t - _rum_t > 0.12 and Tune.grip(-lane.ball.position.z, oil.len) > 0.5:
			_rum_t = t
			s.rumble(0.18, 90, 0.25)                         # a light buzz as the hook bites
		if lane.live and lane.ball and not lane.gutter and t - _roll_t > 0.11:
			_roll_t = t
			Sfx.play("tg-roll", 1.0, 0.7 + lane.ball.linear_velocity.length() / 14.0)
		if lane.gutter and not _was_gutter:
			Sfx.play("tg-gutter")
			s.rumble(0.5, 90)
			after(0.16, func(): s.rumble(0.5, 90))
		if lane.hit and not _was_hit and fresh and not Store.reduced() and not sim and absf(absf(lane.hit_x) - 0.07) < 0.03:
			lane.pace = 0.4                                  # a pocket hit plays in slow motion for a moment
			_slow_t = 0.45
		_was_gutter = lane.gutter
		_was_hit = lane.hit
		var cl := lane.clacks
		for i in mini(6, cl.size()):
			if cl[i] > 0.4: Sfx.play("tg-pin", clampf(cl[i] / 22.0, 0.03, 0.3) / 0.3, 0.85 + (i % 3) * 0.12)
		if not cl.is_empty():
			var v: float = cl.max()
			if v > 2: for q in P: q.seat.rumble(clampf(v / 9.0, 0.2, 0.8), 110)
			cl.clear()
		if lane.settled(): score(lane.result)
		return
	if state == "show" and (t > hold or (t > 0.5 and P.any(func(q): return not q.seat.bot and q.seat.pressed("a")))):
		if replay_next:
			replay_next = false
			state = "replay"
			t = 0.0
			var from := lane.hit_t - 0.5
			rp_end = from + Tune.REPLAY_LENGTH
			rp0 = 0
			for i in lane.rec.size():
				if lane.rec[i][88] >= from:
					rp0 = i
					break
			return
		Sfx.play("tg-sweep")
		begin()

var _was_gutter := false
var _was_hit := false

func swing_power() -> float:
	var floor_pw := 0.7 if assist(cur) == 2 else 0.55
	var pw := 0.55 + 0.45 * minf(1.0, sw.t / Tune.POWER_TIME)
	if sw.t > Tune.TIRE_AFTER: pw -= Tune.TIRE_RATE * (sw.t - Tune.TIRE_AFTER)
	return clampf(pw, floor_pw, 1.0)

func release(drift: float) -> void:
	var p := cur
	var a := assist(p)
	var pw := swing_power()
	var bl: Dictionary = Tune.BALLS[p.ball]
	var v := Tune.speed_of(pw, bl)
	var ang: float = aim / 10.0 + clampf(drift, -1, 1) * Tune.DRIFT * [1.0, 0.5, 0.25][a]
	p.x0 = x0; p.aim = aim; p.fast = maxf(p.fast, v * 3.6)
	power = pw; kmh = v * 3.6
	lane.bowl(x0, ang, v, a == 2, bl)
	spin = Tune.HOOK_STEPS[p.hook]
	lane.spin = spin
	_was_gutter = false; _was_hit = false
	p.balls += 1
	state = "roll"; t = 0.0; _roll_t = 0.0
	Sfx.play("tg-release")
	p.seat.rumble(0.4 + 0.4 * (pw - 0.55) / 0.45, 120)

## A ball has settled: mark the card and say what happened.
func score(count: int) -> void:
	var p := cur
	var left := lane.up.size()
	var text := ""
	var sub := ""
	var big := false
	if turn.ro: ro.back()[p.n] = count
	else: p.rolls.append(count)
	var strike := fresh and count == 10
	var spare := not fresh and left == 0
	if strike:
		p.streak += 1
		text = "Turkey" if p.streak == 3 else "Strike"
		big = true
	else:
		p.streak = 0
		if spare:
			text = "Spare"
			if p.split:
				p.splits += 1
				sub = "Split converted"
		elif count == 0 and lane.gutter: text = "Gutter"
		else: text = "%d down" % count
	if fresh and not turn.ro: read_text = Tune.shot_read(lane.hit, lane.hit_x, lane.gutter and not lane.hit, count)
	elif spare: read_text = ""
	else: read_text = "%d left standing." % left if left else ""
	if strike or spare: flash = 1.0
	if not fresh: p.split = false
	else:
		p.split = not strike and not turn.ro and Score.is_split(lane.up)
		if p.split:
			text = "Split"
			sub = "-".join(lane.up.map(func(i): return str(i + 1)))
	hold = Tune.SHOW_BIG if big or spare else Tune.SHOW_NORMAL
	call = { "t": hold + 0.1, "max": hold + 0.1, "text": text, "sub": sub, "c": p.c }
	state = "show"; t = 0.0
	replay_next = strike and not sim and not Store.reduced() and lane.hit and lane.rec.size() > 20
	if coach and P.all(func(q): return q.seat.bot or q.balls >= 2):
		coach = false
		Store.data.coached = true
	if strike:
		Sfx.play("tg-strike")
		lane.pace = 0.0                                      # a hit-stop: everything holds for a beat
		_hitstop = 0.06
		_slow_t = 0.0
		if not Store.reduced(): shake = 0.4
		for q in P: q.seat.rumble(0.9, 260)
		fx.emit("strike", p.c)
	elif spare:
		Sfx.play("tg-spare")
		fx.emit("spare", p.c)

func end() -> void:
	var a := Score.final_score(P[0].rolls)
	var b := Score.final_score(P[1].rolls)
	var r = ro.back() if not ro.is_empty() else null
	if a != b: won = 0 if a > b else 1
	elif r != null and r[0] != r[1]: won = 0 if r[0] > r[1] else 1
	else: won = -1
	state = "over"; t = 0.0
	cur = P[0 if won < 0 else won]

func by(c: int) -> int:
	return 0 if P[0].c == c else 1

func finish() -> void:
	if state == "done": return
	state = "done"
	var sv: Dictionary = Store.data
	var sc := P.map(func(q): return Score.final_score(q.rolls))
	var tl := P.map(func(q): return Score.tally(q.rolls))
	var pair := func(f: Callable) -> String: return "%s and %s" % [f.call(by(0)), f.call(by(1))]
	if won < 0:
		sv.draws = int(sv.draws) + 1
		sv.last_loser = -1
	else:
		sv.wins[P[won].c] = int(sv.wins[P[won].c]) + 1
		sv.last_loser = P[1 - won].c
	sv.best = maxi(int(sv.best), maxi(sc[0], sc[1]))
	Store.flush()
	var note := "Blue %d, Amber %d" % [sc[by(0)], sc[by(1)]]
	if not ro.is_empty(): note += ", still level after three roll-offs." if won < 0 else ", settled by a roll-off."
	else: note += "."
	finished.emit({
		"title": "A draw" if won < 0 else Tune.NAMES[P[won].c] + " wins",
		"won": -1 if won < 0 else P[won].c,
		"scores": [sc[by(0)], sc[by(1)]],
		"note": note,
		"stats": [
			["Strikes", pair.call(func(i): return tl[i].strikes)],
			["Spares", pair.call(func(i): return tl[i].spares)],
			["Open frames", pair.call(func(i): return tl[i].open)],
			["Splits converted", pair.call(func(i): return P[i].splits)],
			["Fastest ball, km/h", pair.call(func(i): return int(round(P[i].fast)))],
		],
	})

## The practice bot bowls for whichever seat it holds. The same planner drives the headless balance runs.
func bot(seat) -> void:
	seat.ctl = {}
	var p := cur
	if p.is_empty() or p.seat != seat: return
	if state == "intro" or state == "show" or state == "replay": return
	var ctl: Dictionary = seat.ctl
	var buttons := {}
	ctl.buttons = buttons
	if state == "stance":
		if p.bot_n != n:                                     # plan this ball once
			p.bot_n = n
			var up := lane.up
			var spots := Tune.spots()
			var hold_s := clampf(0.53 + rng.randfn(0, 1) * 0.05, 0.3, 0.8)
			var bl: Dictionary = Tune.BALLS[p.ball]
			var v := Tune.speed_of(0.55 + 0.45 * hold_s / 0.8, bl)
			var xt := 0.0
			var hk := 3
			if fresh:
				xt = 0.068; hk = 1
			else:
				var lead: int = up[0]
				var cx := 0.0
				for i in up:
					if spots[i].y < spots[lead].y: lead = i
					cx += spots[i].x
				cx /= up.size()
				xt = spots[lead].x + clampf(cx - spots[lead].x, -0.045, 0.045)
			var sp: float = Tune.HOOK_STEPS[hk]
			var pref := 0.2 if fresh else xt * 0.5
			var best := {}
			for a in range(-AIM, AIM + 1):
				var r := deg_to_rad(a / 10.0)
				var pts := Tune.trace(0, Tune.START, sin(r) * v, cos(r) * v, sp, true, Tune.HOOK * bl.hook, oil.len)
				var bx: float = xt - pts[pts.size() - 1].x
				if absf(bx) <= 0.42 and (best.is_empty() or absf(bx - pref) < absf(best.x0 - pref)): best = { "a": a, "x0": bx }
			if best.is_empty(): best = { "a": 0, "x0": clampf(xt, -0.42, 0.42) }
			p.plan = { "x0": clampf(best.x0 + rng.randfn(0, 1) * 0.018, -0.45, 0.45), "aim": best.a, "hold": hold_s, "hk": hk,
				"drift": clampf(rng.randfn(0, 1) * 0.2, -1, 1), "wait": rng.randf_range(2.5, 4.0) if not (sim or quick) else 0.6, "flip": 0 }
		var b: Dictionary = p.plan
		var dx: float = b.x0 - x0
		var da: float = b.aim - aim
		var dh: int = b.hk - p.hook
		if absf(dx) > 0.003: ctl.x = clampf(dx * 8, -1, 1)
		if dh != 0:                                          # set the hook first, as a person would
			b.flip ^= 1
			if b.flip: buttons["rt" if dh > 0 else "lt"] = 1.0
		elif absf(da) > 3: buttons["rb" if da > 0 else "lb"] = 1.0       # hold a bumper to sweep the aim
		elif absf(da) >= 0.5:                                # then tap to finish
			b.flip ^= 1
			if b.flip: buttons["rb" if da > 0 else "lb"] = 1.0
		elif t > b.wait and absf(dx) <= 0.003: ctl.ay = 1.0
	elif state == "swing":
		if sw.t < p.plan.hold: ctl.ay = 1.0
		else:
			ctl.ay = -1.0
			ctl.ax = p.plan.drift
