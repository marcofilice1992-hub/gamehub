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
var boards := {}                      # lane offset -> { vp, draw, key }
var racks: MultiMeshInstance3D
var nb: Array = []                    # the neighbours' lanes
var nb_balls: Array = []
var pin_mesh: ArrayMesh
var pin_mat := StandardMaterial3D.new()
var R := RandomNumberGenerator.new()
var qual := 0
var slow_t := 0.0
var ema := 1.0 / 60.0
var _roll_q := Quaternion.IDENTITY
var _replay_last := Vector3.ZERO

func _add(mesh: Mesh, mat: Material, x: float, y: float, d: float, parent: Node = self) -> MeshInstance3D:
	var mi := MeshInstance3D.new()
	mi.mesh = mesh
	if mat: mi.material_override = mat
	mi.position = Vector3(x, y, -d)
	parent.add_child(mi)
	return mi

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
	var len := D + 1.5
	var mid := (D - 1.5) / 2
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
	env.tonemap_mode = Environment.TONE_MAPPER_ACES
	env.tonemap_exposure = 1.0
	env.glow_enabled = true
	env.glow_intensity = 0.7
	env.glow_bloom = 0.04
	env.glow_hdr_threshold = 1.0
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
	sun.look_at_from_position(Vector3(1.4, 9, 3), Vector3(0, 0, -10))
	add_child(sun)
	deck_light = SpotLight3D.new()
	deck_light.light_color = Color("#FFF6EA")
	deck_light.light_energy = 1.1
	deck_light.spot_range = 6.0
	deck_light.spot_angle = 46.0
	deck_light.shadow_enabled = true
	deck_light.look_at_from_position(Vector3(0, 0.95, -(D + 0.1)), Vector3(0, 0, -(Tune.HEAD + 0.25)))
	add_child(deck_light)
	var front := SpotLight3D.new()
	front.light_color = Color("#FFE8CC")
	front.light_energy = 3.5
	front.spot_range = 10.0
	front.spot_angle = 48.0
	front.look_at_from_position(Vector3(0, 3, 0.5), Vector3(0, 0, -3))
	add_child(front)
	var decks := SpotLight3D.new()
	decks.light_color = Color("#FFF1E4")
	decks.light_energy = 0.8
	decks.spot_range = 4.4
	decks.spot_angle = 77.0
	decks.look_at_from_position(Vector3(0, 1.3, -(D + 0.4)), Vector3(0, 0, -(Tune.HEAD + 0.2)))
	add_child(decks)
	for s in [-1, 1]:
		for pair in [[4.0, VIO], [13.0, MAG]]:
			var pl := OmniLight3D.new()
			pl.light_color = pair[1]
			pl.light_energy = 2.4
			pl.omni_range = 7.5
			pl.position = Vector3(s * (3.5 * PITCH - 0.7), 1.7, -pair[0])
			add_child(pl)
	screen_glow = OmniLight3D.new()
	screen_glow.light_color = MAG
	screen_glow.light_energy = 1.2
	screen_glow.omni_range = 5.0
	screen_glow.position = Vector3(0, 2.1, -(D - 0.3))
	add_child(screen_glow)

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
	for n in range(-NL, NL + 1):
		var cx := n * PITCH
		var lm := ShaderMaterial.new()
		lm.shader = lane_shader
		lm.set_shader_parameter("oil", m.oil.len if n == 0 else 12.0)
		lm.set_shader_parameter("dim", 1.0 if n == 0 else 0.62)
		lm.set_shader_parameter("seed", 7.0 + absf(n) * 3.1)
		_add(plane, lm, cx, 0, mid)
		for s in [-1, 1]: _add(gut, gut_mat, cx + s * (Tune.LW + Tune.GW / 2), 0, mid)
		if n < NL:
			_add(_box(0.3, 0.06, len), cap_mat, cx + PITCH / 2, 0.03, mid)
			if n == -1 or n == 0:                            # the lane-side lights that take the bowler's colour
				var led := _add(_box(0.012, 0.012, len), strip_mat, cx + PITCH / 2 + (0.14 if n else -0.14), 0.062, mid)
				leds.append(led)
		for s in [-1, 1]:
			_add(_box(0.06, 0.68, 3.4), k_box, cx + s * (far + 0.03), 0.34, D - 0.5)
			var art := QuadMesh.new()
			art.size = Vector2(3.4, 0.68)
			var a := _add(art, k_mat, cx + s * (far - 0.001), 0.34, D - 0.5)
			a.rotation.y = -s * PI / 2
	# ---- the walls, the approach floor, the pit curtain ----
	for s in [-1, 1]:
		var wall := QuadMesh.new()
		wall.size = Vector2(D + 14, 4.6)
		var w := _add(wall, _mat("#0D0C17", 0.8), s * HALL, 2.2, (D - 14) / 2 + 0.3)
		w.rotation.y = -s * PI / 2
		for pair in [[0.95, MAG], [2.7, VIO]]:
			_add(_box(0.04, 0.035, D + 14), _neon(pair[1], 2.4), s * (HALL - 0.24), pair[0], (D - 14) / 2 + 0.3)
		var dd := -6.0
		while dd < D:
			_add(_box(0.2, 4.6, 0.5), _mat("#15132A", 0.6), s * (HALL - 0.1), 2.2, dd)
			dd += 4.0
	_add(_box(HALL * 2, 0.1, 12), _mat("#221A24", 0.8), 0, -0.05, -7.5)
	_add(_box(HALL * 2, 0.02, 1.4), _mat("#050608", 0.9), 0, -0.34, D + 0.7)
	var curtain := QuadMesh.new()
	curtain.size = Vector2(HALL * 2, 1.8)
	_add(curtain, _mat("#16161B", 1.0), 0, 0.4, Tune.PIT + 0.08)
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
	for i in 12: _add(_box(HALL * 2 - 0.4, 0.05, 0.16), _neon("#C8CCD6", 1.7), 0, 4.2, 3 + i * 2.4)
	_add(_box(HALL * 2, 0.02, 40), _mat("#06050C", 1.0), 0, 4.27, -12)
	for s in [-1, 1]: bumpers.append(_add(_box(0.02, 0.06, D), strip_mat, s * (Tune.LW + 0.002), 0.03, D / 2))
	sweep = _add(_box(far * 2, 0.05, 0.02), _mat("#A3ACBB", 0.45, 0.1), 0, 1.2, Tune.HEAD - 0.4)

	# ---- pins: a smooth lathe profile, glossy white with two red neck stripes ----
	pin_mesh = _pin_mesh()
	var img := Image.create(4, 256, false, Image.FORMAT_RGBA8)
	img.fill(Color("#F7F4EE"))
	for y in 256:
		var hgt := (1.0 - y / 255.0) * 0.381
		if (hgt > 0.249 and hgt < 0.262) or (hgt > 0.271 and hgt < 0.284):
			for xx in 4: img.set_pixel(xx, y, Color("#C81E2C"))
	pin_mat.albedo_texture = ImageTexture.create_from_image(img)
	pin_mat.roughness = 0.3
	pin_mat.clearcoat_enabled = true
	pin_mat.clearcoat = 1.0
	pin_mat.clearcoat_roughness = 0.06
	for i in 10:
		var p := _add(pin_mesh, pin_mat, 0, 0, 0)
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

	cam = Camera3D.new()
	cam.fov = 27.0
	cam.near = 0.05
	cam.far = 80.0
	cam.current = true
	add_child(cam)
	cam.position = pos
	cam.look_at(look)

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

