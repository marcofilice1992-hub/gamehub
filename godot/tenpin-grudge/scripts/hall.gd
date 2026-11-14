class_name Hall
extends Node3D
## What you see: the bowling hall around lane 14, the pins and ball drawn where the physics puts them,
## the lane screens, the neighbours bowling, the guide line, the sweep bar, and the cameras.
## Visual meshes are separate from the physics bodies and copied from them every frame.

const PITCH := 2 * (Tune.LW + Tune.GW) + 0.3
const NL := 3                         # neighbouring lanes each side
const NEIGHBOUR_COLS := ["#9B5CFF", "#20C997", "#E64980", "#4DD4FF", "#F8F0E3", "#5C7CFA", "#FF8787"]
const WHO := ["Kai", "Mel", "Juno", "Raff", "Tess", "Otto"]

var m: Match
var cam: Camera3D
var env: Environment
var pos := Vector3(0, 1.7, 4.6)
var look := Vector3(0, 0.1, -6)
var pins: Array = []                  # MeshInstance3D per pin, lane 14
var ball: MeshInstance3D
var ball_mats: Array = []
var guide: MeshInstance3D
var guide_mesh := ImmediateMesh.new()
var guide_mat := StandardMaterial3D.new()
var sweep: MeshInstance3D
var sweep_k := 0.0
var strip_mat := StandardMaterial3D.new()
var bumpers: Array = []
var leds: Array = []
var deck_light: SpotLight3D
var screen_glow: OmniLight3D
var cans: Array = []
var bowlers: Array = []               # the two players' figures, by colour
var nb_bowlers := {}                  # lane offset -> the neighbour's figure
var _rel_from := Vector3.ZERO         # where the hand was when the ball left it
var _show_kind := ""
const START_D := -1.0                 # where a bowler stands to start their approach (a short one: the camera sits behind it)
const SLIDE_D := -0.5                 # where the slide ends, just behind the foul line
const WAIT := Vector3(-1.45, 0.0, 2.9) # the waiting player, by the ball return on the left
const LOOKS := [
	{ "body": "m", "skin": "#F2D0B5", "shirt": "#6EA2FF", "panel": "#16234A", "trousers": "#2A2D3A", "shoes": "#2F6BFF", "hair": "parted", "hair_col": "#3B2A20", "height": 1.0 },
	{ "body": "f", "skin": "#D9A57E", "shirt": "#F2A93B", "panel": "#3D2410", "trousers": "#2B2630", "shoes": "#E24A3B", "hair": "long", "hair_col": "#6B2E17", "height": 0.98 },
]
const NB_HAIR := ["long", "beard", "buns", "buzzed", "buzzed_f", "parted_beard"]
const NB_IDLE := ["Idle_TalkingPhone_Loop", "Consume", "Idle_Loop", "Idle_Talking_Loop", "Idle_FoldArms_Loop", "Idle_Loop"]   # what each neighbour does while they wait
var decor: Decor
var boards := {}                      # lane offset -> { vp, draw, key }
var racks: MultiMeshInstance3D
var nb: Array = []                    # the neighbours' lanes
var nb_balls: Array = []
var pin_mesh: ArrayMesh
var pin_mat := ShaderMaterial.new()
var R := RandomNumberGenerator.new()
var tier := 2                         # graphics: 0 Low, 1 Medium, 2 High, 3 Ultra
var auto := true                      # Auto starts at High and steps down if frames run long
var slow_t := 0.0
var ema := 1.0 / 60.0
var fx: Fx
var cam_attr := CameraAttributesPractical.new()
var _was_hit := false
var _last_state := ""
var _replay_t := -1.0
const TIER_NAMES := ["Low", "Medium", "High", "Ultra"]
var _roll_q := Quaternion.IDENTITY
var _replay_last := Vector3.ZERO

## One mesh in the hall. Nothing casts a shadow unless it is turned on: only the pins, the ball and the sweep bar need to,
## and every caster is drawn again for each shadow map.
func _add(mesh: Mesh, mat: Material, x: float, y: float, d: float, parent: Node = self) -> MeshInstance3D:
	var mi := MeshInstance3D.new()
	mi.mesh = mesh
	if mat: mi.material_override = mat
	mi.position = Vector3(x, y, -d)
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	parent.add_child(mi)
	return mi

## Repeated scenery (gutters, capping, kickbacks, pilasters, ceiling strips) is queued here and drawn as one MultiMesh per
## mesh and material: one draw call for all fourteen gutters instead of fourteen.
var _batches := {}
func _s(mesh: Mesh, mat: Material, x: float, y: float, d: float, rot_y := 0.0) -> void:
	var key := "%d:%d" % [mesh.get_instance_id(), mat.get_instance_id()]
	if not _batches.has(key): _batches[key] = { "mesh": mesh, "mat": mat, "xf": [] }
	_batches[key].xf.append(Transform3D(Basis(Vector3.UP, rot_y), Vector3(x, y, -d)))

func _flush_static() -> void:
	for k in _batches:
		var b: Dictionary = _batches[k]
		var mm := MultiMesh.new()
		mm.transform_format = MultiMesh.TRANSFORM_3D
		mm.mesh = b.mesh
		mm.instance_count = b.xf.size()
		for i in b.xf.size(): mm.set_instance_transform(i, b.xf[i])
		var mi := MultiMeshInstance3D.new()
		mi.multimesh = mm
		mi.material_override = b.mat
		mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		add_child(mi)
	_batches.clear()

func _box(w: float, h: float, l: float) -> BoxMesh:
	var b := BoxMesh.new()
	b.size = Vector3(w, h, l)
	return b

func _mat(col, rough: float, metal := 0.0) -> StandardMaterial3D:
	var s := StandardMaterial3D.new()
	s.albedo_color = Color(col)
	s.roughness = rough
	s.metallic = metal
	return s

func _neon(col, k: float) -> StandardMaterial3D:
	var s := StandardMaterial3D.new()
	s.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	var c := Color(col)
	s.albedo_color = Color(c.r * k, c.g * k, c.b * k)   # HDR: values over 1 bloom
	return s

