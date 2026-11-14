class_name Bowler
extends Node3D
## A bowler: a jointed, toy-like figure built from rounded primitives, with a bowling shirt in their colour, hair, a face,
## and procedural animation. Faces -Z (down the lane). The match drives it through `act()`; nothing here touches physics.
##
## Joint conventions: for limbs that hang down, +X rotation swings the hand or foot forward (down the lane); for the
## spine and head, which point up, +X tilts them back, so a forward lean or a nod is negative. +Z swings a hanging limb
## towards +X (the figure's right).

const JOINTS := ["pelvis", "spine", "head", "sh_l", "el_l", "sh_r", "el_r", "hip_l", "kn_l", "an_l", "hip_r", "kn_r", "an_r"]
const SKINS := [Color("#F2D0B5"), Color("#D9A57E"), Color("#A86F4C"), Color("#6E4430"), Color("#F5C9A6"), Color("#8C5A3C")]

var look := {}
var j := {}                     # joint name -> Node3D
var pose := {}                  # current joint rotations in degrees (blended towards targets each frame)
var lift := 0.0                 # hips height offset
var hand_r: Node3D
var hand_l: Node3D
var mouth_smile: MeshInstance3D
var mouth_open: MeshInstance3D
var _t := 0.0
var _seed := 0.0

## look: { skin, shirt, panel, trousers, shoes, hair, hair_col, height }
func build(lk: Dictionary, cast_shadows := true) -> void:
	look = lk
	_seed = randf() * 10.0
	var hs: float = lk.get("height", 1.0)
	scale = Vector3(hs, hs, hs)
	var skin := _mat(lk.skin, 0.55)
	var shirt := ShaderMaterial.new()
	shirt.shader = load("res://shaders/shirt.gdshader")
	shirt.set_shader_parameter("base", Color(lk.shirt))
	shirt.set_shader_parameter("panel", Color(lk.panel))
	var trousers := _mat(lk.trousers, 0.7)
	var shoe := ShaderMaterial.new()
	shoe.shader = load("res://shaders/shoe.gdshader")
	shoe.set_shader_parameter("a", Color(lk.shoes))
	var hair := _mat(lk.hair_col, 0.6)
	var dark := _mat("#14121C", 0.3)

	var hips := _joint("pelvis", self, Vector3(0, 0.95, 0))
	_cap(hips, 0.145, 0.34, trousers, Vector3(0, 0.0, 0), Vector3(0, 0, PI / 2), Vector3(1, 1, 0.8))       # pelvis, lying across
	var spine := _joint("spine", hips, Vector3(0, 0.06, 0))
	_cap(spine, 0.165, 0.56, shirt, Vector3(0, 0.25, 0), Vector3.ZERO, Vector3(1, 1, 0.72))                # torso
	var neck := Node3D.new(); neck.position = Vector3(0, 0.5, 0); spine.add_child(neck)
	_cap(neck, 0.045, 0.12, skin, Vector3(0, 0.03, 0))
	var head := _joint("head", neck, Vector3(0, 0.07, 0))
	var hm := _sphere(head, 0.12, skin, Vector3(0, 0.1, 0))
	hm.scale = Vector3(0.95, 1.05, 1.0)
	for s in [-1, 1]:
		_sphere(head, 0.017, dark, Vector3(s * 0.042, 0.115, -0.108))                                       # eyes
		var brow := _box(head, Vector3(0.035, 0.008, 0.01), hair, Vector3(s * 0.043, 0.152, -0.111))
		brow.rotation.z = -s * 0.15
		_sphere(head, 0.022, skin, Vector3(s * 0.118, 0.1, 0)).scale = Vector3(0.6, 1, 1)                  # ears
	_sphere(head, 0.018, skin, Vector3(0, 0.085, -0.122))                                                    # nose
	mouth_smile = _box(head, Vector3(0.05, 0.008, 0.008), _mat("#7A2E2E", 0.6), Vector3(0, 0.045, -0.114))
	mouth_open = _sphere(head, 0.022, _mat("#4A1418", 0.6), Vector3(0, 0.045, -0.108))
	mouth_open.scale = Vector3(1, 0.8, 0.5)
	mouth_open.visible = false
	_hair(head, lk.get("hair", "quiff"), hair)
	for side in ["l", "r"]:
		var s := -1.0 if side == "l" else 1.0
		var sh := _joint("sh_" + side, spine, Vector3(s * 0.2, 0.44, 0))
		_sphere(sh, 0.06, shirt, Vector3.ZERO)                                                               # shoulder
		_cap(sh, 0.052, 0.28, shirt, Vector3(0, -0.11, 0))                                                   # short sleeve
		_cap(sh, 0.042, 0.3, skin, Vector3(0, -0.16, 0))                                                     # upper arm
		var el := _joint("el_" + side, sh, Vector3(0, -0.3, 0))
		_cap(el, 0.038, 0.28, skin, Vector3(0, -0.13, 0))                                                    # forearm
		var hand := Node3D.new(); hand.position = Vector3(0, -0.29, 0); el.add_child(hand)
		_sphere(hand, 0.048, skin, Vector3(0, -0.01, 0)).scale = Vector3(0.9, 1.15, 0.75)
		if side == "r": hand_r = hand
		else: hand_l = hand
		var hip := _joint("hip_" + side, hips, Vector3(s * 0.09, -0.04, 0))
		_cap(hip, 0.072, 0.48, trousers, Vector3(0, -0.21, 0))                                               # thigh
		var kn := _joint("kn_" + side, hip, Vector3(0, -0.44, 0))
		_cap(kn, 0.06, 0.46, trousers, Vector3(0, -0.21, 0))                                                 # shin
		var an := _joint("an_" + side, kn, Vector3(0, -0.44, 0))
		_cap(an, 0.055, 0.26, shoe, Vector3(0, -0.03, -0.06), Vector3(PI / 2, 0, 0), Vector3(1, 1, 0.75))    # shoe
	for n in JOINTS: pose[n] = Vector3.ZERO
	for m in find_children("*", "MeshInstance3D", true, false):
		m.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON if cast_shadows else GeometryInstance3D.SHADOW_CASTING_SETTING_OFF

