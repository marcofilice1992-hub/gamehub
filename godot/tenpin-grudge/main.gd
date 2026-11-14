extends Node
## The front of the game: the join screen, the match, the pause menu and the results.
## Seats: A joins with a controller or a keyboard half, Y adds the practice bot, X changes a seat's assist, Start bowls.

enum Screen { JOIN, PLAY, RESULTS }

var screen := Screen.JOIN
var match_node: Match
var hall: Hall
var hud: Hud
var ui: Control
var paused := false
var paused_by := 0
var menu_i := 0
var result := {}
var _repeat := {}            # stick-as-D-pad repeat timers, per seat
var _match_seed := 0

const MENU := ["Resume", "Restart match", "Volume", "Graphics", "Rumble", "Reduced motion", "Fullscreen", "Quit to seats"]
const GRAPHICS := ["auto", "low", "medium", "high", "ultra"]
const ASSISTS := ["Off", "Guide line, steadier release", "Full path, bumpers, steadiest release"]

func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	Pads.process_mode = Node.PROCESS_MODE_ALWAYS
	_apply_window()
	ui = Front.new()
	ui.main = self
	var layer := CanvasLayer.new()
	layer.layer = 10
	add_child(layer)
	layer.add_child(ui)
	_match_seed = int(Time.get_unix_time_from_system()) % 100000
	for a in OS.get_cmdline_user_args():                     # --demo: two bots; --shots=DIR: save screenshots of each stage, then quit
		if a == "--demo": _demo = true
		elif a.begins_with("--shots="): _shots = a.substr(8)
		elif a.begins_with("--seed="): _match_seed = int(a.substr(7))
		elif a.begins_with("--only="): _only = a.substr(7)          # e.g. --only=05,06,08
		elif a.begins_with("--graphics="): Store.data.settings.graphics = a.substr(11)
	if _demo or _shots != "": Store.memory = true              # demo runs never touch the real record

var _demo := false
var _shots := ""
var _taken := {}
var _frames := 0
var _saved := 0
var _only := ""
var _t0 := 0

func _capture(name: String) -> void:
	if _shots == "" or _taken.has(name): return
	if _only != "" and not _only.contains(name.substr(0, 2)): return
	_taken[name] = true
	RenderingServer.render_loop_enabled = true               # draw only around a capture: software rendering is slow
	get_viewport().disable_3d = false
	for i in 8: await get_tree().process_frame               # let temporal AA settle
	await RenderingServer.frame_post_draw
	var img := get_viewport().get_texture().get_image()
	if img: img.save_png("%s/%s.png" % [_shots, name])
	print("perf %s: objects %d, draw calls %d, primitives %d, video memory %.0f MB" % [name,
		Performance.get_monitor(Performance.RENDER_TOTAL_OBJECTS_IN_FRAME), Performance.get_monitor(Performance.RENDER_TOTAL_DRAW_CALLS_IN_FRAME),
		Performance.get_monitor(Performance.RENDER_TOTAL_PRIMITIVES_IN_FRAME), Performance.get_monitor(Performance.RENDER_VIDEO_MEM_USED) / 1048576.0])
	print("shot ", name, " at frame ", _frames, " (", (Time.get_ticks_msec() - _t0) / 1000, " s)")
	_saved += 1
	RenderingServer.render_loop_enabled = false
	get_viewport().disable_3d = true