func build(match_node: Match) -> void:
	m = match_node
	R.seed = 97
	var D := Tune.DECK
	var len := D + 0.3                    # lanes, gutters and capping start at the foul line; the approach is Decor's
	var mid := (D - 0.3) / 2
	var far := Tune.LW + Tune.GW
	var HALL := (NL + 0.5) * PITCH
	var MAG := Tune.MAG
	var VIO := Tune.VIO

	# ---- environment: dark hall, glow for the neon, SSR for the oiled lane, SSAO, fog into the dark ----
	env = Environment.new()
	env.background_mode = Environment.BG_COLOR
	env.background_color = Color("#0A0914")
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = Color("#5A5478")
	env.ambient_light_energy = 0.5
	env.reflected_light_source = Environment.REFLECTION_SOURCE_DISABLED
	env.tonemap_mode = Environment.TONE_MAPPER_AGX     # AgX keeps neon and the white pins from clipping to flat colour
	env.tonemap_exposure = 1.3
	env.adjustment_enabled = true                       # a light grade: a touch more contrast and colour
	env.adjustment_contrast = 1.05
	env.adjustment_saturation = 1.06
	env.glow_enabled = true
	env.glow_intensity = 0.7
	env.glow_bloom = 0.04
	env.glow_hdr_threshold = 1.25
	env.glow_blend_mode = Environment.GLOW_BLEND_MODE_SCREEN
	env.ssr_enabled = true
	env.ssr_max_steps = 64
	env.ssr_fade_in = 0.15
	env.ssr_fade_out = 2.0
	env.ssao_enabled = true
	env.ssao_radius = 0.6
	env.ssao_intensity = 1.2
	env.fog_enabled = true
	env.fog_mode = Environment.FOG_MODE_DEPTH
	env.fog_light_color = Color("#0A0914")
	env.fog_depth_begin = 26.0
	env.fog_depth_end = 50.0
	# haze in the air: the deck lights and the ceiling cans throw visible beams, the neon tints it (High and Ultra)
	env.volumetric_fog_density = 0.009
	env.volumetric_fog_albedo = Color(0.85, 0.85, 0.95)
	env.volumetric_fog_anisotropy = 0.55
	env.volumetric_fog_length = 34.0
	env.volumetric_fog_detail_spread = 2.0
	env.volumetric_fog_ambient_inject = 0.04
	env.volumetric_fog_sky_affect = 0.0
	env.ssil_radius = 3.0
	env.ssil_intensity = 0.9
	env.sdfgi_use_occlusion = true
	env.sdfgi_cascades = 4
	env.sdfgi_min_cell_size = 0.1
	env.sdfgi_energy = 0.8
	var we := WorldEnvironment.new()
	we.environment = env
	add_child(we)
	# a reflection probe over lane 14 and its neighbours, so the ball, pins and lane catch the hall's neon and ceiling strips
	var probe := ReflectionProbe.new()
	probe.size = Vector3(HALL * 2, 4.6, 34)
	probe.position = Vector3(0, 1.4, -8)
	probe.update_mode = ReflectionProbe.UPDATE_ONCE
	probe.box_projection = true
	probe.intensity = 0.5
	probe.ambient_mode = ReflectionProbe.AMBIENT_DISABLED
	add_child(probe)

	# ---- lights: a key light from the ceiling, a hard light in the masking unit over the deck, fill, neon spill ----
	var sun := DirectionalLight3D.new()
	sun.light_color = Color("#FFF1DF")
	sun.light_energy = 1.1
	sun.shadow_enabled = true
	sun.directional_shadow_max_distance = 30.0
	sun.shadow_bias = 0.03
	sun.directional_shadow_mode = DirectionalLight3D.SHADOW_PARALLEL_2_SPLITS
	sun.light_angular_distance = 1.2                    # soft shadow edges (used when soft shadows are on)
	sun.light_volumetric_fog_energy = 0.15
	sun.look_at_from_position(Vector3(1.4, 9, 3), Vector3(0, 0, -10))
	add_child(sun)
	deck_light = SpotLight3D.new()
	deck_light.light_color = Color("#FFFAF4")
	deck_light.light_energy = 0.9
	deck_light.spot_range = 6.0
	deck_light.spot_angle = 46.0
	deck_light.shadow_enabled = true
	deck_light.light_size = 0.12
	deck_light.light_volumetric_fog_energy = 2.5
	deck_light.look_at_from_position(Vector3(0, 1.05, -(Tune.HEAD - 0.55)), Vector3(0, 0, -(Tune.HEAD + 0.45)))   # in the masking unit, in front of the pins
	add_child(deck_light)
	var front := SpotLight3D.new()
	front.light_color = Color("#FFE8CC")
	front.light_energy = 3.5
	front.spot_range = 10.0
	front.spot_angle = 48.0
	front.light_volumetric_fog_energy = 0.6
	front.look_at_from_position(Vector3(0, 3, 0.5), Vector3(0, 0, -3))
	add_child(front)
	var decks := SpotLight3D.new()
	decks.light_color = Color("#FFF1E4")
	decks.light_energy = 1.4
	decks.spot_range = 4.4
	decks.spot_angle = 77.0
	decks.light_volumetric_fog_energy = 1.5
	decks.look_at_from_position(Vector3(0, 1.3, -(Tune.HEAD - 0.8)), Vector3(0, 0, -(Tune.HEAD + 0.4)))
	add_child(decks)
	for s in [-1, 1]:
		for pair in [[4.0, VIO], [13.0, MAG]]:
			var pl := OmniLight3D.new()
			pl.light_color = pair[1]
			pl.light_energy = 2.4
			pl.omni_range = 7.5
			pl.light_volumetric_fog_energy = 1.4
			pl.position = Vector3(s * (3.5 * PITCH - 0.7), 1.7, -pair[0])
			add_child(pl)
	screen_glow = OmniLight3D.new()
	screen_glow.light_color = MAG
	screen_glow.light_energy = 1.2
	screen_glow.omni_range = 5.0
	screen_glow.position = Vector3(0, 2.1, -(D - 0.3))
	add_child(screen_glow)
	# ceiling cans down the hall: pools of warm light on the lanes, and in the haze, cones
	for i in 4:
		for n in [-2, 0, 2]:
			var cn := SpotLight3D.new()
			cn.light_color = Color("#FFF0E2")
			cn.light_energy = 1.4 if n == 0 else 0.9
			cn.spot_range = 5.2
			cn.spot_angle = 22.0
			cn.spot_attenuation = 0.8
			cn.light_volumetric_fog_energy = 2.2
			cn.position = Vector3(n * PITCH, 4.15, -(1.5 + i * 4.6))
			cn.rotation.x = -PI / 2
			add_child(cn)
			cans.append(cn)
	# ---- lanes, gutters, capping, kickbacks ----
	var lane_shader: Shader = load("res://shaders/lane.gdshader")
	var plane := PlaneMesh.new()
	plane.size = Vector2(Tune.LW * 2, len)
	plane.subdivide_depth = 8
	var gut := _gutter_mesh(len)
	var gut_mat := _mat("#2A303B", 0.32, 0.55)
	var cap_mat := _mat("#1C222C", 0.28, 0.2)
	var k_mat := ShaderMaterial.new()
	k_mat.shader = load("res://shaders/kickback.gdshader")
	var k_box := _mat("#12101C", 0.6)
	strip_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	var cap_mesh := _box(0.3, 0.06, len)
	var kick_mesh := _box(0.06, 0.68, 3.4)
	var art_mesh := QuadMesh.new()
	art_mesh.size = Vector2(3.4, 0.68)
	for n in range(-NL, NL + 1):
		var cx := n * PITCH
		var lm := ShaderMaterial.new()
		lm.shader = lane_shader
		lm.set_shader_parameter("oil", m.oil.len if n == 0 else 12.0)
		lm.set_shader_parameter("dim", 1.0 if n == 0 else 0.62)
		lm.set_shader_parameter("seed", 7.0 + absf(n) * 3.1)
		_add(plane, lm, cx, 0, mid)
		for s in [-1, 1]: _s(gut, gut_mat, cx + s * (Tune.LW + Tune.GW / 2), 0, mid)
		if n < NL:
			_s(cap_mesh, cap_mat, cx + PITCH / 2, 0.03, mid)
			if n == -1 or n == 0:                            # the lane-side lights that take the bowler's colour
				var led := _add(_box(0.012, 0.012, len), strip_mat, cx + PITCH / 2 + (0.14 if n else -0.14), 0.062, mid)
				leds.append(led)
		for s in [-1, 1]:
			_s(kick_mesh, k_box, cx + s * (far + 0.03), 0.34, D - 0.5)
			_s(art_mesh, k_mat, cx + s * (far - 0.001), 0.34, D - 0.5, -s * PI / 2)
	# ---- the walls, the approach floor, the pit curtain ----
	var tube_mesh := _box(0.04, 0.035, D + 14)
	var tube_mats := [_neon(MAG, 2.4), _neon(VIO, 2.4)]
	var pil_mesh := _box(0.2, 4.6, 0.5)
	var pil_mat := _mat("#15132A", 0.6)
	for s in [-1, 1]:
		for k in 2:
			_s(tube_mesh, tube_mats[k], s * (HALL - 0.24), [0.95, 2.7][k], (D - 14) / 2 + 0.3)
		var dd := -6.0
		while dd < D:
			_s(pil_mesh, pil_mat, s * (HALL - 0.1), 2.2, dd)
			dd += 4.0
	_add(_box(HALL * 2, 0.02, 1.4), _mat("#050608", 0.9), 0, -0.34, D + 0.7)
	decor = Decor.new()
	add_child(decor)
	decor.build(lane_shader)
	for c in 2:                                              # the two players
		var b := Bowler.new()
		add_child(b)
		b.build(LOOKS[c], true)
		bowlers.append(b)
	# ---- masking units: the fascia, one screen per lane, the neon sign ----
	var lanes := 2 * NL + 1
	_add(_box(PITCH * lanes, 0.98, 0.12), _mat("#08070F", 0.7), 0, 1.13, D + 0.2)
	for n in range(-NL, NL + 1):
		var vp := SubViewport.new()
		vp.size = Vector2i(1024, 512) if n == 0 else Vector2i(512, 256)
		vp.transparent_bg = false
		vp.render_target_update_mode = SubViewport.UPDATE_ONCE
		var dr := BoardDraw.new()
		dr.k = vp.size.x / 512.0
		vp.add_child(dr)
		add_child(vp)
		var sm := StandardMaterial3D.new()
		sm.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
		sm.albedo_texture = vp.get_texture()
		sm.texture_filter = BaseMaterial3D.TEXTURE_FILTER_LINEAR_WITH_MIPMAPS_ANISOTROPIC
		var q := QuadMesh.new()
		q.size = Vector2(PITCH - 0.1, (PITCH - 0.1) / 2)
		_add(q, sm, n * PITCH, 1.13, D + 0.135)
		boards[n] = { "vp": vp, "draw": dr, "key": "" }
	var sign := Label3D.new()
	sign.text = "TENPIN GRUDGE"
	sign.font = Gx.font(800)
	sign.font_size = 160
	sign.pixel_size = 0.0022
	sign.outline_size = 18
	sign.modulate = Color(3.2, 0.9, 2.8)
	sign.outline_modulate = Color(1.6, 0.25, 1.3, 0.8)
	sign.shaded = false
	sign.double_sided = false
	sign.position = Vector3(0, 1.95, -(D + 0.19))
	add_child(sign)
	for s in [-1, 1]:
		for k in 2:                                          # neon pins and balls either side of the sign
			var tube := _add(TorusMesh.new(), _neon(VIO, 2.2), s * (2.2 + k * 0.5), 1.95, D + 0.19)
			tube.scale = Vector3(0.13, 0.13, 0.13) if k == 1 else Vector3(0.09, 0.09, 0.16)
			tube.rotation.x = PI / 2
		_add(_box(1.6, 0.012, 0.01), _neon(MAG, 2.6), s * 3.8, 1.95, D + 0.19)
	_add(_box(HALL * 2, 3, 0.1), _mat("#08070F", 1.0), 0, 3.1, D + 0.26)
	var strip := _add(_box(far * 2 + 0.3, 0.05, 0.13), strip_mat, 0, 0.66, D + 0.2)
	strip.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	# ---- ceiling strips ----
	var ceil_mesh := _box(HALL * 2 - 0.4, 0.05, 0.16)
	var ceil_mat := _neon("#C8CCD6", 1.7)
	for i in 12: _s(ceil_mesh, ceil_mat, 0, 4.2, 3 + i * 2.4)
	_flush_static()
	_add(_box(HALL * 2, 0.02, 40), _mat("#06050C", 1.0), 0, 4.27, -12)
	for s in [-1, 1]: bumpers.append(_add(_box(0.02, 0.06, D), strip_mat, s * (Tune.LW + 0.002), 0.03, D / 2))
	sweep = _add(_box(far * 2, 0.05, 0.02), _mat("#A3ACBB", 0.45, 0.1), 0, 1.2, Tune.HEAD - 0.4)
	sweep.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON

	# ---- pins: a smooth lathe profile, glossy white with two red neck stripes ----
	pin_mesh = _pin_mesh()
	pin_mat.shader = load("res://shaders/pin.gdshader")
	for i in 10:
		var p := _add(pin_mesh, pin_mat, 0, 0, 0)
		p.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON
		pins.append(p)
	racks = MultiMeshInstance3D.new()
	var mm := MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	mm.mesh = pin_mesh
	mm.instance_count = 60
	racks.multimesh = mm
	racks.material_override = pin_mat
	add_child(racks)
	var nbs := SphereMesh.new()
	nbs.radius = Tune.BR; nbs.height = Tune.BR * 2
	for i in 2:
		var bm := _mat("#ffffff", 0.2)
		bm.clearcoat_enabled = true
		var b := _add(nbs, bm, 0, 0, 0)
		b.visible = false
		nb_balls.append(b)
	var li := 0
	for n in [-3, -2, -1, 1, 2, 3]:
		var L := { "n": n, "li": li, "state": "idle", "t": 3 + R.randf() * 10, "pins": [], "who": WHO[li], "rolls": [] }
		for i in 10: L.pins.append({ "k": 0.0, "down": false, "gone": false })
		nb.append(L)
		_play(L, 2 + R.randi() % 5)
		_rack(L, true)
		_neighbour_board(L)
		var nbw := Bowler.new()                              # and someone to bowl on it
		add_child(nbw)
		nbw.build({ "skin": Bowler.SKINS[(li * 2 + 1) % Bowler.SKINS.size()], "shirt": NEIGHBOUR_COLS[li % NEIGHBOUR_COLS.size()], "panel": "#15131F",
			"trousers": ["#2A2D3A", "#3A3328", "#1E2733"][li % 3], "shoes": ["#E24A3B", "#2F6BFF", "#20C997"][li % 3], "hair": NB_HAIR[li % NB_HAIR.size()],
			"hair_col": ["#2B1D14", "#C9A15A", "#121212", "#6B2E17", "#3B2A20", "#8A8A8A"][li % 6], "height": 0.95 + 0.07 * R.randf() }, false)
		nbw.position = Vector3(n * PITCH - 0.2, 0, 4.5)
		nbw.set_meta("r", -1.0)
		nbw.set_meta("idle", NB_IDLE[li % NB_IDLE.size()])
		nb_bowlers[n] = nbw
		li += 1

	# ---- the ball: a swirled pearl in each player's colour ----
	var bs := SphereMesh.new()
	bs.radius = Tune.BR; bs.height = Tune.BR * 2
	bs.radial_segments = 48; bs.rings = 24
	for i in 2:
		var sm := ShaderMaterial.new()
		sm.shader = load("res://shaders/ball.gdshader")
		sm.set_shader_parameter("base", Tune.PCOL[i])
		sm.set_shader_parameter("mark", i)
		sm.set_shader_parameter("seed", 11.0 + i * 5)
		ball_mats.append(sm)
	ball = _add(bs, ball_mats[0], 0, Tune.BR, Tune.START)
	ball.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON

	# ---- the guide: a ribbon on the boards ----
	guide_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	guide_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	guide_mat.cull_mode = BaseMaterial3D.CULL_DISABLED
	guide_mat.disable_fog = true
	guide_mat.no_depth_test = false
	guide = MeshInstance3D.new()
	guide.mesh = guide_mesh
	guide.material_override = guide_mat
	guide.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(guide)

	if not Store.reduced():                                 # start the opening shot from the concourse
		pos = Vector3(0, 2.4, 11.0)
		look = Vector3(0, 0.6, -6.0)
	else:
		pos = Vector3(0.85, 2.4, 4.4)
		look = Vector3(0.1, 0.3, -9.0)
	cam = Camera3D.new()
	cam.fov = 27.0
	cam.near = 0.05
	cam.far = 80.0
	cam.current = true
	cam.attributes = cam_attr
	add_child(cam)
	cam.position = pos
	cam.look_at(look)
	fx = Fx.new()
	add_child(fx)
	m.fx.connect(_on_fx)
	var g: String = Store.get_setting("graphics", "auto")
	auto = g == "auto"
	apply_tier(2 if auto else maxi(0, ["low", "medium", "high", "ultra"].find(g)))