func _mat(col, rough: float) -> StandardMaterial3D:
	var m := StandardMaterial3D.new()
	m.albedo_color = Color(col)
	m.roughness = rough
	return m

func _joint(name: String, parent: Node3D, pos: Vector3) -> Node3D:
	var n := Node3D.new()
	n.position = pos
	n.rotation_order = EULER_ORDER_ZXY
	parent.add_child(n)
	j[name] = n
	return n

static var _meshes := {}
func _cached(key: String, make: Callable) -> Mesh:
	if not _meshes.has(key): _meshes[key] = make.call()
	return _meshes[key]

func _cap(parent: Node3D, r: float, h: float, mat: Material, pos: Vector3, rot := Vector3.ZERO, scl := Vector3.ONE) -> MeshInstance3D:
	var mesh := _cached("cap%.3f_%.3f" % [r, h], func():
		var c := CapsuleMesh.new()
		c.radius = r; c.height = maxf(h, r * 2.0); c.radial_segments = 12; c.rings = 4
		return c)
	return _mi(parent, mesh, mat, pos, rot, scl)

func _sphere(parent: Node3D, r: float, mat: Material, pos: Vector3) -> MeshInstance3D:
	var mesh := _cached("sph%.3f" % r, func():
		var c := SphereMesh.new()
		c.radius = r; c.height = r * 2; c.radial_segments = 16; c.rings = 8
		return c)
	return _mi(parent, mesh, mat, pos)

func _box(parent: Node3D, size: Vector3, mat: Material, pos: Vector3) -> MeshInstance3D:
	var mesh := _cached("box%s" % size, func():
		var b := BoxMesh.new()
		b.size = size
		return b)
	return _mi(parent, mesh, mat, pos)

func _mi(parent: Node3D, mesh: Mesh, mat: Material, pos: Vector3, rot := Vector3.ZERO, scl := Vector3.ONE) -> MeshInstance3D:
	var m := MeshInstance3D.new()
	m.mesh = mesh
	m.material_override = mat
	m.position = pos
	m.rotation = rot
	m.scale = scl
	parent.add_child(m)
	return m

