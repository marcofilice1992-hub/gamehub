class_name Tune
## Everything that sets how Tenpin Grudge feels, in one place, plus the lane's measurements.
## Distances are metres. x runs across the lane (right is +); d runs down it from the foul line. World z is -d.

# ---- The lane ------------------------------------------------------------------------------------------
const LW := 0.527            # half the lane's width
const GW := 0.235            # gutter width
const HEAD := 18.29          # foul line to the head pin
const DECK := 19.19          # end of the pin deck
const PIT := 20.39           # back of the pit
const SP := 0.3048           # pin spacing
const ROW := 0.26396         # distance between rows of pins
const BR := 0.109            # ball radius
const COG := 0.147           # a pin's centre of gravity above its base
const START := 0.3           # where the ball is released, beyond the foul line
const PM := 1.5              # pin mass, kg

# ---- Feel ------------------------------------------------------------------------------------------------
const HOOK := 1.6            # m/s² of sideways pull at full hook on dry boards
const OIL_GRIP := 0.15       # how much of the hook still acts on the oil
const DECEL_OIL := 0.15      # m/s² the ball loses on the oil, where it skids
const DECEL_DRY := 0.55      # and on the dry boards, where it grips and rolls
const AIM_MAX := 4.0         # degrees either side of straight
const AIM_TAP := 0.1         # degrees per bumper tap
const AIM_SWEEP := 1.6       # degrees per second while a bumper is held
const STEP_SPEED := 0.45     # m/s across the approach
const POWER_TIME := 0.8      # seconds of backswing to reach full power
const TIRE_AFTER := 1.2      # seconds at the top before power starts to drain
const TIRE_RATE := 0.2       # power lost per second after that
const DRIFT := 1.5           # degrees off the aim line at full sideways push on release
const HOOK_STEPS := [-1.0, -0.6, -0.3, 0.0, 0.3, 0.6, 1.0]
const HOOK_NAMES := ["Strong left", "Medium left", "Light left", "None", "Light right", "Medium right", "Strong right"]
# Pins and ball. Calibrated with tests/sweep.tscn against the USBC's free-fall pinsetter results (Sept 2021 report):
# strikes peak above 90% at 6.5-8 cm right of the head pin, and averaged over the pocket they come out at 35, 46, 56
# and 58% for 0, 2, 4 and 6 degrees of entry angle (USBC: 36, 41, 53, 59). Light hits leave the 10 pin, high hits the 4 and 7.
const PIN_FRICTION := 0.1   # pin on pin: lacquered, slippery
const PIN_BOUNCE := 0.2     # pin on pin
const BALL_FRICTION := 0.25 # ball on pin: the ball's cover grips the pins it meets
const BALL_BOUNCE := 0.5    # ball on pin
const PIN_SPIN_DAMP := 0.8  # how quickly a tumbling pin slows
const PIN_AIR_DAMP := 0.05  # how quickly a moving pin slows (nearly free in flight)
const DECK_FRICTION := 0.2  # pins sliding on the deck
const DECK_BOUNCE := 0.3
const DRIVE := 0.4          # how much of the hook keeps acting while the ball is in the pins: a hook ball holds its line
const KICKBACK_BOUNCE := 0.3 # the side walls by the deck
const BALL_Y_LOCK := true   # keep the ball on the deck through the pins (it cannot ride up over them)
const BOT_STAND_NOISE := 0.04 # metres: how far off its chosen spot the practice bot stands (one standard deviation)
const BOT_DRIFT_NOISE := 0.4  # how crooked its release is, as a fraction of a full sideways push
const RACK_JITTER := 0.004   # metres each pin may sit off its spot, as a real pinsetter's do: the same shot does not always carry
const SETTLE_QUIET := 0.35   # seconds every standing pin must be still before the count
const SETTLE_MAX := 3.2      # seconds after first contact before the count is taken regardless
const SHOW_NORMAL := 1.25    # seconds a result stays up
const SHOW_BIG := 1.9        # for strikes and spares
const REACT_TIME := 1.1    # extra seconds after a strike, spare, split or gutter for the bowler's reaction
const REPLAY_SPEED := 0.5    # strike replay playback rate
const REPLAY_LENGTH := 1.5   # seconds of real action shown
const TURN_LOCK := 0.35      # seconds at the start of a turn when the swing cannot start