## A shallow half-pipe running the length of the lane, 48 mm deep in the middle.
func _gutter_mesh(len: float) -> ArrayMesh:
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	var R2 := 0.168
	var half := asin(Tune.GW / 2 / R2)
	var seg := 16
	for i in seg:
		var a0 := -half + 2 * half * i / seg
		var a1 := -half + 2 * half * (i + 1) / seg
		var p0 := Vector3(R2 * sin(a0), R2 - 0.048 - R2 * cos(a0), 0)
		var p1 := Vector3(R2 * sin(a1), R2 - 0.048 - R2 * cos(a1), 0)
		var n0 := Vector3(-sin(a0), cos(a0), 0)
		var n1 := Vector3(-sin(a1), cos(a1), 0)
		for tri in [[p0, n0, -1], [p1, n1, -1], [p1, n1, 1], [p0, n0, -1], [p1, n1, 1], [p0, n0, 1]]:
			st.set_normal(tri[1])
			st.add_vertex(tri[0] + Vector3(0, 0, tri[2] * len / 2))
	return st.commit()

func _smooth(pts: Array, per: int) -> Array:
	var out := []
	for i in pts.size() - 1:
		var p0: Vector2 = pts[maxi(0, i - 1)]
		var p1: Vector2 = pts[i]
		var p2: Vector2 = pts[i + 1]
		var p3: Vector2 = pts[mini(pts.size() - 1, i + 2)]
		for s in per:
			var t := float(s) / per
			var t2 := t * t
			var t3 := t2 * t
			out.append(0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3))
	out.append(pts.back())
	return out