func _pin_mesh() -> ArrayMesh:
	var raw := [Vector2(0.026, 0), Vector2(0.031, 0.012), Vector2(0.046, 0.06), Vector2(0.0585, 0.105), Vector2(0.0605, 0.127), Vector2(0.057, 0.16),
		Vector2(0.045, 0.2), Vector2(0.032, 0.236), Vector2(0.0255, 0.262), Vector2(0.0238, 0.282), Vector2(0.0255, 0.3), Vector2(0.031, 0.322),
		Vector2(0.0325, 0.338), Vector2(0.03, 0.358), Vector2(0.021, 0.373), Vector2(0.0001, 0.381)]
	var prof := _smooth(raw, 6)
	prof.push_front(Vector2(0.0001, 0))
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	var segs := 40
	for i in prof.size() - 1:
		var a: Vector2 = prof[i]
		var b: Vector2 = prof[i + 1]
		var tang := (b - a).normalized()
		var nrm := Vector2(tang.y, -tang.x)               # outward in (r, y)
		for j in segs:
			var t0 := TAU * j / segs
			var t1 := TAU * (j + 1) / segs
			var q := [[a, t0], [b, t0], [b, t1], [a, t0], [b, t1], [a, t1]]
			for v in q:
				var pp: Vector2 = v[0]
				var th: float = v[1]
				st.set_normal(Vector3(nrm.x * cos(th), nrm.y, nrm.x * sin(th)).normalized())
				st.set_uv(Vector2(th / TAU, 1.0 - pp.y / 0.381))
				st.add_vertex(Vector3(maxf(0.0001, pp.x) * cos(th), pp.y - Tune.COG, maxf(0.0001, pp.x) * sin(th)))
	st.index()
	return st.commit()

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