# Three balls: a light one swings faster and hooks more; a heavy one is slower, hooks less and carries pins better.
const BALLS := [
	{ "name": "Light", "kg": 5.4, "lo": 7.0, "hi": 10.0, "hook": 1.3 },
	{ "name": "Medium", "kg": 6.35, "lo": 6.5, "hi": 9.5, "hook": 1.0 },
	{ "name": "Heavy", "kg": 7.25, "lo": 6.0, "hi": 8.8, "hook": 0.78 },
]
# Each match draws an oil pattern: the ball skids on the oil and hooks once it reaches the dry boards.
const OILS := [
	{ "name": "Short", "len": 10.0, "note": "the hook bites early" },
	{ "name": "House", "len": 12.0, "note": "the hook bites on the last third" },
	{ "name": "Long", "len": 14.0, "note": "the hook bites late" },
]
const NAMES := ["Blue", "Amber"]
const HECKLES := ["Gutter ball!", "No pressure", "Choke!", "Wobbly arm", "Split incoming", "Easy does it", "Don't miss", "Is that it?"]

# Colours, matching the browser version's tokens. Player 1 is blue with a circle, player 2 amber with a diamond.
const BG := Color("#0B0E13")
const TEXT := Color("#E4E7ED")
const MUTED := Color("#A0A8B6")
const FAINT := Color("#8A93A3")
const GOOD := Color("#2EBD85")
const BAD := Color("#F0616D")
const PCOL := [Color("#6EA2FF"), Color("#F2A93B")]
const MAG := Color("#FF4FD8")
const VIO := Color("#8B6CFF")

static func spots() -> Array:
	var out := []
	for r in 4:
		for i in r + 1:
			out.append(Vector2((i - r / 2.0) * SP, HEAD + r * ROW))   # x, d
	return out

static func grip(d: float, oil: float) -> float:
	if d < oil: return OIL_GRIP
	if d < oil + 1.0: return OIL_GRIP + (1.0 - OIL_GRIP) * (d - oil)
	return 1.0

static func decel(g: float) -> float:
	return DECEL_OIL + (DECEL_DRY - DECEL_OIL) * (g - OIL_GRIP) / (1.0 - OIL_GRIP)

static func speed_of(pw: float, ball: Dictionary) -> float:
	return ball.lo + ((pw - 0.55) / 0.45) * (ball.hi - ball.lo)

## Where a ball will go, ignoring pins, using the same hook and friction as the physics. Returns points (x, d).
static func trace(x: float, d: float, vx: float, vd: float, spin: float, open: bool, hook: float, oil: float) -> PackedVector2Array:
	var pts := PackedVector2Array([Vector2(x, d)])
	var dt := 1.0 / 60.0
	var n := 0
	while n < 2000 and d < HEAD - BR and (open or absf(x) <= LW):
		var g := grip(d, oil)
		var sp := sqrt(vx * vx + vd * vd)
		var dv := decel(g) * dt
		if sp > dv:
			vx -= vx / sp * dv
			vd -= vd / sp * dv
		vx += spin * g * hook * dt
		x += vx * dt
		d += vd * dt
		n += 1
		if n % 3 == 2: pts.append(Vector2(x, d))
	pts.append(Vector2(x, d))
	return pts

## What a first ball did, in words: where it met the head pin and what to change. Never a judgement on the player.
static func shot_read(hit: bool, hx: float, gutter: bool, fell: int) -> String:
	if gutter and not hit: return "Into the gutter. Stand nearer the middle or aim straighter."
	if not hit: return "Missed the pins."
	var cm := int(round(absf(hx) * 100.0))
	var where := "Dead centre on the head pin" if cm < 1 else "%d cm %s of the head pin" % [cm, "right" if hx > 0 else "left"]
	if fell == 10 and (cm < 3 or cm > 9): return where + (": high, but it carried." if cm < 3 else ": light, but it carried.")
	if cm < 3: return where + ": too full, splits are likely. Aim for a pocket beside it."
	if cm <= 9: return where + (": in the pocket." if fell == 10 else ": in the pocket. A little hook carries the corner pins.")
	if cm <= 14: return where + ": light. Come in a touch closer to the head pin."
	return where + ": wide. Aim nearer the head pin."