## The pin: a lathe of a Catmull-Rom profile, 32 sides. Godot builds levels of detail from it, so far pins (and their shadows)
## are drawn with a fraction of the triangles.
func _pin_mesh() -> ArrayMesh:
	var raw := [Vector2(0.026, 0), Vector2(0.031, 0.012), Vector2(0.046, 0.06), Vector2(0.0585, 0.105), Vector2(0.0605, 0.127), Vector2(0.057, 0.16),
		Vector2(0.045, 0.2), Vector2(0.032, 0.236), Vector2(0.0255, 0.262), Vector2(0.0238, 0.282), Vector2(0.0255, 0.3), Vector2(0.031, 0.322),
		Vector2(0.0325, 0.338), Vector2(0.03, 0.358), Vector2(0.021, 0.373), Vector2(0.0001, 0.381)]
	var prof := _smooth(raw, 4)
	prof.push_front(Vector2(0.0001, 0))
	var segs := 32
	var verts := PackedVector3Array()
	var norms := PackedVector3Array()
	var uvs := PackedVector2Array()
	var idx := PackedInt32Array()
	for i in prof.size():
		var a: Vector2 = prof[maxi(0, i - 1)]
		var b: Vector2 = prof[mini(prof.size() - 1, i + 1)]
		var tang := (b - a).normalized()
		var nrm := Vector2(tang.y, -tang.x)               # outward in (r, y), smoothed across neighbouring rings
		var p: Vector2 = prof[i]
		for j in segs + 1:
			var th := TAU * j / segs
			verts.append(Vector3(maxf(0.0001, p.x) * cos(th), p.y - Tune.COG, maxf(0.0001, p.x) * sin(th)))
			norms.append(Vector3(nrm.x * cos(th), nrm.y, nrm.x * sin(th)).normalized())
			uvs.append(Vector2(float(j) / segs, 1.0 - p.y / 0.381))
	for i in prof.size() - 1:
		for j in segs:
			var a0 := i * (segs + 1) + j
			var b0 := a0 + segs + 1
			idx.append_array([a0, b0 + 1, b0, a0, a0 + 1, b0 + 1])   # clockwise seen from outside: Godot's front face
	var arr := []
	arr.resize(Mesh.ARRAY_MAX)
	arr[Mesh.ARRAY_VERTEX] = verts
	arr[Mesh.ARRAY_NORMAL] = norms
	arr[Mesh.ARRAY_TEX_UV] = uvs
	arr[Mesh.ARRAY_INDEX] = idx
	var im := ImporterMesh.new()
	im.add_surface(Mesh.PRIMITIVE_TRIANGLES, arr)
	im.generate_lods(25.0, 60.0, [])
	return im.get_mesh()

# ---- the neighbours ------------------------------------------------------------------------------------
func _rack(L: Dictionary, stand: bool) -> void:
	var cx: float = L.n * PITCH
	var spots := Tune.spots()
	for i in 10:
		var p: Dictionary = L.pins[i]
		if stand:
			p.k = 0.0; p.down = false
		var e: float = p.k * p.k * (3 - 2 * p.k)
		var s: Vector2 = spots[i]
		var o := Vector3(cx + s.x + p.get("dx", 0.0) * e, Tune.COG - (Tune.COG - 0.06) * e, -(s.y + p.get("dd", 0.0) * e))
		var basis := Basis()
		if p.has("ax"): basis = Basis(Vector3(p.ax, 0, p.az).normalized(), e * 1.48)
		if p.gone: basis = basis.scaled(Vector3.ZERO)
		racks.multimesh.set_instance_transform(L.li * 10 + i, Transform3D(basis, o))

func _play(L: Dictionary, k: int, first := -1) -> void:
	for i in k:
		if Score.frames(L.rolls)[9].done: L.rolls = []
		var a := first if first >= 0 and i == 0 else (10 if R.randf() < 0.35 else 6 + R.randi() % 4)
		L.rolls.append(a)
		var fr := Score.frames(L.rolls)
		var f := -1
		for j in 10:
			if not fr[j].done:
				f = j
				break
		if f >= 0 and a < 10: L.rolls.append(10 - a if R.randf() < 0.5 else R.randi() % (10 - a))
		if f == 9:
			while not Score.frames(L.rolls)[9].done: L.rolls.append(mini(Score.standing(L.rolls), 6 + R.randi() % 5))

