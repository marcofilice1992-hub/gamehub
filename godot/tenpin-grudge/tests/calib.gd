extends Node
## Pinfall calibration: bot-like first balls (the practice bot's aim and noise) under several pin settings.
## godot --headless res://tests/calib.tscn --fixed-fps 240

func one(lane: Lane, rng: RandomNumberGenerator, assist: int) -> int:
	var hold := clampf(0.53 + rng.randfn(0, 1) * 0.05, 0.3, 0.8)
	var bl: Dictionary = Tune.BALLS[1]
	var v := Tune.speed_of(0.55 + 0.45 * hold / 0.8, bl)
	var best := {}
	for a in range(-40, 41):
		var r := deg_to_rad(a / 10.0)
		var pts := Tune.trace(0, Tune.START, sin(r) * v, cos(r) * v, -0.6, true, Tune.HOOK, 12.0)
		var bx: float = 0.068 - pts[pts.size() - 1].x
		if absf(bx) <= 0.42 and (best.is_empty() or absf(bx - 0.2) < absf(best.x0 - 0.2)): best = { "a": a, "x0": bx }
	var x0: float = best.x0 + rng.randfn(0, 1) * 0.018
	var ang: float = best.a / 10.0 + clampf(rng.randfn(0, 1) * 0.2, -1, 1) * Tune.DRIFT * [1.0, 0.5, 0.25][assist]
	lane.rng.seed = rng.randi()
	lane.rack()
	lane.oil = 12.0
	lane.spin = -0.6
	lane.bowl(x0, ang, v, assist == 2, bl)
	var k := 0
	while not lane.settled() and k < 240 * 12:
		await get_tree().physics_frame
		k += 1
	return lane.result

func _ready() -> void:
	await get_tree().process_frame
	var lane := Lane.new()
	add_child(lane)
	await get_tree().physics_frame
	var configs: Array = JSON.parse_string(OS.get_environment("CALIB")) if OS.get_environment("CALIB") != "" else [[0.45, 0.35, 0.35, 0.45]]
	for c in configs:
		lane._pin_mat.friction = c[0]; lane._pin_mat.bounce = c[1]; Tune  # spin damp and deck set below
		lane.set_meta("spin_damp", c[2])
		lane._lane_mat.friction = c[3]
		for assist in [0, 2]:
			var rng := RandomNumberGenerator.new()
			rng.seed = 5
			var strikes := 0
			var pins := 0
			var N := 40
			for i in N:
				var r := await one(lane, rng, assist)
				pins += r
				if r == 10: strikes += 1
			print("%s assist %d: strikes %d/%d, mean first ball %.2f" % [c, assist, strikes, N, float(pins) / N])
	get_tree().quit()
