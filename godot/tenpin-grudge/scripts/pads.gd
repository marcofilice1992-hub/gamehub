extends Node
## Two seats. A seat is held by a controller, one of two keyboard layouts, or the practice bot.
## Games ask a seat, never a device: seat.pressed("a"), seat.down("lb"), seat.held("rb"), seat.move, seat.aim, seat.value("lt").

const KB1 := -1
const KB2 := -2
const BOT := -10
const BUTTONS := ["a", "b", "x", "y", "lb", "rb", "lt", "rt", "start", "back"]
const JOY := { "a": JOY_BUTTON_A, "b": JOY_BUTTON_B, "x": JOY_BUTTON_X, "y": JOY_BUTTON_Y, "lb": JOY_BUTTON_LEFT_SHOULDER, "rb": JOY_BUTTON_RIGHT_SHOULDER, "start": JOY_BUTTON_START, "back": JOY_BUTTON_BACK }
const KEYS := {
	KB1: { "a": KEY_SPACE, "b": KEY_Q, "x": KEY_E, "y": KEY_R, "lb": KEY_1, "rb": KEY_2, "lt": KEY_SHIFT, "rt": KEY_F, "start": KEY_ESCAPE, "back": KEY_TAB, "up": KEY_W, "down": KEY_S, "left": KEY_A, "right": KEY_D },
	KB2: { "a": KEY_ENTER, "b": KEY_BACKSPACE, "x": KEY_SEMICOLON, "y": KEY_SLASH, "lb": KEY_BRACKETLEFT, "rb": KEY_BRACKETRIGHT, "lt": KEY_COMMA, "rt": KEY_PERIOD, "start": KEY_P, "back": KEY_BACKSLASH, "up": KEY_UP, "down": KEY_DOWN, "left": KEY_LEFT, "right": KEY_RIGHT },
}
const NAMES := {
	"xbox": { "a": "A", "b": "B", "x": "X", "y": "Y", "lb": "LB", "rb": "RB", "lt": "LT", "rt": "RT", "start": "Menu", "back": "View", "move": "L stick", "aim": "R stick" },
	"ps": { "a": "Cross", "b": "Circle", "x": "Square", "y": "Triangle", "lb": "L1", "rb": "R1", "lt": "L2", "rt": "R2", "start": "Options", "back": "Share", "move": "L stick", "aim": "R stick" },
	"nin": { "a": "B", "b": "A", "x": "Y", "y": "X", "lb": "L", "rb": "R", "lt": "ZL", "rt": "ZR", "start": "+", "back": "-", "move": "L stick", "aim": "R stick" },
	"kb1": { "a": "Space", "b": "Q", "x": "E", "y": "R", "lb": "1", "rb": "2", "lt": "Shift", "rt": "F", "start": "Esc", "back": "Tab", "move": "W A S D", "aim": "Space" },
	"kb2": { "a": "Enter", "b": "Backspace", "x": ";", "y": "/", "lb": "[", "rb": "]", "lt": ",", "rt": ".", "start": "P", "back": "\\", "move": "Arrows", "aim": "Enter" },
	"bot": { "a": "A", "b": "B", "x": "X", "y": "Y", "lb": "LB", "rb": "RB", "lt": "LT", "rt": "RT", "start": "Menu", "back": "View", "move": "L stick", "aim": "R stick" },
}