func _neighbours(dt: float) -> void:
	var spots := Tune.spots()
	for L in nb:
		L.t -= dt
		if L.state == "idle" and L.t <= 0:
			var b = null
			for x in nb_balls:
				if not x.visible:
					b = x
					break
			if b == null:
				L.t = 2.0
				continue
			b.material_override.albedo_color = Color(NEIGHBOUR_COLS[R.randi() % NEIGHBOUR_COLS.size()])
			b.visible = true
			L.merge({ "state": "roll", "ball": b, "x": 0.12 + (R.randf() - 0.5) * 0.35, "vx": 0.15 + R.randf() * 0.15, "d": 0.2, "v": 6.8 + R.randf() * 2.2, "t": 0.0 }, true)
			nb_bowlers[L.n].set_meta("r", 0.0)
		elif L.state == "roll" or L.state == "fall":
			L.d += L.v * dt
			if L.d > 12 and L.state == "roll": L.vx -= 0.5 * dt
			L.x += L.vx * dt
			var b: MeshInstance3D = L.ball
			b.visible = L.d < Tune.DECK + 0.4
			b.position = Vector3(L.n * PITCH + L.x, Tune.BR, -L.d)
			b.rotate_x(-L.v * dt / Tune.BR)
			if L.state == "roll" and L.d >= Tune.HEAD - 0.12:  # impact: a strike now and then, otherwise most of the rack
				L.state = "fall"
				L.t = 0.0
				var strike: bool = R.randf() < 0.4 or absf(L.x - 0.07) < 0.05
				var keep := 0 if strike else 1 + R.randi() % 4
				var order := range(10)
				for i in range(9, 0, -1):
					var j := R.randi() % (i + 1)
					var tmp = order[i]; order[i] = order[j]; order[j] = tmp
				var kept := order.slice(0, keep)
				for i in 10:
					var p: Dictionary = L.pins[i]
					var s2: Vector2 = spots[i]
					var fx: float = s2.x - L.x
					var fd: float = s2.y - Tune.HEAD + 0.25
					var mm := maxf(0.001, Vector2(fx, fd).length())
					p.merge({ "down": not kept.has(i), "delay": (s2.y - Tune.HEAD) * 0.4 + R.randf() * 0.08, "dx": fx / mm * 0.3 + (R.randf() - 0.5) * 0.15,
						"dd": fd / mm * 0.35, "ax": fd / mm + (R.randf() - 0.5) * 0.6, "az": -fx / mm + (R.randf() - 0.5) * 0.6, "k": 0.0 }, true)
				_play(L, 1, 10 - keep)
				_neighbour_board(L)
				for j in 3: Sfx.play("tg-pin", 0.12 + R.randf() * 0.1, 0.8 + R.randf() * 0.3)
			if L.state == "fall":
				L.t += dt
				for p in L.pins:
					if p.down: p.k = clampf((L.t - p.delay) / 0.45, 0, 1)
				if L.t > 3.2:
					L.state = "sweep"
					L.t = 0.8
					for p in L.pins: p.gone = p.down
					b.visible = false
				_rack(L, false)
		elif L.state == "sweep" and L.t <= 0:
			for p in L.pins:
				p.gone = false
				p.erase("ax")
			_rack(L, true)
			L.state = "idle"
			L.t = 6 + R.randf() * 16

func _neighbour_board(L: Dictionary) -> void:
	var fr := Score.frames(L.rolls)
	var f := -1
	for j in 10:
		if not fr[j].done:
			f = j
			break
	_board(L.n, { "lane": 14 + L.n, "name": L.who, "sub": "Final" if f < 0 else "Frame %d" % (f + 1), "rolls": L.rolls.duplicate(), "score": Score.shown(L.rolls),
		"accent": "#B49CFF" if L.n % 2 else "#FF7AE0", "mark": -1, "live": f, "main": false })

func _board(n: int, o: Dictionary) -> void:
	var B: Dictionary = boards[n]
	var key := JSON.stringify(o)
	if key == B.key: return
	B.key = key
	B.draw.o = o
	B.draw.queue_redraw()
	B.vp.render_target_update_mode = SubViewport.UPDATE_ONCE

## The screen over lane 14: both bowlers, like a real alley's overhead scoring. The HUD scorecard is a close-up of it.
## After each ball it shows the result as the alley would: STRIKE, SPARE, the count, in the bowler's colour.
func _display() -> void:
	var t := m.turn
	var over := m.state == "over" or m.state == "done"
	var draw := over and m.won < 0
	var sub := "Final" if over else "First to bowl" if m.state == "intro" else ("Roll-off %d" % t.ro) if not t.is_empty() and t.ro else ("Frame %d · Ball %d" % [t.f + 1, t.b + 1]) if not t.is_empty() else ""
	var acc: Color = Tune.TEXT if draw else Tune.PCOL[(m.P[m.won] if over and m.won >= 0 else m.cur).c]
	var rows := []
	for c in 2:
		var p: Dictionary = m.P[m.by(c)]
		rows.append({ "c": c, "rolls": p.rolls.duplicate(), "score": Score.shown(p.rolls), "on": p == m.cur and not over,
			"live": t.f if p == m.cur and not over and not t.is_empty() and not t.ro else -1 })
	var o := { "duo": true, "lane": 14, "sub": sub, "accent": acc.to_html(false), "rows": rows, "status": m.status_line(), "main": true }
	var q := m.call
	if not q.is_empty() and (m.state == "show" or m.state == "replay"):
		var age: float = q.max - q.t
		o.call = { "text": q.text, "sub": q.sub, "c": q.c, "age": snappedf(age, 1.0 / 30.0), "left": snappedf(q.t, 1.0 / 30.0) }
	elif over:
		o.call = { "text": "A DRAW" if draw else Tune.NAMES[m.P[m.won].c] + " WINS", "sub": "", "c": -1 if draw else m.P[m.won].c, "age": 1.0, "left": 9.0 }
	_board(0, o)

# ---- every frame ----------------------------------------------------------------------------------------
func _process(dt: float) -> void:
	if m == null: return
	dt = minf(dt, 0.1)
	_quality(dt)
	if tier >= 1:
		_neighbours(minf(dt, 0.05))
		_neighbour_bowlers(minf(dt, 0.05))
	_display()
	var st := m.state
	var c: int = m.cur.c
	var col: Color = Tune.PCOL[c]
	var fl := m.flash
	# strikes and spares: the deck light, the lane-side lights and the screen all lift together, then settle
	deck_light.light_energy = 0.9 * (1 + 0.6 * fl)
	strip_mat.albedo_color = Color(col.r * (1.2 + 2.5 * fl), col.g * (1.2 + 2.5 * fl), col.b * (1.2 + 2.5 * fl))
	screen_glow.light_color = col
	screen_glow.light_energy = 1.0 + 3.0 * fl
	for i in cans.size():
		if i % 3 == 1: cans[i].light_energy = 1.4 * (1 + 0.6 * fl)
	var ln := m.lane
	var RF = m.rp_frame if st == "replay" else null
	if ln.hit and not _was_hit and ln.ball and st == "roll":           # where the ball meets the pins: dust and chips
		fx.impact(ln.ball.position + Vector3(0, 0.02, -0.08), ln.ball.linear_velocity.length())
	_was_hit = ln.hit
	if st == "replay" and _last_state != "replay": fx.clear()
	if RF != null and _replay_t < ln.hit_t and RF[88] >= ln.hit_t:                  # the replay's own impact
		fx.impact(Vector3(RF[80], RF[81] + 0.02, RF[82] - 0.08), 8.0)
	_replay_t = RF[88] if RF != null else -1.0
	_last_state = st
	for i in 10:
		var vis: MeshInstance3D = pins[i]
		if RF != null:
			vis.visible = RF[i * 8 + 7] > 0
			if vis.visible:
				vis.position = Vector3(RF[i * 8], RF[i * 8 + 1], RF[i * 8 + 2])
				vis.quaternion = Quaternion(RF[i * 8 + 3], RF[i * 8 + 4], RF[i * 8 + 5], RF[i * 8 + 6])
		else:
			var b = ln.pins[i] if i < ln.pins.size() else null
			vis.visible = b != null and is_instance_valid(b)
			if vis.visible: vis.transform = ln.draw_xform(b)
	ball.material_override = ball_mats[c]
	for bm in bumpers: bm.visible = m.assist(m.cur) == 2 and st != "over" and st != "done"
	if not m.call.is_empty() and st == "show":
		var tx: String = m.call.text
		_show_kind = "big" if tx in ["Strike", "Turkey"] else "good" if tx == "Spare" else "bad" if tx in ["Gutter", "Split"] or tx.begins_with("0 ") else ""
	elif st != "replay": _show_kind = ""
	_bowlers(dt)
	if st == "stance" or st == "swing" or st == "intro":       # the ball is in the bowler's hands until it is let go
		var bw: Bowler = bowlers[c]
		ball.visible = true
		ball.position = bw.ball_at_chest() if st != "swing" else bw.ball_in_hand()
		ball.quaternion = Quaternion(Vector3.RIGHT, -0.6)
		_roll_q = ball.quaternion
		_rel_from = ball.position
	elif RF != null:                                        # replay: place the ball from the recording and roll it by how far it moved
		ball.visible = RF[87] > 0
		var p := Vector3(RF[80], RF[81], RF[82])
		var dv := p - ball.position
		var sp := Vector2(dv.x, dv.z).length()
		ball.position = p
		if sp > 1e-4 and sp < 0.5:
			_roll_q = Quaternion(Vector3(-dv.z / sp, 0, dv.x / sp), -sp / Tune.BR) * _roll_q
			ball.quaternion = _roll_q
	else:
		var b = ln.ball
		ball.visible = b != null and is_instance_valid(b)
		if ball.visible:
			ball.position = ln.draw_xform(b).origin
			if st == "roll" and m.t < 0.09:                     # the first moment out of the hand: blend from the hand to the ball's path
				ball.position = _rel_from.lerp(ball.position, smoothstep(0.0, 0.09, m.t))
			var v: Vector3 = b.linear_velocity
			var sp := Vector2(v.x, v.z).length()
			if sp > 0.05:
				var axis := Vector3(-v.z / sp, -m.spin * 0.8, v.x / sp).normalized()            # spin tilts the axis the ball turns on
				_roll_q = (Quaternion(axis, -sp * dt * ln.pace / Tune.BR * (1.0 + 0.45 * absf(m.spin))) * _roll_q).normalized()   # spin adds revs
			ball.quaternion = _roll_q
	# the sweep bar comes down as the pins are cleared, and lifts as the next ball begins
	var want := (1.0 if m.t > m.hold - 0.55 else 0.0) if st == "show" else (1.0 if st == "stance" and m.t < 0.35 and m.n > 1 else 0.0)
	sweep_k += (want - sweep_k) * (1 - exp(-9 * dt))
	sweep.visible = sweep_k > 0.01
	sweep.position.y = 1.2 - sweep_k * 1.0
	_guide(col)
	_camera(dt)