func _hair(head: Node3D, style: String, mat: Material) -> void:
	var cap := SphereMesh.new()
	cap.radius = 0.128; cap.height = 0.128; cap.is_hemisphere = true; cap.radial_segments = 16; cap.rings = 6
	match style:
		"quiff":
			_mi(head, cap, mat, Vector3(0, 0.125, 0.008)).scale = Vector3(1.0, 0.9, 1.04)
			_cap(head, 0.05, 0.16, mat, Vector3(0, 0.215, -0.07), Vector3(PI / 2.6, 0, PI / 2))
		"ponytail":
			_mi(head, cap, mat, Vector3(0, 0.12, 0.01)).scale = Vector3(1.04, 1.0, 1.06)
			_sphere(head, 0.05, mat, Vector3(0, 0.17, 0.12))
			_cap(head, 0.04, 0.22, mat, Vector3(0, 0.06, 0.15), Vector3(-0.25, 0, 0))
		"bob":
			_mi(head, cap, mat, Vector3(0, 0.115, 0.01)).scale = Vector3(1.1, 1.05, 1.1)
			for s in [-1, 1]: _cap(head, 0.05, 0.16, mat, Vector3(s * 0.1, 0.07, 0.02))
			_cap(head, 0.06, 0.2, mat, Vector3(0, 0.07, 0.07), Vector3(0, 0, PI / 2))
		"afro":
			_sphere(head, 0.165, mat, Vector3(0, 0.17, 0.03))
		"beanie":
			_mi(head, cap, mat, Vector3(0, 0.13, 0.0)).scale = Vector3(1.06, 1.25, 1.06)
			_cap(head, 0.022, 0.25, _mat("#F4F2EC", 0.6), Vector3(0, 0.135, 0), Vector3(0, 0, PI / 2)).scale = Vector3(1, 1.05, 5.6)
			_sphere(head, 0.035, mat, Vector3(0, 0.29, 0))
		"buzz":
			_mi(head, cap, mat, Vector3(0, 0.122, 0.004)).scale = Vector3(1.0, 0.82, 1.02)
		"bun":
			_mi(head, cap, mat, Vector3(0, 0.12, 0.01)).scale = Vector3(1.03, 0.95, 1.05)
			_sphere(head, 0.06, mat, Vector3(0, 0.25, 0.04))

## Where the ball sits when it is in the right hand: just past the palm, along the forearm.
func ball_in_hand() -> Vector3:
	var b := hand_r.global_basis
	return hand_r.global_position - b.y.normalized() * 0.075 + b.z.normalized() * 0.0

## Where the ball sits when it is held at the chest in both hands.
func ball_at_chest() -> Vector3:
	return (hand_r.global_position + hand_l.global_position) * 0.5 + global_basis.z * -0.06

# ---- poses ---------------------------------------------------------------------------------------------------
func _blank() -> Dictionary:
	var p := {}
	for n in JOINTS: p[n] = Vector3.ZERO
	p["el_l"] = Vector3(8, 0, 0); p["el_r"] = Vector3(8, 0, 0)
	p["sh_l"] = Vector3(0, 0, -6); p["sh_r"] = Vector3(0, 0, 6)
	return p

func _feet_flat(p: Dictionary) -> void:
	for s in ["l", "r"]:
		p["an_" + s] = Vector3(-(p["hip_" + s].x + p["kn_" + s].x) - p.pelvis.x, 0, 0)

## Idle: breathing and a slow weight shift.
func p_idle(t: float) -> Dictionary:
	var p := _blank()
	var b := sin(t * 1.7 + _seed)
	p.spine = Vector3(-2 + b * 1.2, sin(t * 0.4 + _seed) * 4, 0)
	p.head = Vector3(3 + b, sin(t * 0.33 + _seed) * 10, 0)
	p.hip_l = Vector3(2, 0, -3); p.hip_r = Vector3(-2, 0, 3)
	p.sh_l.x = b * 2; p.sh_r.x = -b * 2
	_feet_flat(p)
	return p

