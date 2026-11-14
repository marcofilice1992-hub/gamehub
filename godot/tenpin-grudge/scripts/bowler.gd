class_name Bowler
extends Node3D
## A bowler: one of Quaternius's Universal Base Characters (CC0, a skinned, rigged body with a face and hair), dressed
## for the alley by shaders/body.gdshader, and animated two ways at once:
##   * clips from Quaternius's Universal Animation Library (idles, folded arms, a head shake, a nod, a dance...)
##     play underneath, from characters/clips.res;
##   * the bowling itself (holding the ball, the approach, the slide, the release and follow-through, the cheers),
##     which no clip covers, is posed procedurally and laid over the clip, bone by bone, with a mask that says which
##     bones the procedural pose owns (all of them, the upper body, or the arms) so the legs can keep the clip's idle.
## Faces -Z (down the lane). The match drives it through `act()`; nothing here touches physics.
##
## Pose conventions (the p_* functions): each joint's rotation in degrees, as if every limb hung straight down (arms by
## the sides) and the spine and head pointed straight up. For limbs that hang down, +X swings the hand or foot forward
## (down the lane); for the spine and head, +X tilts them back, so a forward lean or a nod is negative. +Z swings a
## hanging limb towards +X (the figure's right). These are retargeted onto the rig's T-pose bones in `_apply()`.

const JOINTS := ["pelvis", "spine", "head", "sh_l", "el_l", "sh_r", "el_r", "hip_l", "kn_l", "an_l", "hip_r", "kn_r", "an_r"]
const SKINS := [Color("#F2D0B5"), Color("#D9A57E"), Color("#A86F4C"), Color("#6E4430"), Color("#F5C9A6"), Color("#8C5A3C")]
const BODIES := { "m": "res://characters/Superhero_Male_FullBody.gltf", "f": "res://characters/Superhero_Female_FullBody.gltf" }
## hair styles: the Quaternius pieces that make each one
const HAIR := {
	"parted": ["Hair_SimpleParted"], "long": ["Hair_Long"], "buns": ["Hair_Buns"], "buzzed": ["Hair_Buzzed"],
	"buzzed_f": ["Hair_BuzzedFemale"], "beard": ["Hair_Buzzed", "Hair_Beard"], "parted_beard": ["Hair_SimpleParted", "Hair_Beard"],
}
## rig bone -> [pose joint, share of that joint's rotation]. The spine's bend is spread over three bones, the head's
## over the neck and head. Bones listed with no joint just carry their parent's rotation.
const RIG := [
	["root", "", 0.0], ["pelvis", "pelvis", 1.0],
	["spine_01", "spine", 0.34], ["spine_02", "spine", 0.33], ["spine_03", "spine", 0.33],
	["neck_01", "head", 0.4], ["Head", "head", 0.6],
	["clavicle_l", "", 0.0], ["upperarm_l", "sh_l", 1.0], ["lowerarm_l", "el_l", 1.0], ["hand_l", "", 0.0],
	["clavicle_r", "", 0.0], ["upperarm_r", "sh_r", 1.0], ["lowerarm_r", "el_r", 1.0], ["hand_r", "", 0.0],
	["thigh_l", "hip_l", 1.0], ["calf_l", "kn_l", 1.0], ["foot_l", "an_l", 1.0],
	["thigh_r", "hip_r", 1.0], ["calf_r", "kn_r", 1.0], ["foot_r", "an_r", 1.0],
]
## which rig bones the procedural pose owns, by mask
const MASKS := {
	"full": [],                                                                    # (all of RIG)
	"upper": ["spine_01", "spine_02", "spine_03", "neck_01", "Head", "clavicle_l", "upperarm_l", "lowerarm_l", "hand_l", "clavicle_r", "upperarm_r", "lowerarm_r", "hand_r"],
	"arms": ["clavicle_l", "upperarm_l", "lowerarm_l", "hand_l", "clavicle_r", "upperarm_r", "lowerarm_r", "hand_r"],
	"arm_r": ["clavicle_r", "upperarm_r", "lowerarm_r", "hand_r"],
	"none": ["-"],
}
const MANNEQUIN_PELVIS := Vector3(0.0, 0.0501, 0.9167)   # the animation library's pelvis rest, in the root bone's frame