func _guide(col: Color) -> void:
	var pts := m.guide()
	guide_mesh.clear_surfaces()
	var n := mini(140, pts.size())
	guide.visible = n > 1
	if n < 2: return
	guide_mat.albedo_color = Color(col.r, col.g, col.b, 0.6)
	guide_mesh.surface_begin(Mesh.PRIMITIVE_TRIANGLE_STRIP)
	for i in n:
		var p := pts[i]
		var q := pts[mini(n - 1, i + 1)]
		var o := pts[maxi(0, i - 1)]
		var t := (q - o)
		var mm := maxf(1e-6, t.length())
		var nx := t.y / mm * 0.014
		var nd := -t.x / mm * 0.014
		guide_mesh.surface_add_vertex(Vector3(p.x - nx, 0.004, -(p.y - nd)))
		guide_mesh.surface_add_vertex(Vector3(p.x + nx, 0.004, -(p.y + nd)))
	guide_mesh.surface_end()

func _camera(dt: float) -> void:
	var st := m.state
	var px := m.x0 * 0.6
	var py := 1.7
	var pz := 4.6
	var lx := m.x0 * 0.25
	var ly := 0.1
	var lz := -6.0
	var rate := 3.0
	var ln := m.lane
	if st == "intro" and not Store.reduced():               # the opening shot: from the concourse, over the ball returns, down to the stance
		var e := clampf(m.t / 2.0, 0.0, 1.0)
		e = e * e * (3 - 2 * e)
		px = lerpf(0.0, m.x0 * 0.5 + 0.85, e); py = 2.4; pz = lerpf(11.0, 4.4, e)
		lx = lerpf(0.0, m.x0 * 0.25 + 0.1, e); ly = lerpf(0.6, 0.3, e); lz = lerpf(-6.0, -9.0, e); rate = 30
	elif st == "stance" or st == "swing" or st == "intro":   # behind and above the bowler's right shoulder
		var k := clampf(m.sw.t / 0.85, 0.0, 1.0) if st == "swing" else 0.0
		px = m.x0 * 0.5 + 0.85; py = 2.4; pz = lerpf(4.4, 3.9, k * k * (3 - 2 * k))
		lx = m.x0 * 0.25 + 0.1; ly = 0.3; lz = -9.0; rate = 4.0
	elif st == "show" and m.t > m.react_from:              # turn round to the bowler for their reaction
		var bw: Bowler = bowlers[m.cur.c]
		var bp := bw.global_position
		px = bp.x + 0.9; py = 1.5; pz = bp.z - 3.3; lx = bp.x - 0.25; ly = 1.2; lz = bp.z + 0.4; rate = 30.0 if m.t - m.react_from < 0.05 else 2.0
	elif st == "replay":                                       # low inside the lane, pushing in slowly
		var t := minf(m.t, 6.0)
		px = 0.5 - t * 0.06; py = 0.3 + t * 0.012; pz = -(Tune.HEAD - 2.8 + t * 0.2)
		lx = 0; ly = 0.17; lz = -(Tune.HEAD + 0.3); rate = 9
	elif st == "show":                                       # step back and look up a touch: the pins below, the lane screen above
		px = 0.35; py = 0.75; pz = -(Tune.HEAD - 3.4); lx = 0; ly = 0.735; lz = -(Tune.HEAD + 0.5); rate = 3
	elif st == "roll":
		if ln.hit or not ln.live or ln.ball == null:
			px = 0.5; py = 0.66; pz = -(Tune.HEAD - 2.7); lx = 0; ly = 0.2; lz = -(Tune.HEAD + 0.45); rate = 4
		else:
			var b := ln.ball.position
			px = b.x * 0.7; py = 0.85; pz = maxf(b.z + 2.6, -(Tune.HEAD - 4)); lx = b.x * 0.4; ly = 0.15; lz = minf(b.z - 7, -(Tune.HEAD - 0.5)); rate = 6
	var k := 1 - exp(-rate * dt)
	pos += (Vector3(px, py, pz) - pos) * k
	look += (Vector3(lx, ly, lz) - look) * k
	var shake := Vector3.ZERO
	if m.shake > 0 and not Store.reduced():
		var a := m.shake * m.shake * 0.025
		shake = Vector3(randf_range(-a, a), randf_range(-a, a), 0)
	cam.position = pos + shake
	cam.look_at(look + shake)
	# depth of field on the close cameras (High and Ultra): the pins sharp, the pit and the near lane soft
	var dof := tier >= 2 and (st == "replay" or ((st == "roll" or st == "show") and (ln.hit or st == "show")))
	cam_attr.dof_blur_far_enabled = dof
	cam_attr.dof_blur_near_enabled = dof and st == "replay"
	if dof:
		var focus := pos.distance_to(Vector3(0, 0.2, -(Tune.HEAD + 0.3)))
		cam_attr.dof_blur_far_distance = focus + 0.7
		cam_attr.dof_blur_far_transition = 2.5
		cam_attr.dof_blur_near_distance = maxf(0.3, focus - 1.6)
		cam_attr.dof_blur_near_transition = 0.8
		cam_attr.dof_blur_amount = 0.07 if st == "replay" else 0.04