## Holding the ball at the chest, ready.
func p_hold(t: float) -> Dictionary:
	var p := p_idle(t)
	p.sh_r = Vector3(28, 0, -14); p.el_r = Vector3(98, 0, 0)
	p.sh_l = Vector3(30, 0, 18); p.el_l = Vector3(100, 0, 0)
	p.spine.x = -6
	p.head = Vector3(10, 0, 0)
	p.kn_l = Vector3(-8, 0, 0); p.kn_r = Vector3(-8, 0, 0); p.hip_l.x = 6; p.hip_r.x = 6
	_feet_flat(p)
	return p

## The approach, driven by the swing: three steps to the foul line while the arm swings back to a height that shows
## the power (k = 0..1 through the approach; pw = 0..1 of the power range).
func p_approach(k: float, pw: float, tired: float, turn := 0.0) -> Dictionary:
	var p := _blank()
	var e := k * k * (3 - 2 * k)
	var steps := k * 3.0
	var ph := fmod(steps, 1.0)
	var lead := int(steps) % 2                                # which leg is stepping
	var swing := sin(ph * PI)
	var a := 30.0 * cos(ph * PI)                               # stepping leg swings from back to front
	var hl := -a if lead == 0 else a
	p.hip_l = Vector3(hl * (1 - e * 0.4), 0, -2); p.hip_r = Vector3(-hl * (1 - e * 0.4), 0, 2)
	p.kn_l = Vector3(-(28 * swing if lead == 0 else 6), 0, 0)
	p.kn_r = Vector3(-(28 * swing if lead == 1 else 6), 0, 0)
	# the slide: left leg forward and bent, right leg trailing behind
	var sl := smoothstep(0.7, 1.0, k)
	p.hip_l = p.hip_l.lerp(Vector3(48, 0, -4), sl); p.kn_l = p.kn_l.lerp(Vector3(-72, 0, 0), sl)
	p.hip_r = p.hip_r.lerp(Vector3(-38, 12, 10), sl); p.kn_r = p.kn_r.lerp(Vector3(-28, 0, 0), sl)
	p.spine = Vector3(-8 - 22 * e, 0, 0)
	p.head = Vector3(14 + 14 * e, 0, 0)
	# arm: push away, drop, then back to the top of the backswing
	var top := -(55.0 + 55.0 * pw) + tired * 25.0
	var arm := 0.0
	if k < 0.25: arm = lerpf(35.0, 45.0, k / 0.25)
	elif k < 0.5: arm = lerpf(45.0, 0.0, (k - 0.25) / 0.25)
	else: arm = lerpf(0.0, top, smoothstep(0.5, 0.9, k))
	p.sh_r = Vector3(arm, 0, 4)
	p.el_r = Vector3(lerpf(70.0, 4.0, smoothstep(0.0, 0.4, k)), turn * 70.0, 0)             # the wrist turned for spin
	p.sh_l = Vector3(lerpf(30.0, 18.0, e), 0, lerpf(18.0, -62.0, e))                   # the balance arm opens out
	p.el_l = Vector3(lerpf(100.0, 20.0, e), 0, 0)
	_feet_flat(p)
	p.an_r = Vector3(-20 * sl + p.an_r.x * (1 - sl), 0, 0)
	return p

## The release and follow-through, r seconds after letting go.
func p_release(r: float, spin := 0.0) -> Dictionary:
	var p := p_approach(1.0, 0.6, 0.0)
	var f := smoothstep(0.0, 0.45, r)
	p.sh_r = Vector3(lerpf(15.0, 150.0, f), 0, lerpf(2.0, -12.0, f))
	p.el_r = Vector3(lerpf(4.0, 35.0, f), spin * 75.0 * (1.0 - 0.5 * f), 0)            # the hand comes up the side of the ball: a handshake for hook
	p.head = Vector3(26 - 8 * f, 0, 0)
	var up := smoothstep(1.2, 1.9, r)                                         # then stand up to watch it roll
	if up > 0:
		var w := p_watch(r)
		for n in JOINTS: p[n] = p[n].lerp(w[n], up)
	return p

func p_watch(t: float) -> Dictionary:
	var p := p_idle(t)
	p.spine.x = -10
	p.head = Vector3(8, 0, 0)
	p.hip_l.x = 14; p.kn_l.x = -18
	p.sh_r = Vector3(12, 0, 8); p.el_r = Vector3(30, 0, 0)
	p.sh_l = Vector3(8, 0, -14); p.el_l = Vector3(25, 0, 0)
	_feet_flat(p)
	return p