var look := {}
var pose := {}                  # current joint rotations in degrees (blended towards targets each frame)
var lift := 0.0                 # hips height offset
var body: Node3D
var sk: Skeleton3D
var ap: AnimationPlayer
var mat: ShaderMaterial
var _t := 0.0
var _seed := 0.0
var _clip := ""
var _bi := {}                   # rig bone name -> index
var _rg := {}                   # bone -> rest global basis (skeleton space)
var _fix := {}                  # bone -> rotation taking the T-pose arm to hanging straight down
var _par := {}                  # bone -> parent bone name in RIG ("" for root)
var _w := {}                    # bone -> how much the procedural pose owns it right now (0..1)
var _pelvis_rest := Vector3.ZERO
var _pelvis_fix := Vector3.ZERO # character pelvis rest minus the clips' (so the clips stand this body at its own height)
var _root_inv := Basis()
var _palm := Vector3.ZERO       # the right palm's normal, in the hand bone's frame
var _hand_r := -1
var _hand_l := -1

static var _meshes := {}        # body path -> the body mesh with its T-pose positions stored
static var _slimmed := {}       # body path -> the slimmed body mesh
## How much each part of the men's (bodybuilder) base body is drawn in towards its bone: 1 is unchanged.
const SLIM := {
	"upperarm_l": 0.74, "upperarm_r": 0.74, "lowerarm_l": 0.86, "lowerarm_r": 0.86,
	"clavicle_l": 0.8, "clavicle_r": 0.8, "neck_01": 0.86,
	"thigh_l": 0.93, "thigh_r": 0.93, "calf_l": 0.92, "calf_r": 0.92,
}
static var _clips: AnimationLibrary