## The bowlers. The one up stands at the back of the approach holding the ball, walks it in with the swing, slides,
## lets go and follows through, then reacts to what fell. The other waits by the ball return, heckles, and reacts too.
func _bowlers(dt: float) -> void:
	var st := m.state
	var c: int = m.cur.c
	var me: Bowler = bowlers[c]
	var you: Bowler = bowlers[1 - c]
	var red := Store.reduced()
	var tt := me.clock()
	# the bowler who is up
	var bx := m.x0 - 0.2
	match st:
		"intro", "stance":
			me.position = Vector3(bx, 0, -START_D)
			me.rotation.y = 0
			me.act(me.p_hold(tt), dt, 10.0, 0.0, false, "Idle_Loop", "upper")      # the legs keep the idle's weight shifts
		"swing":
			var k := clampf(m.sw.t / 0.85, 0.0, 1.0)
			var e := k * k * (3 - 2 * k)
			me.position = Vector3(bx, 0, -lerpf(START_D, SLIDE_D, e))
			var pw := (m.swing_power() - 0.55) / 0.45
			var tired := clampf((m.sw.t - Tune.TIRE_AFTER) * 0.6, 0.0, 1.0)
			var bob := -0.035 * absf(sin(k * 3.0 * PI))
			me.act(me.p_approach(k, pw, tired, m.sw.twist), dt, 30.0, -0.17 * smoothstep(0.7, 1.0, k) + bob)
		"roll":
			me.position = Vector3(bx, 0, -SLIDE_D)
			me.act(me.p_release(m.t, m.spin), dt, 40.0 if m.t < 0.1 else 10.0, -0.17 * (1.0 - smoothstep(1.2, 1.9, m.t)))
		"show", "replay":
			var kind := _show_kind
			if kind == "big": me.act(me.p_cheer(tt, true), dt, 10.0, 0.0 if red else absf(sin(tt * 7.0)) * 0.12, true)
			elif kind == "good": me.play("Yes", dt)                              # a nod and a thumbs up
			elif kind == "bad": me.act(me.p_slump(tt), dt, 6.0)
			else: me.play("Idle_Loop", dt)
		"over", "done":
			var w := m.won
			if w < 0: me.play("Idle_Loop", dt)
			else:
				var winner: Bowler = bowlers[m.P[w].c]
				var loser: Bowler = bowlers[1 - m.P[w].c]
				winner.play("Dance_Loop", dt)
				loser.play("Idle_No_Loop", dt)
				return
	# the one waiting: by the ball return, half turned to the lane
	you.position = WAIT
	you.rotation.y = -0.45
	var hk := m.heckle
	if not hk.is_empty() and hk.c == 1 - c: you.play("Idle_Rail_Call", dt)                       # hands round the mouth, calling out
	elif (st == "show" or st == "replay") and _show_kind == "big": you.play("Idle_FoldArms_Loop", dt)
	elif (st == "show" or st == "replay") and _show_kind == "bad": you.act(you.p_clap(you.clock()), dt, 10.0, 0.0, true, "Idle_Loop", "upper")
	else: you.play("Idle_Loop", dt)

## The neighbours: a quick approach as their ball is about to go, a release, then back to waiting.
func _neighbour_bowlers(dt: float) -> void:
	for L in nb:
		var bw: Bowler = nb_bowlers[L.n]
		var r: float = bw.get_meta("r")
		var x: float = L.n * PITCH - 0.2
		if L.state == "idle" and L.t < 0.9:
			var k := clampf(1.0 - L.t / 0.9, 0.0, 1.0)
			bw.position = Vector3(x, 0, -lerpf(START_D, SLIDE_D, k * k * (3 - 2 * k)))
			bw.act(bw.p_approach(k, 0.5, 0.0), dt, 30.0, -0.17 * smoothstep(0.7, 1.0, k))
		elif r >= 0.0 and r < 3.5:
			bw.set_meta("r", r + dt)
			bw.position = Vector3(x, 0, -SLIDE_D)
			bw.act(bw.p_release(r), dt, 30.0 if r < 0.1 else 8.0, -0.17 * (1.0 - smoothstep(1.2, 1.9, r)))
		else:
			if r >= 3.5: bw.set_meta("r", -1.0)
			bw.position = Vector3(x, 0, 4.5)                     # waiting back on the concourse, out of the bowling camera's way
			bw.play(bw.get_meta("idle"), dt)

## Graphics tiers, tuned for a mid-range card (an RTX 3060 Ti runs High at 1080p with room to spare):
## Low     FSR 1 at 67% scale, FXAA, no screen-space effects, hard shadows, still neighbours
## Medium  FSR 2 at 77% scale (its temporal AA cleans the pin stripes and board seams), SSR, SSAO, soft shadows
## High    FSR 2 at full resolution as anti-aliasing, + SSIL bounce light, volumetric haze, depth of field
## Ultra   + SDFGI global illumination, finer haze, higher-quality reflections, AO and shadows
func apply_tier(t: int) -> void:
	tier = clampi(t, 0, 3)
	var vp := get_viewport()
	vp.msaa_3d = Viewport.MSAA_DISABLED
	if tier == 0:
		vp.scaling_3d_mode = Viewport.SCALING_3D_MODE_FSR
		vp.scaling_3d_scale = 0.67
		vp.screen_space_aa = Viewport.SCREEN_SPACE_AA_FXAA
	else:
		vp.scaling_3d_mode = Viewport.SCALING_3D_MODE_FSR2
		vp.scaling_3d_scale = 0.77 if tier == 1 else 1.0
		vp.screen_space_aa = Viewport.SCREEN_SPACE_AA_DISABLED
	vp.fsr_sharpness = 0.35
	vp.mesh_lod_threshold = [4.0, 2.0, 1.0, 0.5][tier]
	vp.positional_shadow_atlas_size = 2048 if tier < 2 else 4096
	env.ssr_enabled = tier >= 1
	env.ssr_max_steps = [16, 32, 64, 128][tier]
	env.ssao_enabled = tier >= 1
	env.ssil_enabled = tier >= 2
	env.volumetric_fog_enabled = tier >= 2
	env.sdfgi_enabled = tier == 3
	var q: RenderingServer.EnvironmentSSAOQuality = [RenderingServer.ENV_SSAO_QUALITY_LOW, RenderingServer.ENV_SSAO_QUALITY_LOW, RenderingServer.ENV_SSAO_QUALITY_MEDIUM, RenderingServer.ENV_SSAO_QUALITY_HIGH][tier]
	RenderingServer.environment_set_ssao_quality(q, tier < 3, 0.5, 2, 50.0, 300.0)
	RenderingServer.environment_set_ssil_quality(q as RenderingServer.EnvironmentSSILQuality, tier < 3, 0.5, 4, 50.0, 300.0)
	RenderingServer.environment_set_volumetric_fog_volume_size(64 if tier < 3 else 128, 64 if tier < 3 else 128)
	RenderingServer.environment_set_volumetric_fog_filter_active(true)
	var sq: RenderingServer.ShadowQuality = [RenderingServer.SHADOW_QUALITY_HARD, RenderingServer.SHADOW_QUALITY_SOFT_LOW, RenderingServer.SHADOW_QUALITY_SOFT_MEDIUM, RenderingServer.SHADOW_QUALITY_SOFT_HIGH][tier]
	RenderingServer.directional_soft_shadow_filter_set_quality(sq)
	RenderingServer.positional_soft_shadow_filter_set_quality(sq)
	RenderingServer.directional_shadow_atlas_set_size(2048 if tier == 0 else 4096, true)
	RenderingServer.camera_attributes_set_dof_blur_quality(RenderingServer.DOF_BLUR_QUALITY_MEDIUM if tier < 3 else RenderingServer.DOF_BLUR_QUALITY_HIGH, true)
	deck_light.shadow_enabled = tier >= 1
	racks.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON if tier >= 2 else GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	fx.scale_k = [0.4, 0.7, 1.0, 1.0][tier]
	decor.set_tier(tier)
	for k in nb_bowlers: nb_bowlers[k].visible = tier >= 1
	slow_t = 0.0

