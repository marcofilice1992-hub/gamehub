class_name Lane
extends Node3D
## The physics of lane 14, in Jolt. Static bodies for the lane, gutters, kickbacks and pit; rigid bodies for ten pins and the ball.
## Hook and lane friction are applied to the ball every physics tick (240 a second), so a shot plays out the same at any frame rate.

const L_STATIC := 1
const L_PIN := 2
const L_BALL := 4

var rng := RandomNumberGenerator.new()
var oil := 12.0
var spin := 0.0
var hook_k := Tune.HOOK
var pins: Array = []            # index 0..9 -> RigidBody3D, or null once removed
var up: Array = []              # the pins still standing, by index
var ball: RigidBody3D = null
var ball_kg := 6.35
var live := false
var hit := false
var hit_t := 0.0
var hit_x := 0.0
var gutter := false
var bumpers := false
var t := 0.0
var gone_t := 0.0
var slow := 0.0
var quiet := 0.0
var armed := false              # a ball has been bowled at this rack and not yet counted
var result := -1                # the pin count, taken at a fixed tick once the pins settle
var clacks: Array = []          # impact speeds since the last read, for sound and rumble
var record := false
var rec: Array = []             # 60 Hz snapshots of ball and pins, for the strike replay
var _tick := 0
var _spots := Tune.spots()
var _lane_mat := PhysicsMaterial.new()
var _pin_mat := PhysicsMaterial.new()
var _ball_mat := PhysicsMaterial.new()
var _belly: ConvexPolygonShape3D
var _head := SphereShape3D.new()
var _ball_shape := SphereShape3D.new()
var _vp: SubViewport                 # holds the bodies in a physics world of their own
var _statics: Array = []

func _ready() -> void:
	_lane_mat.friction = Tune.DECK_FRICTION; _lane_mat.bounce = 0.3
	_pin_mat.friction = Tune.PIN_FRICTION; _pin_mat.bounce = Tune.PIN_BOUNCE
	_ball_mat.friction = 0.0; _ball_mat.bounce = 0.3
	_head.radius = 0.033
	_ball_shape.radius = Tune.BR
	# One pin's body: a convex belly (narrow base, upright sides where the ball meets it, narrow neck) and a sphere for the head.
	var pts := PackedVector3Array()
	for ring in [[0.03, 0.0], [0.06, 0.088], [0.06, 0.142], [0.024, 0.27]]:
		for j in 8:
			var a := TAU * j / 8.0
			pts.append(Vector3(ring[0] * cos(a), ring[1] - Tune.COG, ring[0] * sin(a)))
	_belly = ConvexPolygonShape3D.new()
	_belly.points = pts
	_fresh_world()

## Jolt is deterministic for the same bodies created in the same order in a new world, but not across a world's history
## (freed body ids, broadphase layout). So every rack and every sweep gets a brand-new physics world: the same shot
## at the same rack always counts the same, however many balls came before it.
func _fresh_world() -> void:
	_statics.clear()
	if _vp:
		remove_child(_vp)
		_vp.queue_free()               # takes the old statics and world with it
	_vp = SubViewport.new()
	_vp.size = Vector2i(2, 2)
	_vp.render_target_update_mode = SubViewport.UPDATE_DISABLED
	_vp.world_3d = World3D.new()
	add_child(_vp)
	_build_static()

func _box(size: Vector3, pos: Vector3, mat: PhysicsMaterial) -> void:
	var b := StaticBody3D.new()
	b.collision_layer = L_STATIC
	b.collision_mask = 0
	b.physics_material_override = mat
	var c := CollisionShape3D.new()
	var s := BoxShape3D.new()
	s.size = size
	c.shape = s
	b.add_child(c)
	b.position = pos
	_vp.add_child(b)
	_statics.append(b)

func _build_static() -> void:
	var D := Tune.DECK
	var len := D + 1.5
	var far := Tune.LW + Tune.GW
	_box(Vector3(Tune.LW * 2, 0.5, len), Vector3(0, -0.25, -(D - 1.5) / 2), _lane_mat)                             # the boards, top at y = 0
	for s in [-1, 1]:
		_box(Vector3(Tune.GW, 0.2, len), Vector3(s * (Tune.LW + Tune.GW / 2), -0.148, -(D - 1.5) / 2), _lane_mat)   # gutter floor, 48 mm down
		_box(Vector3(0.1, 1.2, Tune.PIT + 1.5), Vector3(s * (far + 0.05), 0.4, -(Tune.PIT - 1.5) / 2), _lane_mat)   # outer wall and kickback
	_box(Vector3(far * 2, 0.2, Tune.PIT - D), Vector3(0, -0.45, -(D + Tune.PIT) / 2), _lane_mat)                     # pit floor
	_box(Vector3(far * 2, 1.4, 0.1), Vector3(0, 0.2, -(Tune.PIT + 0.05)), _lane_mat)                                 # pit cushion