func _display() -> void:
	var t := m.turn
	var over := m.state == "over" or m.state == "done"
	var who: Dictionary = m.P[m.won] if over and m.won >= 0 else m.cur
	var c: int = who.c
	var sub := "Final" if over else "First to bowl" if m.state == "intro" else ("Roll-off %d" % t.ro) if not t.is_empty() and t.ro else ("Frame %d · Ball %d" % [t.f + 1, t.b + 1]) if not t.is_empty() else ""
	var draw := over and m.won < 0
	_board(0, { "lane": 14, "name": ("A draw" if draw else Tune.NAMES[c] + " wins") if over else Tune.NAMES[c], "sub": sub, "rolls": who.rolls.duplicate(), "score": Score.shown(who.rolls),
		"accent": Tune.TEXT.to_html(false) if draw else Tune.PCOL[c].to_html(false), "mark": -1 if draw else c,
		"live": -1 if over or t.is_empty() or t.ro or who != m.cur else t.f, "main": true })

# ---- every frame ----------------------------------------------------------------------------------------
func _process(dt: float) -> void:
	if m == null: return
	dt = minf(dt, 0.1)
	_quality(dt)
	if qual < 2: _neighbours(minf(dt, 0.05))
	_display()
	var st := m.state
	var c: int = m.cur.c
	var col: Color = Tune.PCOL[c]
	var fl := m.flash
	# strikes and spares: the deck light, the lane-side lights and the screen all lift together, then settle
	deck_light.light_energy = 1.1 * (1 + 0.8 * fl)
	strip_mat.albedo_color = Color(col.r * (1.2 + 2.5 * fl), col.g * (1.2 + 2.5 * fl), col.b * (1.2 + 2.5 * fl))
	screen_glow.light_color = col
	screen_glow.light_energy = 1.0 + 3.0 * fl
	var ln := m.lane
	var RF = m.rp_frame if st == "replay" else null
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
			if vis.visible:
				vis.position = b.position
				vis.quaternion = b.global_basis.get_rotation_quaternion()
	ball.material_override = ball_mats[c]
	for bm in bumpers: bm.visible = m.assist(m.cur) == 2 and st != "over" and st != "done"
	if st == "stance" or st == "swing" or st == "intro":
		var h := minf(1.0, m.sw.t / Tune.POWER_TIME) if st == "swing" else 0.0
		var e := h * h * (3 - 2 * h)
		ball.visible = st != "intro"
		ball.position = Vector3(m.x0, Tune.BR + 0.02 + e * 0.5, -Tune.START + e * 0.55)
		ball.quaternion = Quaternion(Vector3.RIGHT, -e * 2.2 - 0.6)
		_roll_q = ball.quaternion
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
			ball.position = b.position
			var v: Vector3 = b.linear_velocity
			var sp := Vector2(v.x, v.z).length()
			if sp > 0.05:
				var axis := Vector3(-v.z / sp, -m.spin * 0.5, v.x / sp).normalized()
				_roll_q = (Quaternion(axis, -sp * dt * ln.pace / Tune.BR) * _roll_q).normalized()
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
	if st == "replay":                                       # low inside the lane, pushing in slowly
		var t := minf(m.t, 6.0)
		px = 0.5 - t * 0.06; py = 0.3 + t * 0.012; pz = -(Tune.HEAD - 2.8 + t * 0.2)
		lx = 0; ly = 0.17; lz = -(Tune.HEAD + 0.3); rate = 9
	elif st == "roll" or st == "show":
		if ln.hit or st == "show" or not ln.live or ln.ball == null:
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

## Keep it responsive: if frames run long for a few seconds, render smaller, then drop SSR, SSAO and the neighbours.
func _quality(dt: float) -> void:
	ema += (dt - ema) * 0.05
	if qual >= 2 or OS.has_feature("fixed_quality"): return
	slow_t = slow_t + dt if ema > 1.0 / 42.0 else 0.0
	if slow_t > 3.0:
		qual += 1
		slow_t = 0.0
		var vp := get_viewport()
		vp.scaling_3d_scale = [1.0, 0.75, 0.6][qual]
		if qual == 2:
			env.ssr_enabled = false
			env.ssao_enabled = false
			deck_light.shadow_enabled = false
			racks.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF


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
		Gx.rrect(self, 5, 5, 502, 246, 16, Color("#14122A"), Color(acc.r, acc.g, acc.b, 1.0 if o.main else 0.55), 4.0 if o.main else 2.5)
		Gx.rrect(self, 20, 18, 72, 40, 10, acc)
		Gx.text(self, str(o.lane), 56, 39, { "size": 28, "weight": 800, "color": Color("#0B0A14"), "align": "center", "base": "middle" })
		Gx.text(self, String(o.sub).to_upper(), 490, 39, { "size": 18, "weight": 500, "color": Color(0.89, 0.9, 0.93, 0.62), "align": "right", "base": "middle" })
		var nx := 22.0
		if o.mark == 0 or o.mark == 1:
			Gx.marker(self, o.mark, 38, 102, 13, { "color": acc })
			nx = 64.0
		Gx.text(self, String(o.name).to_upper(), nx, 118, { "size": 44, "weight": 800, "color": acc if o.main else Color("#ECEAF6") })
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