## Big win: arms thrown up in a V, pumping, with a hop. A spare gets one fist pump.
func p_cheer(t: float, big: bool) -> Dictionary:
	var p := p_idle(t)
	var pump := 0.5 + 0.5 * sin(t * 11.0)
	# (with the arm raised, +Z leans it inward, so a V takes the opposite sign to a hanging arm)
	p.sh_r = Vector3(160 + 10 * pump, 0, -32); p.el_r = Vector3(10 + 25 * (1 - pump), 0, 0)
	if big:
		p.sh_l = Vector3(160 + 10 * pump, 0, 32); p.el_l = Vector3(10 + 25 * (1 - pump), 0, 0)
	else:
		p.sh_r = Vector3(60 + 50 * pump, 0, 10); p.el_r = Vector3(110 - 40 * pump, 0, 0)
		p.sh_l = Vector3(10, 0, -20); p.el_l = Vector3(30, 0, 0)
	p.spine.x = 8
	p.head.x = -14
	p.kn_l.x = -12 * pump; p.kn_r.x = -12 * pump; p.hip_l.x = 6 * pump; p.hip_r.x = 6 * pump
	_feet_flat(p)
	return p

## Disaster: hands on head, bent over.
func p_slump(t: float) -> Dictionary:
	var p := p_idle(t)
	p.spine.x = -30 - 4 * sin(t * 2.0)
	p.head.x = -20
	for s in ["l", "r"]:
		var d := -1.0 if s == "l" else 1.0
		p["sh_" + s] = Vector3(150, 0, d * 30); p["el_" + s] = Vector3(135, 0, 0)
	p.kn_l.x = -15; p.kn_r.x = -15; p.hip_l.x = 15; p.hip_r.x = 15
	_feet_flat(p)
	return p

## Arms folded, a slow head shake: the other player has just struck.
func p_sulk(t: float) -> Dictionary:
	var p := p_idle(t)
	p.sh_r = Vector3(38, 0, -42); p.el_r = Vector3(122, 0, 0)
	p.sh_l = Vector3(32, 0, 44); p.el_l = Vector3(124, 0, 0)
	p.head = Vector3(-6, sin(t * 4.0) * 18, 0)
	return p

## Clapping.
func p_clap(t: float) -> Dictionary:
	var p := p_idle(t)
	var c := sin(t * 18.0)
	p.sh_r = Vector3(55, 0, -22 - 10 * c); p.el_r = Vector3(70, 0, 0)
	p.sh_l = Vector3(55, 0, 22 + 10 * c); p.el_l = Vector3(70, 0, 0)
	p.head.x = 6
	return p

## Heckling: both arms up, waving.
func p_heckle(t: float) -> Dictionary:
	var p := p_idle(t)
	var w := sin(t * 14.0)
	p.sh_r = Vector3(160, 0, -30 + 15 * w); p.el_r = Vector3(30, 0, 0)
	p.sh_l = Vector3(160, 0, 30 + 15 * w); p.el_l = Vector3(30, 0, 0)
	p.spine.x = 6
	p.head = Vector3(-10, 0, 10 * w)
	return p

# ---- driving it ------------------------------------------------------------------------------------------------
## Blend towards a target pose. rate is how quickly (per second); a very high rate snaps.
func act(target: Dictionary, dt: float, rate := 12.0, hips_y := 0.0, mouth := false) -> void:
	_t += dt
	var k := 1.0 - exp(-rate * dt)
	for n in JOINTS:
		pose[n] = pose[n].lerp(target[n], k)
		var r: Vector3 = pose[n]
		j[n].rotation = Vector3(deg_to_rad(r.x), deg_to_rad(r.y), deg_to_rad(r.z))
	lift += (hips_y - lift) * k
	j.pelvis.position.y = 0.95 + lift
	mouth_open.visible = mouth
	mouth_smile.visible = not mouth

## Snap to a pose with no blending (for a cut, or the first frame).
func snap(target: Dictionary, hips_y := 0.0) -> void:
	for n in JOINTS: pose[n] = target[n]
	lift = hips_y
	act(target, 0.0)

func clock() -> float:
	return _t