func _pin(i: int, x: float, d: float) -> RigidBody3D:
	var b := RigidBody3D.new()
	b.mass = Tune.PM
	b.center_of_mass_mode = RigidBody3D.CENTER_OF_MASS_MODE_CUSTOM
	b.center_of_mass = Vector3.ZERO
	b.inertia = Vector3(0.02, 0.0016, 0.02)          # a real pin's, not its bounding box's
	b.physics_material_override = _pin_mat
	b.collision_layer = L_PIN
	b.collision_mask = L_STATIC | L_PIN | L_BALL
	b.linear_damp = 0.05
	b.angular_damp = get_meta("spin_damp", Tune.PIN_SPIN_DAMP)
	b.contact_monitor = true
	b.max_contacts_reported = 4
	var c1 := CollisionShape3D.new(); c1.shape = _belly; b.add_child(c1)
	var c2 := CollisionShape3D.new(); c2.shape = _head; c2.position = Vector3(0, 0.335 - Tune.COG, 0); b.add_child(c2)
	b.position = Vector3(x, Tune.COG + 0.0005, -d)
	b.set_meta("pin", i)
	_vp.add_child(b)
	b.sleeping = true
	b.body_entered.connect(_on_pin_contact.bind(b))
	return b

func _remove(b: Node) -> void:
	if b and is_instance_valid(b):
		b.get_parent().remove_child(b)   # out of the physics space now, not at the end of the frame
		b.queue_free()

## Stand these pins (all ten when which is empty) on their spots, each fresh, in index order, so the solver always sees the same rack.
func rack(which := []) -> void:
	drop()
	armed = false; result = -1
	for b in pins: _remove(b)
	_fresh_world()
	up = which.duplicate() if not which.is_empty() else range(10)
	pins = []
	for i in 10:
		if up.has(i):
			var s: Vector2 = _spots[i]
			pins.append(_pin(i, s.x + (rng.randf() - 0.5) * 2 * Tune.RACK_JITTER, s.y + (rng.randf() - 0.5) * 2 * Tune.RACK_JITTER))
		else:
			pins.append(null)

## The sweep between balls: fallen pins go, standing pins are set back up exactly where they stand.
func tidy() -> void:
	drop()
	armed = false; result = -1
	var keep := {}
	for i in up: keep[i] = pins[i].position
	for b in pins: _remove(b)
	_fresh_world()
	pins = []
	for i in 10:
		pins.append(_pin(i, keep[i].x, -keep[i].z) if keep.has(i) else null)

func bowl(x: float, ang_deg: float, v: float, with_bumpers: bool, ball_def: Dictionary) -> void:
	drop()
	var b := RigidBody3D.new()
	b.mass = ball_def.kg
	ball_kg = ball_def.kg
	b.physics_material_override = _ball_mat
	b.collision_layer = L_BALL
	b.collision_mask = L_STATIC | L_PIN
	b.axis_lock_linear_y = true      # a bowling ball ploughs through the pins; it does not climb them
	b.axis_lock_angular_x = true; b.axis_lock_angular_y = true; b.axis_lock_angular_z = true
	b.continuous_cd = true
	b.can_sleep = false
	b.linear_damp_mode = RigidBody3D.DAMP_MODE_REPLACE   # the project's default damping would slow the ball and bend the hook off its traced path
	b.linear_damp = 0.0
	b.contact_monitor = true
	b.max_contacts_reported = 8
	var c := CollisionShape3D.new(); c.shape = _ball_shape; b.add_child(c)
	var a := deg_to_rad(ang_deg)
	b.position = Vector3(x, Tune.BR, -Tune.START)
	b.linear_velocity = Vector3(v * sin(a), 0, -v * cos(a))
	_vp.add_child(b)
	b.body_entered.connect(_on_ball_contact)
	ball = b
	hook_k = Tune.HOOK * ball_def.hook
	bumpers = with_bumpers
	armed = true; live = true; hit = false; gutter = false; slow = 0.0; t = 0.0; gone_t = 0.0; hit_x = 0.0; quiet = 0.0; result = -1
	clacks.clear(); rec.clear(); _tick = 0