func _on_fx(kind: String, c: int) -> void:
	if kind == "strike": fx.strike(Tune.PCOL[c], Store.reduced())

func tier_label() -> String:
	return ("Auto (%s)" % TIER_NAMES[tier]) if auto else TIER_NAMES[tier]

## Auto: if frames run long (under 50 a second) for three seconds, step down a tier. It never steps back up by itself,
## so the picture does not flicker between tiers.
func _quality(dt: float) -> void:
	ema += (dt - ema) * 0.05
	if not auto or tier == 0: return
	slow_t = slow_t + dt if ema > 1.0 / 50.0 else 0.0
	if slow_t > 3.0: apply_tier(tier - 1)


## One lane screen, drawn into its SubViewport. o: { lane, name, sub, rolls, score, accent, mark, live, main }
class BoardDraw extends Control:
	var o := {}
	var k := 1.0

	func _ready() -> void:
		size = Vector2(512, 256) * k

	func _draw() -> void:
		if o.is_empty(): return
		draw_set_transform(Vector2.ZERO, 0, Vector2(k, k))
		var acc := Color(o.accent)
		draw_rect(Rect2(0, 0, 512, 256), Color("#05040A"))
		Gx.grad_rrect(self, 5, 5, 502, 246, 16, Gx.SCREEN_TOP, Gx.SCREEN_BOT)
		if o.get("main", false): Gx.glow_rrect(self, 5, 5, 502, 246, 16, acc, 3.0, 1.0)
		else: Gx.rrect(self, 5, 5, 502, 246, 16, null, Color(acc.r, acc.g, acc.b, 0.55), 2.5)
		Gx.rrect(self, 20, 16, 64, 34, 9, acc)
		Gx.text(self, str(o.lane), 52, 33, { "size": 24, "weight": 800, "color": Color("#0B0A14"), "align": "center", "base": "middle" })
		Gx.text(self, String(o.sub).to_upper(), 490, 33, { "size": 16, "weight": 500, "color": Color(0.89, 0.9, 0.93, 0.62), "align": "right", "base": "middle" })
		if o.get("duo", false): _duo(acc)
		else: _single(acc)
		if o.has("call"): _call(o.call)

	func _single(acc: Color) -> void:
		var nx := 22.0
		if o.mark == 0 or o.mark == 1:
			Gx.marker(self, o.mark, 38, 102, 13, { "color": acc })
			nx = 64.0
		Gx.text(self, String(o.name).to_upper(), nx, 118, { "size": 44, "weight": 800, "color": Color("#ECEAF6") })
		Gx.text(self, str(o.score), 490, 122, { "size": 58, "weight": 700, "mono": true, "color": Color("#F4F6FA"), "align": "right" })
		var fr := Score.frames(o.rolls)
		var bw := (468.0 - 9 * 4) / 10
		for f in 10:
			var q: Dictionary = fr[f]
			var x := 22 + f * (bw + 4)
			var y := 160.0
			var on: bool = f == int(o.live)
			Gx.rrect(self, x, y, bw, 76, 6, Color(1, 1, 1, 0.10 if on else 0.04), acc if on else Color(1, 1, 1, 0.16), 3.0 if on else 1.5)
			Gx.text(self, ("" if f == 9 else " ").join(Score.marks(q, f)), x + bw / 2, y + 28, { "size": 20, "weight": 500, "mono": true, "align": "center" })
			if q.total >= 0: Gx.text(self, str(q.total), x + bw / 2, y + 62, { "size": 22, "weight": 700, "mono": true, "color": Color("#F4F6FA"), "align": "center" })

	## Both bowlers: name and total on top, ten frames under, the bowler up highlighted.
	func _duo(acc: Color) -> void:
		for i in 2:
			var r: Dictionary = o.rows[i]
			var col: Color = Tune.PCOL[int(r.c)]
			var ry := 58.0 + i * 96
			if r.on: Gx.rrect(self, 14, ry - 4, 484, 92, 10, Color(col.r, col.g, col.b, 0.14))
			Gx.marker(self, int(r.c), 32, ry + 16, 9, { "color": col })
			Gx.text(self, Tune.NAMES[int(r.c)].to_upper(), 50, ry + 25, { "size": 26, "weight": 800, "color": col if r.on else Color("#ECEAF6"), "glow": col if r.on else Color(0, 0, 0, 0) })
			Gx.text(self, str(r.score), 492, ry + 28, { "size": 36, "weight": 700, "mono": true, "color": Color("#F4F6FA"), "align": "right" })
			var fr := Score.frames(r.rolls)
			var cw := (472.0 - 9 * 3) / 10.4
			var x := 20.0
			for f in 10:
				var q: Dictionary = fr[f]
				var w := cw * 1.4 if f == 9 else cw
				var live: bool = f == int(r.live)
				Gx.rrect(self, x, ry + 40, w, 44, 5, Color(1, 1, 1, 0.10 if live else 0.04), col if live else Color(1, 1, 1, 0.16), 2.5 if live else 1.2)
				Gx.text(self, ("" if f == 9 else " ").join(Score.marks(q, f)), x + w / 2, ry + 56, { "size": 13, "weight": 700, "mono": true, "align": "center" })
				if q.total >= 0: Gx.text(self, str(q.total), x + w / 2, ry + 77, { "size": 15, "weight": 700, "mono": true, "color": Color("#F4F6FA"), "align": "center" })
				x += w + 3

	## The result, the way an alley's screens show it: a big word in the bowler's colour that punches in, then fades.
	func _call(q: Dictionary) -> void:
		var col: Color = Tune.TEXT if int(q.c) < 0 else Tune.PCOL[int(q.c)]
		var a := clampf(minf(float(q.age) / 0.12, float(q.left) / 0.35), 0.0, 1.0)
		var big: bool = q.text in ["Strike", "Turkey", "Spare"] or String(q.text).ends_with("WINS") or q.text == "A DRAW"
		var punch := 1.0 + 0.35 * maxf(0.0, 1.0 - float(q.age) / 0.25)
		Gx.rrect(self, 10, 54, 492, 192, 12, Color(0.02, 0.016, 0.05, 0.93 * a))
		for i in 7:                                      # light bars sweeping behind the word
			var bx := fmod(float(q.age) * 420.0 + i * 80.0, 600.0) - 60.0
			draw_colored_polygon(PackedVector2Array([Vector2(bx, 246), Vector2(bx + 26, 246), Vector2(bx + 66, 54), Vector2(bx + 40, 54)]), Color(col.r, col.g, col.b, 0.10 * a))
		var size := int((76 if big else 56) * punch)
		var word: String = String(q.text).to_upper()
		Gx.text(self, word, 256, 150 + size * 0.35, { "size": size, "weight": 800, "color": Color(col.r, col.g, col.b, a), "align": "center", "glow": Color(col.r, col.g, col.b, a) })
		if q.sub != "": Gx.text(self, String(q.sub).to_upper(), 256, 222, { "size": 20, "weight": 700, "color": Color(0.93, 0.92, 0.97, 0.85 * a), "align": "center", "track": 2.0 })