func _shots_step() -> void:
	_frames += 1
	if _frames == 1:
		RenderingServer.render_loop_enabled = false
		get_viewport().disable_3d = true
		_t0 = Time.get_ticks_msec()
	if _frames % 100 == 0: print("frame ", _frames, " at ", (Time.get_ticks_msec() - _t0) / 1000.0, " s")
	if screen == Screen.JOIN:
		if _frames == 20: _capture("01-seats")
		if _frames == 40:
			for s in Pads.seats: Pads.assign(Pads.BOT, s)
			start_match()
		return
	if screen == Screen.RESULTS:
		_capture("10-results")                              # a layout check: the match was cut short after the pause shot
		if _saved >= 10: get_tree().quit()
		return
	var m := match_node
	if m == null: return
	var key := m.state
	if key == "intro" and m.t > 0.02: _capture("00-flyover")
	if key == "intro" and m.t > 0.6: _capture("02-intro")
	if key == "stance" and m.t > 1.2: _capture("03-stance")
	if key == "swing" and m.sw.t > 0.3: _capture("04-swing")
	if key == "roll" and m.t > 1.0: _capture("05-roll")
	if key == "roll" and m.lane.hit and m.lane.t - m.lane.hit_t > 0.25: _capture("06-impact")
	if key == "show" and m.t > 0.4: _capture("07-show")
	if key == "replay" and m.t > 1.2: _capture("08-replay")
	if _only != "":
		if _saved >= _only.split(",").size() or m.n > 8: get_tree().quit()
		return
	if _saved == 8 and not paused:
		paused = true
		get_tree().paused = true
	if paused and _saved == 8: _capture("09-pause")
	if _saved == 9 and paused:
		paused = false
		get_tree().paused = false
		m.won = 0
		m.state = "over"
		m.finish()
	if m.n > 8: get_tree().quit()

func _apply_window() -> void:
	if DisplayServer.get_name() == "headless": return
	DisplayServer.window_set_mode(DisplayServer.WINDOW_MODE_FULLSCREEN if Store.get_setting("fullscreen", true) else DisplayServer.WINDOW_MODE_WINDOWED)

func _process(dt: float) -> void:
	if _shots != "": _shots_step()
	elif _demo and screen == Screen.JOIN:
		for s in Pads.seats: Pads.assign(Pads.BOT, s)
		start_match()
	match screen:
		Screen.JOIN: _join()
		Screen.PLAY: _play(dt)
		Screen.RESULTS: _results()
	ui.queue_redraw()

# ---- seats -----------------------------------------------------------------------------------------------
func _join() -> void:
	for d in Pads.joiners():
		for s in Pads.seats:
			if not s.joined:
				Pads.assign(d, s)
				Sfx.play("join", 1.0, 1.1 if s.index == 0 else 0.9)
				break
	for s in Pads.seats:
		if not s.joined or s.bot: continue
		if s.pressed("b"):
			Pads.free_seat(s)
			Sfx.play("back")
		elif s.pressed("x"):
			var a := (int(Store.data.assists[s.index]) + 1) % 3
			Store.data.assists[s.index] = a
			Store.flush()
			Sfx.play("tick", 1.0, 0.9 + a * 0.1)
		elif s.pressed("y"):                                  # the practice bot takes the empty seat, or leaves it
			var other = Pads.seats[1 - s.index]
			if not other.joined:
				Pads.assign(Pads.BOT, other)
				Sfx.play("join", 1.0, 0.8)
			elif other.bot:
				Pads.free_seat(other)
				Sfx.play("back")
		elif s.pressed("start"):                              # A only joins; Start begins, so nobody starts a match by joining
			if Pads.joined().size() == 2: start_match()
			else: Sfx.play("deny")
		elif s.pressed("back"):
			get_tree().quit()

func start_match() -> void:
	end_match()
	_match_seed += 1
	match_node = Match.new()
	add_child(match_node)
	match_node.process_mode = Node.PROCESS_MODE_PAUSABLE
	match_node.quick = _shots != ""
	match_node.setup(Pads.seats, _match_seed)
	match_node.finished.connect(_on_finished)
	hall = Hall.new()
	hall.process_mode = Node.PROCESS_MODE_PAUSABLE
	add_child(hall)
	hall.build(match_node)
	var layer := CanvasLayer.new()
	layer.name = "HudLayer"
	add_child(layer)
	hud = Hud.new()
	hud.process_mode = Node.PROCESS_MODE_PAUSABLE
	layer.add_child(hud)
	hud.attach(match_node)
	hud.hall = hall
	screen = Screen.PLAY
	paused = false
	get_tree().paused = false