func drop() -> void:
	if ball:
		_remove(ball)
		ball = null
	if live:
		live = false
		gone_t = t

func _on_ball_contact(body: Node) -> void:
	if not body.has_meta("pin") or not ball: return
	if not hit:
		hit = true
		hit_t = t
		hit_x = ball.position.x
	clacks.append(ball.linear_velocity.length())

func _on_pin_contact(body: Node, me: RigidBody3D) -> void:
	if body.has_meta("pin") and body.get_meta("pin") > me.get_meta("pin"): clacks.append((me.linear_velocity - body.linear_velocity).length())

func is_down(b: RigidBody3D) -> bool:
	if b == null or not is_instance_valid(b): return true
	var p := b.position
	return b.global_basis.y.y < 0.94 or p.y < Tune.COG - 0.03 or absf(p.x) > Tune.LW + 0.02 or -p.z > Tune.DECK + 0.05

func read() -> int:
	var fell := up.filter(func(i): return is_down(pins[i]))
	up = up.filter(func(i): return not fell.has(i))
	return fell.size()

func done() -> bool:
	if not hit: return not live and t - gone_t > 0.4
	var since := t - hit_t
	return since > Tune.SETTLE_MAX or (since > 0.9 and not live and quiet > Tune.SETTLE_QUIET)

func settled() -> bool:
	return result >= 0

## Slow motion without changing the physics: at pace 0.4 the world takes a full 1/240 s step on 40% of ticks and holds still on the rest.
## (Engine.time_scale would shrink the step instead, and a smaller step gives a different result.)
var pace := 1.0
var _acc := 0.0

func _physics_process(dt: float) -> void:
	_acc += pace
	var go := _acc >= 1.0
	PhysicsServer3D.space_set_active(_vp.world_3d.space, go)
	if not go: return
	_acc -= 1.0
	t += dt
	_tick += 1
	if live and ball:
		var p := ball.position
		var v := ball.linear_velocity
		var d := -p.z
		if d > Tune.DECK + 0.03:
			ball.axis_lock_linear_y = false                     # off the end of the deck and into the pit
		if p.y < -0.25 or d > Tune.PIT - 0.25:
			drop()
		else:
			if bumpers and not gutter and d < Tune.DECK and absf(p.x) > Tune.LW - 0.012:
				var s := signf(p.x)
				ball.position.x = s * (Tune.LW - 0.012)
				if v.x * s > 0: v.x *= -0.7
			if not gutter and d < Tune.DECK and absf(p.x) > Tune.LW:
				gutter = true
				ball.collision_mask = L_STATIC
				ball.axis_lock_linear_y = false
			if gutter:
				if d < Tune.DECK: v.x = (signf(p.x) * (Tune.LW + Tune.GW / 2) - p.x) * 12.0
			elif d < Tune.HEAD:                                      # lane friction slows the ball, more on the dry boards; the hook pulls it sideways
				var g := Tune.grip(d, oil)
				var sp := Vector2(v.x, v.z).length()
				var dv := Tune.decel(g) * dt
				if sp > dv:
					v.x -= v.x / sp * dv
					v.z -= v.z / sp * dv
				v.x += spin * g * hook_k * dt
			ball.linear_velocity = v
			slow = slow + dt if v.length_squared() < 0.04 else 0.0
			if slow > 1.0: drop()
	# the count: only standing pins decide it; pins already down may roll about
	var still := true
	for i in up:
		var b: RigidBody3D = pins[i]
		if is_down(b): continue
		var upright := b.global_basis.y.y
		if b.linear_velocity.length_squared() > 0.0025 or b.angular_velocity.length_squared() > 0.04 or (upright < 0.9986 and upright > 0.94): still = false
	quiet = quiet + dt if still else 0.0
	if armed and result < 0 and done(): result = read()
	if record and _tick % 4 == 0: rec.append(_snapshot())

func _snapshot() -> PackedFloat32Array:
	var f := PackedFloat32Array()
	f.resize(89)
	for i in 11:
		var b: RigidBody3D = pins[i] if i < 10 else ball
		var ok: bool = b != null and is_instance_valid(b)
		if ok:
			var q := b.global_basis.get_rotation_quaternion()
			var p := b.position
			for k in 8: f[i * 8 + k] = [p.x, p.y, p.z, q.x, q.y, q.z, q.w, 1.0][k]
	f[88] = t
	return f