## look: { body ("m"/"f"), skin, shirt, panel, trousers, shoes, hair, hair_col, height }
func build(lk: Dictionary, cast_shadows := true) -> void:
	look = lk
	_seed = randf() * 10.0
	var hs: float = lk.get("height", 1.0)
	scale = Vector3(hs, hs, hs)
	var hair_key := _hair_key(String(lk.get("hair", "parted")))
	var kind: String = lk.get("body", "f" if hair_key in ["long", "buns", "buzzed_f"] else "m")
	body = load(BODIES[kind]).instantiate()
	body.rotation.y = PI                                     # the rig faces +Z; bowlers face -Z
	add_child(body)
	sk = body.find_children("*", "Skeleton3D", true, false)[0]
	# the body: swap in the mesh carrying T-pose positions, and dress it
	var main: MeshInstance3D = null
	for m in sk.find_children("*", "MeshInstance3D", false, false):
		if main == null or m.mesh.surface_get_array_len(0) > main.mesh.surface_get_array_len(0): main = m
	var src_mesh: Mesh = main.mesh
	if kind == "m": src_mesh = _slim(BODIES[kind], src_mesh, main.skin, sk)     # an everyday build, not a superhero's
	main.mesh = _dressable(BODIES[kind], src_mesh)
	mat = ShaderMaterial.new()
	mat.shader = load("res://shaders/body.gdshader")
	var tex := "res://characters/T_Superhero_%s_" % ("Male" if kind == "m" else "Female")
	mat.set_shader_parameter("skin_tex", load(tex + "Light.png"))
	mat.set_shader_parameter("skin_nrm", load(tex + "Normal.png"))
	mat.set_shader_parameter("skin_rough", load(tex + "Roughness.png"))
	mat.set_shader_parameter("skin", Color(lk.skin))
	mat.set_shader_parameter("base", Color(lk.shirt))
	mat.set_shader_parameter("panel", Color(lk.panel))
	mat.set_shader_parameter("trousers", Color(lk.trousers))
	mat.set_shader_parameter("shoes", Color(lk.shoes))
	main.material_override = mat
	# the clothes: a loose shirt and trousers, built from this body and skinned to the same skeleton
	var fit: Dictionary = Outfit.make(BODIES[kind], src_mesh, main.skin, sk, Outfit.RELAXED if kind == "m" else Outfit.CLOSER)
	var z: Dictionary = Outfit.zones(sk)
	for g in ["shirt", "trousers"]:
		var cm := ShaderMaterial.new()
		cm.shader = load("res://shaders/cloth.gdshader")
		cm.set_shader_parameter("shirt", 1.0 if g == "shirt" else 0.0)
		cm.set_shader_parameter("base", Color(lk.shirt if g == "shirt" else lk.trousers))
		cm.set_shader_parameter("panel", Color(lk.panel))
		for u in [["collar_y", "collar"], ["chest_y", "chest"], ["hem_y", "hem"], ["sleeve_x", "sleeve"], ["shoulder_x", "shoulder"],
				["armpit_y", "armpit"], ["knee_y", "knee"], ["cuff_y", "cuff"]]:
			cm.set_shader_parameter(u[0], z[u[1]])
		var gi := MeshInstance3D.new()
		gi.name = g.capitalize()
		gi.mesh = fit[g]
		gi.skin = main.skin
		gi.material_override = cm
		sk.add_child(gi)
		gi.skeleton = NodePath("..")
	var hair_mat := ShaderMaterial.new()
	hair_mat.shader = load("res://shaders/hair.gdshader")
	hair_mat.set_shader_parameter("tint", Color(lk.hair_col))
	hair_mat.set_shader_parameter("tex", load("res://characters/T_Hair_%d_BaseColor.png" % (1 if kind == "m" else 2)))
	hair_mat.set_shader_parameter("nrm", load("res://characters/T_Hair_%d_Normal.png" % (1 if kind == "m" else 2)))
	for m in sk.find_children("*", "MeshInstance3D", false, false):
		if m.name.begins_with("Eye") and m.name != "Eyes" or m.name.begins_with("Face"): m.material_override = hair_mat    # eyebrows
	for piece in HAIR[hair_key]:                             # the hair: skinned to the head bone, moved onto this skeleton
		var h: Node = load("res://characters/%s.gltf" % piece).instantiate()
		for m in h.find_children("*", "MeshInstance3D", true, false):
			var mi := MeshInstance3D.new()
			mi.mesh = m.mesh
			mi.skin = m.skin
			mi.material_override = hair_mat
			sk.add_child(mi)
			mi.skeleton = NodePath("..")
		h.free()
	for m in sk.find_children("*", "MeshInstance3D", false, false):
		m.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON if cast_shadows else GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	# where the clothes sit on this body (the skin under them is hidden, the edges painted to match)
	mat.set_shader_parameter("collar_y", z.collar)
	mat.set_shader_parameter("hem_y", z.hem)
	mat.set_shader_parameter("waist_y", z.top)
	mat.set_shader_parameter("shoulder_x", z.shoulder)
	mat.set_shader_parameter("armpit_y", z.armpit)
	mat.set_shader_parameter("sleeve_x", z.sleeve)
	mat.set_shader_parameter("ankle_y", z.shoe)
	mat.set_shader_parameter("cuff_y", z.cuff)
	mat.set_shader_parameter("relief", 0.35 if kind == "m" else 0.7)     # how much of the texture's muscle definition shows
	# the retarget: rest frames, parents, and the fix that hangs the T-pose arms down
	for r in RIG:
		var i := sk.find_bone(r[0])
		_bi[r[0]] = i
		_rg[r[0]] = sk.get_bone_global_rest(i).basis.orthonormalized()
		var p := sk.get_bone_parent(i)
		_par[r[0]] = sk.get_bone_name(p) if p >= 0 else ""
		_fix[r[0]] = Basis()
		_w[r[0]] = 1.0
		if r[0].begins_with("upperarm") or r[0].begins_with("lowerarm") or r[0].begins_with("hand"):
			var d: Vector3 = _rg[r[0]].y.normalized()
			_fix[r[0]] = Basis(Quaternion(d, Vector3.DOWN))
	_root_inv = _rg["root"].inverse()
	_pelvis_rest = sk.get_bone_rest(_bi.pelvis).origin
	_pelvis_fix = _pelvis_rest - MANNEQUIN_PELVIS
	_hand_r = _bi.hand_r
	_hand_l = _bi.hand_l
	_palm = (_rg.hand_r.inverse() * Vector3.DOWN).normalized()        # palms face down in the T-pose
	# the clips
	if _clips == null: _clips = load("res://characters/clips.res")
	ap = AnimationPlayer.new()
	body.add_child(ap)
	ap.root_node = NodePath("..")
	ap.add_animation_library("", _clips)
	ap.callback_mode_process = AnimationMixer.ANIMATION_CALLBACK_MODE_PROCESS_MANUAL
	ap.play("Idle_Loop")
	ap.seek(fmod(_seed, 2.0), true)
	_clip = "Idle_Loop"
	for n in JOINTS: pose[n] = Vector3.ZERO

static func _hair_key(h: String) -> String:
	const OLD := { "quiff": "parted", "ponytail": "long", "bob": "long", "bun": "buns", "buzz": "buzzed", "afro": "buzzed_f", "beanie": "beard" }
	return h if HAIR.has(h) else OLD.get(h, "parted")