func end_match() -> void:
	get_tree().paused = false
	paused = false
	for n in [match_node, hall]:
		if n and is_instance_valid(n): n.queue_free()
	var layer := get_node_or_null("HudLayer")
	if layer:
		layer.name = "HudLayerGone"
		layer.queue_free()
	match_node = null
	hall = null
	hud = null

func _on_finished(r: Dictionary) -> void:
	result = r
	screen = Screen.RESULTS
	if hud: hud.visible = false                               # the results screen stands on its own over the hall
	menu_i = 0
	Sfx.play("win")

# ---- the match and the pause menu ---------------------------------------------------------------------------
func _nav(s) -> int:
	# up and down from the stick or D-pad, with a repeat when held
	var y: float = s.move.y
	var k: int = s.index
	if absf(y) < 0.5:
		_repeat[k] = 0.0
		return 0
	var t: float = _repeat.get(k, 0.0)
	_repeat[k] = t + get_process_delta_time()
	if t == 0.0 or t > 0.4:
		if t > 0.4: _repeat[k] = 0.28
		return 1 if y > 0 else -1
	return 0

func _side(s) -> int:
	var e := _edge(s)
	if s.pressed("rb") or e == 1: return 1
	if s.pressed("lb") or e == -1: return -1
	return 0

var _xprev := {}
func _edge(s) -> int:                                         # the stick pushed left or right, once per push
	var was: int = _xprev.get(s.index, 0)
	var now := 1 if s.move.x > 0.6 else -1 if s.move.x < -0.6 else 0
	_xprev[s.index] = now
	return now if now != was else 0

func _play(_dt: float) -> void:
	if not paused:
		for s in Pads.seats:
			if s.joined and not s.bot and (s.pressed("start") or s.lost):
				paused = true
				paused_by = s.index
				menu_i = 0
				get_tree().paused = true
				Sfx.play("select")
				return
		return
	for s in Pads.seats:
		if not s.joined or s.bot: continue
		var d := _nav(s)
		if d:
			menu_i = (menu_i + d + MENU.size()) % MENU.size()
			Sfx.play("move")
		var side := _side(s)
		var item: String = MENU[menu_i]
		if item == "Volume" and side:
			Store.set_setting("volume", clampi(int(Store.get_setting("volume", 7)) + side, 0, 10))
			Sfx.play("tick")
		if item == "Graphics" and (side or s.pressed("a")):
			_graphics(side if side else 1)
			Sfx.play("tick")
			if s.pressed("a"): return
		if s.pressed("start") or s.pressed("b"):
			_resume()
			return
		if s.pressed("a"):
			match item:
				"Resume": _resume()
				"Restart match": start_match()
				"Rumble":
					Store.set_setting("rumble", not Store.get_setting("rumble", true))
					s.rumble(0.6, 150)
				"Reduced motion": Store.set_setting("reduced_motion", not Store.reduced())
				"Fullscreen":
					Store.set_setting("fullscreen", not Store.get_setting("fullscreen", true))
					_apply_window()
				"Quit to seats":
					Store.flush()
					end_match()
					screen = Screen.JOIN
				"Volume": pass
			Sfx.play("select")
			return

## Graphics: Auto, Low, Medium, High, Ultra. Applies at once, so the change can be judged behind the menu.
func _graphics(step: int) -> void:
	var i := (GRAPHICS.find(Store.get_setting("graphics", "auto")) + step + GRAPHICS.size()) % GRAPHICS.size()
	Store.set_setting("graphics", GRAPHICS[i])
	if hall:
		hall.auto = i == 0
		hall.apply_tier(2 if i == 0 else i - 1)

func _resume() -> void:
	for s in Pads.seats:                                      # a controller that came back is in play again
		if s.device < 0 or Input.get_connected_joypads().has(s.device): s.lost = false
	paused = false
	get_tree().paused = false
	Sfx.play("back")

