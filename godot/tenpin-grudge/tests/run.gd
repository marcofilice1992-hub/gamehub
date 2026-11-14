extends Node
## Headless checks: godot --headless --path . res://tests/run.tscn --fixed-fps 240
## Scoring, match flow with two practice bots, pinfall consistency. Exits 1 on any failure.

var fails := 0
var store: Node
var pads: Node
func ok(cond: bool, what: String) -> void:
	if not cond:
		fails += 1
		print("FAIL ", what)
	else: print("ok   ", what)

func rep(v, k: int) -> Array:
	var a := []
	for i in k: a.append(v)
	return a

func scoring() -> void:
	ok(Score.final_score(rep(10, 12)) == 300, "perfect game is 300")
	ok(Score.final_score(rep(5, 21)) == 150, "all 5-5 spares is 150")
	ok(Score.final_score([9, 0].duplicate() + rep(0, 0) + [9,0,9,0,9,0,9,0,9,0,9,0,9,0,9,0,9,0]) == 90, "all 9-0 is 90")
	ok(Score.final_score(rep(0, 20)) == 0, "gutter game is 0")
	ok(Score.frames(rep(10, 9) + [10, 10])[9].done == false, "tenth frame strike, strike waits for a third ball")
	ok(Score.frames(rep(0, 18) + [7, 2])[9].done, "tenth frame open ends after two")
	ok(Score.frames(rep(0, 18) + [7, 3])[9].done == false, "tenth frame spare earns a third")
	ok(Score.final_score(rep(0, 18) + [7, 3, 10]) == 20, "tenth frame 7-3-X is 20")
	ok(Score.frames([10])[0].total == -1, "a strike's total waits for its bonus")
	ok(Score.shown([10, 3, 4]) == 24, "X then 3-4 shows 24")
	ok(Score.standing([7]) == 3, "three standing after a 7")
	ok(Score.standing([10]) == 10, "fresh rack after a strike")
	ok(Score.standing(rep(0, 18) + [10]) == 10, "fresh rack after a tenth-frame strike")
	ok(Score.final_score(Score.fill([10, 10], true)) == 300, "best case from two strikes is 300")
	ok(Score.is_split([6, 9]), "7-10 is a split")
	ok(not Score.is_split([0, 1]), "head pin standing is not a split")
	var tl := Score.tally([10, 5, 5, 3, 4] + rep(0, 14))
	ok(tl.strikes == 1 and tl.spares == 1, "tally counts a strike and a spare")

