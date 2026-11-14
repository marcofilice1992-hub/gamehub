extends Node
## Pin carry against entry angle and where the ball meets the head pin, with real-bowling targets alongside.
## godot --headless res://tests/carry.tscn --fixed-fps 240
## Each shot starts 1.2 m before the head pin at 7.3 m/s (a typical speed at the pins), aimed so the ball's centre crosses
## the head pin's row at the given offset. Spin follows the angle, as a hook ball's would.

const OFFS := [0.0, 0.03, 0.05, 0.065, 0.08, 0.10, 0.12]
const ANGS := [0.0, 2.0, 4.0, 6.0]
var N := int(OS.get_environment("N")) if OS.get_environment("N") != "" else 10

func shot(lane: Lane, off: float, ang: float, seed_value: int) -> Dictionary:
	lane.rng.seed = seed_value
	lane.rack()
	lane.oil = 0.0                       # dry back end: full hook force applies
	lane.spin = -clampf(ang / 6.0, 0.0, 1.0) if ang > 0 else 0.0
	var back := 1.2
	var a := deg_to_rad(ang)
	var x0 := off + back * tan(a)        # coming in from the right, heading left
	lane.bowl(x0, -ang, 7.3, false, Tune.BALLS[1], Tune.HEAD - back)
	var k := 0
	var hx := 99.0
	var hd := 0.0
	var slope := 0.0
	var v0 := 0.0
	var defl := 0.0
	var v1 := 0.0
	var done := false
	var pins_air := 0.0
	var prev := Vector3.ZERO
	var prev_v := Vector3.ZERO
	while not lane.settled() and k < 240 * 10:
		await get_tree().physics_frame
		k += 1
		if lane.ball and lane.hit and hx == 99.0:         # the state just before contact
			hx = prev.x; hd = -prev.z; slope = prev_v.x / -prev_v.z; v0 = prev_v.length()
		var d_end := Tune.HEAD + 3 * Tune.ROW
		if lane.ball and hx != 99.0 and not done and -lane.ball.position.z >= d_end:
			done = true
			defl = lane.ball.position.x - (hx + slope * (d_end - hd))
			v1 = lane.ball.linear_velocity.length()
		if lane.ball:
			prev = lane.ball.position
			prev_v = lane.ball.linear_velocity
		for b in lane.pins:
			if b and is_instance_valid(b): pins_air = maxf(pins_air, b.position.y - Tune.COG)
	return { "n": lane.result, "defl": defl, "loss": v0 - v1 if done else 0.0, "up": lane.up.duplicate(), "air": pins_air, "t": lane.t - lane.hit_t }

func _ready() -> void:
	await get_tree().process_frame
	var lane := Lane.new()
	add_child(lane)
	await get_tree().physics_frame
	var leaves := {}
	var defl := 0.0
	var loss := 0.0
	var dn := 0
	var env := OS.get_environment("CFG")
	if env != "": lane.cfg.merge(JSON.parse_string(env), true)
	print("cfg ", lane.cfg)
	var air := 0.0
	var settle := 0.0
	print("strikes out of %d   offset (cm right of the head pin) ->" % N)
	print("angle  " + "  ".join(OFFS.map(func(o): return "%5.1f" % (o * 100))))
	for ang in ANGS:
		var row := "%4.0f°  " % ang
		for off in OFFS:
			var s := 0
			for i in N:
				var r := await shot(lane, off, ang, 1000 + i)
				if r.n == 10: s += 1
				elif off >= 0.05 and off <= 0.08 and ang >= 4:
					var key := "-".join(r.up.map(func(p): return str(p + 1)))
					leaves[key] = leaves.get(key, 0) + 1
				if off == 0.065 and ang == 6.0:
					defl += r.defl; dn += 1; loss += r.loss
				air = maxf(air, r.air)
				settle += r.t
			row += "  %5d" % s
		print(row)
	print("pocket leaves at 4-6°: ", leaves)
	print("pocket, 6°: ball deflected %.1f cm through the pins, lost %.2f m/s" % [defl / maxf(1, dn) * 100, loss / maxf(1, dn)])
	print("highest pin flight: %.2f m   average time to count: %.2f s" % [air, settle / (ANGS.size() * OFFS.size() * N)])
	get_tree().quit()