# ---- results -----------------------------------------------------------------------------------------------
func _results() -> void:
	for s in Pads.seats:
		if not s.joined or s.bot: continue
		if s.pressed("a"):
			start_match()
			return
		if s.pressed("b"):
			end_match()
			screen = Screen.JOIN
			return


## The screens over everything: seats, pause menu and results.
class Front extends Control:
	var main

	func _ready() -> void:
		set_anchors_preset(Control.PRESET_FULL_RECT)
		mouse_filter = Control.MOUSE_FILTER_IGNORE
		process_mode = Node.PROCESS_MODE_ALWAYS

	func _draw() -> void:
		match main.screen:
			0: _seats()
			1: if main.paused: _pause()
			2: _results()

	func _seats() -> void:
		draw_rect(Rect2(0, 0, 1920, 1080), Tune.BG)
		Gx.eyebrow(self, "Couch Co-op · two players", 120, 200)
		Gx.text(self, "Tenpin Grudge", 120, 300, { "size": Gx.FS.xl, "weight": 800 })
		Gx.text(self, "Ten-pin bowling, head to head, in 3D. One lane, ten frames, no mercy.", 120, 362, { "size": Gx.FS.sm, "color": Tune.MUTED })
		var sv := Store.data
		Gx.text(self, "Head to head: Blue %d, Amber %d, drawn %d · Best game %d" % [int(sv.wins[0]), int(sv.wins[1]), int(sv.draws), int(sv.best)], 120, 412, { "size": Gx.FS.xs, "color": Tune.FAINT })
		for i in 2:
			var s = Pads.seats[i]
			var x := 120.0 + i * 860
			var y := 480.0
			var col: Color = Tune.PCOL[i]
			Gx.panel(self, x, y, 820, 300, 18)
			if s.joined: Gx.rrect(self, x, y, 820, 300, 18, null, col, 3)
			Gx.marker(self, i, x + 52, y + 56, 18, { "hollow": not s.joined })
			Gx.eyebrow(self, "Player %d · %s" % [i + 1, Tune.NAMES[i]], x + 88, y + 64, { "color": col })
			if not s.joined:
				Gx.text(self, "Press A to join", x + 40, y + 150, { "size": Gx.FS.md, "weight": 700 })
				Gx.text(self, "Controller A, or Space (left keyboard) or Enter (right keyboard)", x + 40, y + 196, { "size": Gx.FS.xs, "color": Tune.MUTED })
				var other = Pads.seats[1 - i]
				if other.joined and not other.bot: Gx.hints(self, x + 40, y + 250, [["y", "Add the practice bot"]], other.type)
				continue
			var who: String = "Practice bot" if s.bot else { "kb1": "Left keyboard", "kb2": "Right keyboard" }.get(s.type, Input.get_joy_name(s.device))
			Gx.text(self, who, x + 40, y + 150, { "size": Gx.FS.md, "weight": 700 })
			var a := int(sv.assists[i])
			Gx.text(self, "Assist: " + main.ASSISTS[a], x + 40, y + 196, { "size": Gx.FS.xs, "color": Tune.TEXT if a else Tune.MUTED })
			if s.bot: Gx.text(self, "Remove it with Y from the other seat", x + 40, y + 256, { "size": Gx.FS.xs, "color": Tune.FAINT })
			else: Gx.hints(self, x + 40, y + 256, [["x", "Assist"], ["b", "Leave"]], s.type)
		var n: int = Pads.joined().size()
		var lead = Pads.seats[0] if Pads.seats[0].joined and not Pads.seats[0].bot else Pads.seats[1]
		var ty: String = lead.type if lead.joined else Pads.last_type
		Gx.text(self, "How to bowl", 120, 860, { "size": Gx.FS.sm, "weight": 700 })
		Gx.text(self, "Step with the left stick, aim with LB and RB, set a hook with LT and RT.  Pull the right stick down to swing, push it up to bowl.", 120, 902, { "size": Gx.FS.xs, "color": Tune.MUTED })
		Gx.text(self, "On a keyboard: hold the bowl key to swing, let go to bowl.  Y changes ball, X heckles while the other player bowls.", 120, 936, { "size": Gx.FS.xs, "color": Tune.MUTED })
		if n == 2: Gx.hints(self, 120, 1012, [["start", "Bowl"], ["back", "Quit"]], ty)
		else: Gx.hints(self, 120, 1012, [["back", "Quit"]], ty)

	func _pause() -> void:
		draw_rect(Rect2(0, 0, 1920, 1080), Color(0.02, 0.025, 0.035, 0.72))
		var x := 660.0
		Gx.panel(self, x - 40, 240, 680, 700, 18)
		Gx.marker(self, main.paused_by, x + 14, 290, 11)
		Gx.eyebrow(self, "Paused by player %d" % (main.paused_by + 1), x + 40, 298)
		for i in main.MENU.size():
			var item: String = main.MENU[i]
			var y: float = 360.0 + i * 64
			var on: bool = i == main.menu_i
			if on: Gx.rrect(self, x - 16, y - 40, 632, 56, 12, Color(1, 1, 1, 0.07), Tune.PCOL[main.paused_by], 2)
			Gx.text(self, item, x + 8, y, { "size": Gx.FS.sm, "weight": 700 if on else 500, "color": Tune.TEXT if on else Tune.MUTED })
			var val := ""
			match item:
				"Volume": val = "%d / 10" % int(Store.get_setting("volume", 7))
				"Graphics": val = main.hall.tier_label() if main.hall else String(Store.get_setting("graphics", "auto")).capitalize()
				"Rumble": val = "On" if Store.get_setting("rumble", true) else "Off"
				"Reduced motion": val = "On" if Store.reduced() else "Off"
				"Fullscreen": val = "On" if Store.get_setting("fullscreen", true) else "Off"
			if val != "": Gx.text(self, val, x + 600, y, { "size": Gx.FS.sm, "mono": true, "align": "right", "color": Tune.TEXT if on else Tune.MUTED })
		var s = Pads.seats[main.paused_by]
		Gx.hints(self, x, 900, [["a", "Choose"], ["lb", ""], ["rb", "Change"], ["start", "Resume"]], s.type)

	func _results() -> void:
		draw_rect(Rect2(0, 0, 1920, 1080), Color(0.02, 0.025, 0.035, 0.86))
		var r: Dictionary = main.result
		var w: int = r.get("won", -1)
		Gx.eyebrow(self, "Result", 120, 200)
		Gx.text(self, r.get("title", ""), 120, 310, { "size": Gx.FS.xl, "weight": 800, "color": Tune.TEXT if w < 0 else Tune.PCOL[w] })
		Gx.text(self, r.get("note", ""), 120, 372, { "size": Gx.FS.sm, "color": Tune.MUTED })
		var sc: Array = r.get("scores", [0, 0])
		for i in 2:
			var x := 120.0 + i * 420
			Gx.panel(self, x, 420, 380, 180, 16)
			Gx.marker(self, i, x + 44, 470, 14)
			Gx.eyebrow(self, Tune.NAMES[i], x + 74, 478, { "color": Tune.PCOL[i] })
			Gx.text(self, str(sc[i]), x + 40, 570, { "size": Gx.FS.xl, "weight": 700, "mono": true })
		var y := 680.0
		Gx.text(self, "Blue and Amber", 980, y - 46, { "size": Gx.FS.xs, "color": Tune.FAINT })
		for st in r.get("stats", []):
			Gx.text(self, st[0], 120, y, { "size": Gx.FS.sm, "color": Tune.MUTED })
			Gx.text(self, st[1], 980, y, { "size": Gx.FS.sm, "weight": 700, "mono": true })
			y += 48
		var s = Pads.seats[0] if not Pads.seats[0].bot else Pads.seats[1]
		Gx.hints(self, 120, 1012, [["a", "Rematch"], ["b", "Back to seats"]], s.type)