func pinfall() -> void:
	var lane := Lane.new()
	get_tree().root.add_child(lane)
	await get_tree().physics_frame
	var hits := 0
	var counts := []
	for i in 12:
		lane.rng.seed = 100 + i
		lane.rack()
		lane.spin = 0.0
		lane.bowl(0.065, 0.0, 8.0, false, Tune.BALLS[1])
		var k := 0
		while not lane.settled() and k < 240 * 12:
			await get_tree().physics_frame
			k += 1
		counts.append(lane.result)
		if lane.result == 10: hits += 1
	print("     pocket, straight, 8 m/s: ", counts)
	ok(hits >= 5, "a straight pocket ball strikes at least 5 of 12 (%d)" % hits)
	# a hooked ball into the same pocket, from further right so it arrives at the same spot
	var hk := 0
	var hc := []
	for i in 12:
		lane.rng.seed = 100 + i
		lane.rack()
		lane.spin = -0.6
		lane.oil = 12.0
		# from 30 cm right, find the angle (in tenths of a degree, as a player sets it) whose path meets the pocket
		var best := 0.0
		var miss := 9.0
		for a in range(-40, 41):
			var r := deg_to_rad(a / 10.0)
			var pts := Tune.trace(0.3, Tune.START, sin(r) * 8.0, cos(r) * 8.0, -0.6, true, Tune.HOOK, 12.0)
			var e := absf(pts[pts.size() - 1].x - 0.065)
			if e < miss:
				miss = e
				best = a / 10.0
		lane.bowl(0.3, best, 8.0, false, Tune.BALLS[1])
		var k := 0
		while not lane.settled() and k < 240 * 12:
			await get_tree().physics_frame
			k += 1
		hc.append(lane.result)
		if lane.result == 10: hk += 1
	print("     pocket, medium left hook: ", hc)
	ok(hk >= hits, "a hook carries at least as well as straight (%d vs %d)" % [hk, hits])
	# the same shot, after different histories, counts the same
	var again := []
	for i in [3, 0, 7]:
		lane.rng.seed = 100 + i
		lane.rack()
		lane.spin = 0.0
		lane.bowl(0.065, 0.0, 8.0, false, Tune.BALLS[1])
		var k := 0
		while not lane.settled() and k < 240 * 12:
			await get_tree().physics_frame
			k += 1
		again.append(lane.result)
	ok(again == [counts[3], counts[0], counts[7]], "repeat shots count the same %s" % [again])
	# a gutter ball scores nothing and does not touch the pins
	lane.rack()
	lane.spin = 0.0
	lane.bowl(0.4, 3.0, 8.0, false, Tune.BALLS[1])
	var k2 := 0
	while not lane.settled() and k2 < 240 * 12:
		await get_tree().physics_frame
		k2 += 1
	ok(lane.gutter and lane.result == 0, "a ball into the gutter scores 0")
	lane.rack()
	lane.bowl(0.4, 3.0, 8.0, true, Tune.BALLS[1])
	k2 = 0
	while not lane.settled() and k2 < 240 * 12:
		await get_tree().physics_frame
		k2 += 1
	ok(not lane.gutter and lane.result > 0, "with bumpers the same ball stays on the lane (%d)" % lane.result)
	lane.queue_free()

func bot_match(seed_value: int, assist: int) -> Dictionary:
	store.data.assists = [assist, assist]
	store.data.last_loser = -1
	for s in pads.seats: pads.assign(pads.BOT, s)
	var m := Match.new()
	get_tree().root.add_child(m)
	m.setup(pads.seats, seed_value, true)
	var res := {}
	m.finished.connect(func(r): res.merge(r))
	var frames := 0
	var states := {}
	while res.is_empty() and frames < 240 * 60 * 20:
		await get_tree().process_frame
		frames += 1
		states[m.state] = true
	var out := { "res": res, "rolls": [m.P[0].rolls, m.P[1].rolls], "frames": frames, "states": states, "ro": m.ro }
	m.queue_free()
	await get_tree().process_frame
	return out

func _ready() -> void:
	await get_tree().process_frame
	store = get_tree().root.get_node("Store")
	pads = get_tree().root.get_node("Pads")
	store.memory = true
	get_tree().root.get_node("Sfx").enabled = false
	scoring()
	await pinfall()
	var avg := [0.0, 0.0]
	for i in 8:
		var r := await bot_match(11 + i, 0 if i < 4 else 2)
		var res: Dictionary = r.res
		ok(not res.is_empty(), "bot match %d finishes (%.0f s of play)" % [i, r.frames / 240.0])
		if res.is_empty(): continue
		for c in 2:
			ok(Score.frames(r.rolls[c])[9].done, "match %d: player %d bowled ten frames" % [i, c])
		var t0 := Score.tally(r.rolls[0])
		var t1 := Score.tally(r.rolls[1])
		print("     match %d (assist %d): %s  strikes %d+%d spares %d+%d open %d+%d" % [i, 0 if i < 4 else 2, res.scores, t0.strikes, t1.strikes, t0.spares, t1.spares, t0.open, t1.open])
		avg[0 if i < 4 else 1] += (res.scores[0] + res.scores[1]) / 8.0
	print("     bot average: %.0f at assist 0, %.0f at assist 2" % avg)
	print("%d failure(s)" % fails)
	get_tree().quit(1 if fails else 0)