## The men's base body is a bodybuilder's. This draws in the arms, deltoids, traps, neck and legs towards their
## bones, and narrows the chest and lats (less of a V), by each vertex's skin weights, so the joins stay smooth.
static func _slim(key: String, src: Mesh, skin: Skin, sk: Skeleton3D) -> ArrayMesh:
	if _slimmed.has(key): return _slimmed[key]
	var arr := src.surface_get_arrays(0)
	var v: PackedVector3Array = arr[Mesh.ARRAY_VERTEX]
	var bones: PackedInt32Array = arr[Mesh.ARRAY_BONES]
	var wts: PackedFloat32Array = arr[Mesh.ARRAY_WEIGHTS]
	var per := bones.size() / v.size()
	var at := func(b: String) -> Vector3: return sk.get_bone_global_rest(sk.find_bone(b)).origin
	var child := { "upperarm_l": "lowerarm_l", "upperarm_r": "lowerarm_r", "lowerarm_l": "hand_l", "lowerarm_r": "hand_r",
		"clavicle_l": "upperarm_l", "clavicle_r": "upperarm_r", "neck_01": "Head", "thigh_l": "calf_l", "thigh_r": "calf_r",
		"calf_l": "foot_l", "calf_r": "foot_r" }
	var seg := {}                                              # bind index -> [axis start, axis end, factor]
	var torso := {}                                            # bind index -> how much it narrows the chest
	for i in skin.get_bind_count():
		var bn := String(skin.get_bind_name(i))
		if bn == "" and skin.get_bind_bone(i) >= 0: bn = sk.get_bone_name(skin.get_bind_bone(i))
		if SLIM.has(bn): seg[i] = [at.call(bn), at.call(child[bn]), SLIM[bn]]
		if bn == "spine_03": torso[i] = 0.88
		if bn == "spine_02": torso[i] = 0.95
	for k in v.size():
		var p := v[k]
		var d := Vector3.ZERO
		var tx := 0.0
		for j in per:
			var w := wts[k * per + j]
			if w <= 0.0: continue
			var b := bones[k * per + j]
			if seg.has(b):
				var a: Vector3 = seg[b][0]
				var e: Vector3 = seg[b][1] - a
				var t := clampf((p - a).dot(e) / e.length_squared(), -0.3, 1.2)
				var c := a + e * t
				d += (p - c) * (float(seg[b][2]) - 1.0) * w
			if torso.has(b): tx += (1.0 - float(torso[b])) * w
		p += d
		p.x *= 1.0 - tx
		v[k] = p
	arr[Mesh.ARRAY_VERTEX] = v
	var keep: int = Mesh.ARRAY_FLAG_USE_8_BONE_WEIGHTS | (((1 << 12) - 1) << Mesh.ARRAY_FORMAT_CUSTOM0_SHIFT)
	var am := ArrayMesh.new()
	am.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arr, [], {}, src.surface_get_format(0) & keep)
	_slimmed[key] = am
	return am

## The body mesh again, with each vertex's T-pose position stored for the clothes shader: x and y in UV2, z in
## COLOR.r (as z * 2 + 0.5; colour is 8-bit, about 2 mm steps, plenty for toe caps and the shirt front).
static func _dressable(key: String, src: Mesh) -> ArrayMesh:
	if _meshes.has(key): return _meshes[key]
	var arr := src.surface_get_arrays(0)
	var v: PackedVector3Array = arr[Mesh.ARRAY_VERTEX]
	var uv2 := PackedVector2Array()
	var col := PackedColorArray()
	uv2.resize(v.size())
	col.resize(v.size())
	for i in v.size():
		uv2[i] = Vector2(v[i].x, v[i].y)
		col[i] = Color(clampf(v[i].z * 2.0 + 0.5, 0.0, 1.0), 0, 0, 1)
	arr[Mesh.ARRAY_TEX_UV2] = uv2
	arr[Mesh.ARRAY_COLOR] = col
	var keep: int = Mesh.ARRAY_FLAG_USE_8_BONE_WEIGHTS | (((1 << 12) - 1) << Mesh.ARRAY_FORMAT_CUSTOM0_SHIFT)    # and any custom channels' formats
	var flags: int = src.surface_get_format(0) & keep
	var am := ArrayMesh.new()
	am.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arr, [], {}, flags)
	_meshes[key] = am
	return am

