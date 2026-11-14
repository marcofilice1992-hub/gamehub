extends "res://tests/carry.gd"
## Runs tests/carry.gd's grid for several settings and scores each against real carry figures (lower is closer).
## CFGS='[{...},{...}]' godot --headless res://tests/sweep.tscn --fixed-fps 240

## USBC Bowlscore free-fall results (Sept 2021 string-pinsetter report): strikes peak above 90% at 2.5-3.0 in (6.4-7.6 cm)
## from the head pin; averaged over 0-5.5 in they are 36%, 41%, 53% and 59% at 0, 2, 4 and 6 degrees. The rows below are
## shaped to those averages; light hits leave the 10 pin, high hits the 4 and 7.
const TARGET := [
	[0.00, 0.15, 0.60, 0.85, 0.60, 0.15, 0.00],
	[0.00, 0.20, 0.65, 0.90, 0.75, 0.30, 0.05],
	[0.00, 0.30, 0.80, 0.95, 0.90, 0.55, 0.20],
	[0.02, 0.35, 0.85, 0.95, 0.95, 0.70, 0.30],
]

func _ready() -> void:
	await get_tree().process_frame
	var cfgs: Array = JSON.parse_string(OS.get_environment("CFGS"))
	for c in cfgs:
		var lane := Lane.new()
		add_child(lane)
		await get_tree().physics_frame
		lane.cfg.merge(c, true)
		var err := 0.0
		var rows := []
		var defl := 0.0
		var loss := 0.0
		var air := 0.0
		var dn := 0
		for ai in ANGS.size():
			var row := []
			for oi in OFFS.size():
				var s := 0
				for i in N:
					var r := await shot(lane, OFFS[oi], ANGS[ai], 1000 + i)
					if r.n == 10: s += 1
					if OFFS[oi] == 0.065 and ANGS[ai] == 6.0:
						defl += r.defl; loss += r.loss; dn += 1
					air = maxf(air, r.air)
				row.append(s)
				err += pow(float(s) / N - TARGET[ai][oi], 2)
			rows.append(row)
		var avg := rows.map(func(r): return "%d%%" % int(round(100.0 * r.reduce(func(a, b): return a + b, 0) / (N * r.size()))))
		print("%s\n   err %.2f  by angle %s  rows %s  defl %.1f cm  loss %.1f m/s  air %.2f m" % [c, err, avg, rows, defl / dn * 100, loss / dn, air])
		lane.queue_free()
		await get_tree().process_frame
	get_tree().quit()