class Seat:
	var index := 0
	var device := -100           # -100 means empty
	var now := {}
	var prev := {}
	var held_t := {}
	var move := Vector2.ZERO
	var aim := Vector2.ZERO
	var lost := false
	var ctl := {}                # the practice bot writes here: { x, y, ax, ay, buttons: { name: value } }

	func _init(i: int) -> void:
		index = i
		clear()

	func clear() -> void:
		for b in BUTTONS:
			now[b] = 0.0
			prev[b] = 0.0
			held_t[b] = 0.0
		move = Vector2.ZERO
		aim = Vector2.ZERO

	var joined: bool:
		get: return device != -100
	var bot: bool:
		get: return device == BOT
	var keyboard: bool:
		get: return device == KB1 or device == KB2

	## The family of button pictures to show: xbox, ps, nin, kb1, kb2 or bot.
	var type: String:
		get:
			if device == KB1: return "kb1"
			if device == KB2: return "kb2"
			if device == BOT: return "bot"
			if device < 0: return "xbox"
			var n := Input.get_joy_name(device).to_lower()
			if n.contains("dualsense") or n.contains("dualshock") or n.contains("ps4") or n.contains("ps5") or n.contains("sony") or n.contains("playstation"): return "ps"
			if n.contains("nintendo") or n.contains("pro controller") or n.contains("switch"): return "nin"
			return "xbox"

	func name_of(b: String) -> String:
		return NAMES[type].get(b, b)

	func pressed(b: String) -> bool: return now[b] > 0.5 and prev[b] <= 0.5
	func released(b: String) -> bool: return now[b] <= 0.5 and prev[b] > 0.5
	func down(b: String) -> bool: return now[b] > 0.5
	func held(b: String) -> float: return held_t[b]
	func value(b: String) -> float: return now[b]

	func rumble(strength: float, ms: float, weak := -1.0) -> void:
		if device < 0 or not Store.get_setting("rumble", true): return
		Input.start_joy_vibration(device, clampf(weak if weak >= 0 else strength, 0, 1), clampf(strength, 0, 1), ms / 1000.0)

	func poll(dt: float) -> void:
		for b in BUTTONS: prev[b] = now[b]
		if device == -100 or lost:
			clear()
			return
		if device == BOT:
			move = Vector2(ctl.get("x", 0.0), ctl.get("y", 0.0)).limit_length(1.0)
			aim = Vector2(ctl.get("ax", 0.0), ctl.get("ay", 0.0))
			var bs: Dictionary = ctl.get("buttons", {})
			for b in BUTTONS: now[b] = float(bs.get(b, 0.0))
		elif device < 0:
			var k: Dictionary = KEYS[device]
			for b in BUTTONS: now[b] = 1.0 if Input.is_physical_key_pressed(k[b]) else 0.0
			move = Vector2((1.0 if Input.is_physical_key_pressed(k.right) else 0.0) - (1.0 if Input.is_physical_key_pressed(k.left) else 0.0),
				(1.0 if Input.is_physical_key_pressed(k.down) else 0.0) - (1.0 if Input.is_physical_key_pressed(k.up) else 0.0)).limit_length(1.0)
			aim = Vector2.ZERO
		else:
			for b in JOY: now[b] = 1.0 if Input.is_joy_button_pressed(device, JOY[b]) else 0.0
			now.lt = Input.get_joy_axis(device, JOY_AXIS_TRIGGER_LEFT)
			now.rt = Input.get_joy_axis(device, JOY_AXIS_TRIGGER_RIGHT)
			move = _dead(Vector2(Input.get_joy_axis(device, JOY_AXIS_LEFT_X), Input.get_joy_axis(device, JOY_AXIS_LEFT_Y)))
			if move == Vector2.ZERO:                               # the D-pad stands in for the stick
				move = Vector2((1.0 if Input.is_joy_button_pressed(device, JOY_BUTTON_DPAD_RIGHT) else 0.0) - (1.0 if Input.is_joy_button_pressed(device, JOY_BUTTON_DPAD_LEFT) else 0.0),
					(1.0 if Input.is_joy_button_pressed(device, JOY_BUTTON_DPAD_DOWN) else 0.0) - (1.0 if Input.is_joy_button_pressed(device, JOY_BUTTON_DPAD_UP) else 0.0)).limit_length(1.0)
			aim = _dead(Vector2(Input.get_joy_axis(device, JOY_AXIS_RIGHT_X), Input.get_joy_axis(device, JOY_AXIS_RIGHT_Y)))
		for b in BUTTONS: held_t[b] = held_t[b] + dt if now[b] > 0.5 else 0.0

	static func _dead(v: Vector2) -> Vector2:
		var m := v.length()
		if m < 0.18: return Vector2.ZERO
		return v / m * minf(1.0, (m - 0.18) / 0.75)

var seats: Array = [Seat.new(0), Seat.new(1)]
var last_type := "xbox"

func _ready() -> void:
	process_priority = -100                                      # read the inputs before anything uses them
	Input.joy_connection_changed.connect(_on_joy)

func _on_joy(device: int, connected: bool) -> void:
	for s in seats:
		if s.device == device: s.lost = not connected

func _process(dt: float) -> void:
	for s in seats: s.poll(dt)

func joined() -> Array:
	return seats.filter(func(s): return s.joined)

## Devices that pressed A this frame and do not hold a seat.
func joiners() -> Array:
	var out := []
	var taken := seats.map(func(s): return s.device)
	for d in Input.get_connected_joypads():
		if not taken.has(d) and Input.is_joy_button_pressed(d, JOY_BUTTON_A) and not _held_a.get(d, false): out.append(d)
	for kb in [KB1, KB2]:
		if not taken.has(kb) and Input.is_physical_key_pressed(KEYS[kb].a) and not _held_a.get(kb, false): out.append(kb)
	_track_a()
	return out

var _held_a := {}
func _track_a() -> void:
	for d in Input.get_connected_joypads(): _held_a[d] = Input.is_joy_button_pressed(d, JOY_BUTTON_A)
	for kb in [KB1, KB2]: _held_a[kb] = Input.is_physical_key_pressed(KEYS[kb].a)

func assign(device: int, seat: Seat) -> void:
	seat.device = device
	seat.lost = false
	seat.clear()
	seat.ctl = {}
	if device >= 0: last_type = seat.type
	elif device != BOT: last_type = seat.type

func free_seat(seat: Seat) -> void:
	seat.device = -100
	seat.clear()