func _bone_xform(i: int) -> Transform3D:
	return sk.global_transform * sk.get_bone_global_pose(i)

## Where the ball sits when it is in the right hand: fingers in the holes, the palm under it.
func ball_in_hand() -> Vector3:
	var g := _bone_xform(_hand_r)
	return g.origin + g.basis.y.normalized() * 0.055 * scale.x + (g.basis * _palm).normalized() * 0.085 * scale.x

## Where the ball sits when it is held at the chest in both hands.
func ball_at_chest() -> Vector3:
	var r := _bone_xform(_hand_r).origin
	var l := _bone_xform(_hand_l).origin
	return (r + l) * 0.5 + global_basis.z.normalized() * -0.07 + Vector3.UP * 0.03

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
	p.sh_r = Vector3(38, 0, -16 - 8 * c); p.el_r = Vector3(88, 0, 0)
	p.sh_l = Vector3(38, 0, 16 + 8 * c); p.el_l = Vector3(88, 0, 0)
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
## clip plays underneath (crossfaded when it changes); mask says which bones the procedural pose owns over it:
## "full", "upper" (the legs keep the clip), "arms", "arm_r", or "none" (the clip alone).
func act(target: Dictionary, dt: float, rate := 12.0, hips_y := 0.0, _mouth := false, clip := "Idle_Loop", mask := "full", speed := 1.0) -> void:
	_t += dt
	var k := 1.0 - exp(-rate * dt)
	for n in JOINTS: pose[n] = pose[n].lerp(target[n], k)
	lift += (hips_y - lift) * k
	if clip != _clip:
		ap.play(clip, 0.35)
		_clip = clip
	ap.speed_scale = speed
	ap.advance(dt)
	var own: Array = MASKS[mask]
	var km := 1.0 - exp(-7.0 * dt)
	for r in RIG:
		var want := 1.0 if own.is_empty() or own.has(r[0]) else 0.0
		_w[r[0]] += (want - _w[r[0]]) * km
	_apply()

## Just a clip, with the procedural pose let go.
func play(clip: String, dt: float, speed := 1.0) -> void:
	act(pose, dt, 0.0, lift, false, clip, "none", speed)

## Snap to a pose with no blending (for a cut, or the first frame).
func snap(target: Dictionary, hips_y := 0.0, clip := "Idle_Loop", mask := "full") -> void:
	for n in JOINTS: pose[n] = target[n]
	lift = hips_y
	if clip != _clip:
		ap.play(clip)
		_clip = clip
	var own: Array = MASKS[mask]
	for r in RIG: _w[r[0]] = 1.0 if own.is_empty() or own.has(r[0]) else 0.0
	ap.advance(0.0)
	_apply()

func clock() -> float:
	return _t

## Lay the procedural pose over whatever the clip left on the bones. Each bone's posed frame (skeleton space) is
##   accumulated joint rotations x the arm-hanging fix x its T-pose rest frame;
## its local rotation follows from its parent's. The pose's axes are the bowler's (facing -Z), the rig's face +Z, so
## each joint rotation is turned half round Y first (X and Z flip sign).
func _apply() -> void:
	var pel: int = _bi.pelvis
	sk.set_bone_pose_position(pel, sk.get_bone_pose_position(pel) + _pelvis_fix)
	var acc := {}
	var glob := {}
	for r in RIG:
		var b: String = r[0]
		var p: String = _par[b]
		var a: Basis = acc[p] if acc.has(p) else Basis()
		if r[1] != "":
			var e: Vector3 = pose[r[1]]
			var q := Basis.from_euler(Vector3(deg_to_rad(-e.x), deg_to_rad(e.y), deg_to_rad(-e.z)), EULER_ORDER_ZXY).get_rotation_quaternion()
			a = a * Basis(Quaternion.IDENTITY.slerp(q, r[2]))
		acc[b] = a
		glob[b] = a * _fix[b] * _rg[b]
		var w: float = _w[b]
		if w < 0.001 or p == "": continue
		var loc: Quaternion = (glob[p].inverse() * glob[b]).get_rotation_quaternion()
		var i: int = _bi[b]
		sk.set_bone_pose_rotation(i, sk.get_bone_pose_rotation(i).slerp(loc, w))
	var wp: float = _w.pelvis
	if wp > 0.001:
		var want := _pelvis_rest + _root_inv * Vector3(0, lift, 0)
		sk.set_bone_pose_position(pel, sk.get_bone_pose_position(pel).lerp(want, wp))
