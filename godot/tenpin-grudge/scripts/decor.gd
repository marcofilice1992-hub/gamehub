class_name Decor
extends Node3D
## The hall around the lanes: the approach and the concourse behind it, ball returns and seating, the side walls with
## their back-lit posters, the pit curtain and its black lights, the masking-unit trim, and dust in the air.
## None of it is touched by the physics.

const PITCH := 2 * (Tune.LW + Tune.GW) + 0.3
const NL := 3
const HALL := (NL + 0.5) * PITCH
const STEP := -4.6                     # where the approach ends and the concourse (one step up) begins
const STEP_H := 0.18
const VINYL := ["#1E7F7A", "#5B3FC4", "#A8264F"]
const POSTERS := [
	[0, "STRIKE NIGHT"], [1, "LANES 11 – 17"], [2, "COSMIC BOWL · FRIDAYS"],
	[3, "LEAGUE TUESDAYS"], [0, "NO MERCY"], [2, "GLOW AFTER DARK"],
]

var dust: GPUParticles3D
var R := RandomNumberGenerator.new()

func _mi(mesh: Mesh, mat: Material, pos: Vector3, shadow := false) -> MeshInstance3D:
	var m := MeshInstance3D.new()
	m.mesh = mesh
	m.material_override = mat
	m.position = pos
	m.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON if shadow else GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(m)
	return m

func _box(w: float, h: float, l: float) -> BoxMesh:
	var b := BoxMesh.new()
	b.size = Vector3(w, h, l)
	return b

func _mat(col, rough: float, metal := 0.0, coat := false) -> StandardMaterial3D:
	var s := StandardMaterial3D.new()
	s.albedo_color = Color(col)
	s.roughness = rough
	s.metallic = metal
	if coat:
		s.clearcoat_enabled = true
		s.clearcoat = 0.6
		s.clearcoat_roughness = 0.2
	return s

func _shader(path: String, params := {}) -> ShaderMaterial:
	var m := ShaderMaterial.new()
	m.shader = load(path)
	for k in params: m.set_shader_parameter(k, params[k])
	return m

func build(lane_shader: Shader) -> void:
	R.seed = 41
	_approach(lane_shader)
	_concourse()
	_ball_returns()
	_walls()
	_pit()
	_masking()
	_dust()

## The approach: the same maple as the lanes, one wide floor from the foul line back to the concourse step.
func _approach(lane_shader: Shader) -> void:
	var len := -0.3 - STEP
	var q := PlaneMesh.new()
	q.size = Vector2(HALL * 2, len)
	q.subdivide_width = 8
	var m := ShaderMaterial.new()
	m.shader = lane_shader
	m.set_shader_parameter("dim", 0.82)
	m.set_shader_parameter("repeat", PITCH)
	m.set_shader_parameter("oil", 0.0)
	m.set_shader_parameter("seed", 3.0)
	_mi(q, m, Vector3(0, 0, -(STEP + len / 2)))
	_mi(_box(HALL * 2, 0.4, len), _mat("#05050A", 1.0), Vector3(0, -0.201, -(STEP + len / 2)))

## The concourse: one step up, carpeted, with a brushed edge on the step.
func _concourse() -> void:
	var deep := 9.0
	var carpet := PlaneMesh.new()
	carpet.size = Vector2(HALL * 2, deep)
	_mi(carpet, _shader("res://shaders/carpet.gdshader"), Vector3(0, STEP_H, -(STEP - deep / 2)))
	_mi(_box(HALL * 2, STEP_H, deep), _mat("#0A0A14", 1.0), Vector3(0, STEP_H / 2 - 0.001, -(STEP - deep / 2) + 0.001))
	_mi(_box(HALL * 2, 0.025, 0.05), _mat("#B8BEC8", 0.25, 0.9), Vector3(0, STEP_H, -(STEP - 0.02)))
	var led := StandardMaterial3D.new()                      # a strip of light under the step nose
	led.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	led.albedo_color = Color(1.4, 0.5, 1.3)
	_mi(_box(HALL * 2, 0.012, 0.012), led, Vector3(0, STEP_H - 0.03, -(STEP - 0.05)))

## A ball return for each pair of lanes: a hood over the return track, and a rack of house balls.
func _ball_returns() -> void:
	var hood_mat := _mat("#1B1830", 0.35, 0.2, true)
	var rack_mat := _mat("#9AA3B2", 0.3, 0.85)
	var glow := StandardMaterial3D.new()
	glow.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	glow.albedo_color = Color(0.9, 0.55, 1.6)
	var hood := CapsuleMesh.new()
	hood.radius = 0.24
	hood.height = 1.3
	var ball := SphereMesh.new()
	ball.radius = Tune.BR
	ball.height = Tune.BR * 2
	ball.radial_segments = 24
	ball.rings = 12
	var cols := ["#E64980", "#20C997", "#5C7CFA", "#FFB020", "#9B5CFF", "#F8F0E3", "#FF6B3D"]
	for n in [-3, -1, 1, 3]:
		var x: float = (n + 0.5) * PITCH
		if absf(x) > HALL - 0.4: continue
		var h := _mi(hood, hood_mat, Vector3(x, 0.02, 1.9), true)
		h.rotation.x = PI / 2
		h.scale = Vector3(1, 1, 0.72)                        # a low, rounded hood
		_mi(_box(0.5, 0.01, 1.25), glow, Vector3(x, 0.025, 1.9))   # light leaking from under it
		var rack := _mi(_box(0.34, 0.04, 1.0), rack_mat, Vector3(x, 0.36, 3.1), true)
		rack.rotation.x = -0.05
		_mi(_box(0.06, 0.34, 0.06), rack_mat, Vector3(x, 0.17, 2.65))
		_mi(_box(0.06, 0.34, 0.06), rack_mat, Vector3(x, 0.17, 3.55))
		for i in 4:
			var bm := _mat(cols[R.randi() % cols.size()], 0.15, 0.0, true)
			_mi(ball, bm, Vector3(x + (R.randf() - 0.5) * 0.02, 0.38 + Tune.BR, 2.72 + i * 0.235), true)

## Seating on the concourse, one group per pair of lanes: a bench in coloured vinyl and a small table.
func _concourse_furniture() -> void:
	var seat_d := STEP - 1.8
	var k := 0
	for n in [-3, -1, 1, 3]:
		var x: float = (n + 0.5) * PITCH
		if absf(x) > HALL - 0.6: continue
		var vinyl := _mat(VINYL[k % VINYL.size()], 0.28, 0.0, true)
		k += 1
		var base_y := STEP_H
		_mi(_box(1.5, 0.42, 0.55), vinyl, Vector3(x, base_y + 0.21, -(seat_d - 0.25)), true)          # seat
		_mi(_box(1.5, 0.5, 0.18), vinyl, Vector3(x, base_y + 0.55, -(seat_d - 0.55)), true)           # back
		for s in [-1, 1]:
			_mi(_box(0.18, 0.62, 0.7), vinyl, Vector3(x + s * 0.84, base_y + 0.31, -(seat_d - 0.32)), true)   # arms
		var top := CylinderMesh.new()
		top.top_radius = 0.32; top.bottom_radius = 0.32; top.height = 0.03
		_mi(top, _mat("#E9E4DA", 0.3, 0.0, true), Vector3(x, base_y + 0.55, -(seat_d + 0.55)), true)
		var post := CylinderMesh.new()
		post.top_radius = 0.03; post.bottom_radius = 0.12; post.height = 0.54
		_mi(post, _mat("#2A2F3A", 0.3, 0.8), Vector3(x, base_y + 0.27, -(seat_d + 0.55)), true)
		var lamp := SpotLight3D.new()                        # a warm pendant over each group
		lamp.light_color = Color("#FFD9A8")
		lamp.light_energy = 1.6
		lamp.spot_range = 3.6
		lamp.spot_angle = 38.0
		lamp.position = Vector3(x, 2.9, -(seat_d + 0.1))
		lamp.rotation.x = -PI / 2
		add_child(lamp)
		var shade := CylinderMesh.new()
		shade.top_radius = 0.08; shade.bottom_radius = 0.22; shade.height = 0.2
		var sm := _mat("#1A1726", 0.4, 0.5)
		_mi(shade, sm, Vector3(x, 2.95, -(seat_d + 0.1)))
		var bulb := StandardMaterial3D.new()
		bulb.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
		bulb.albedo_color = Color(2.2, 1.7, 1.2)
		var disc := CylinderMesh.new()
		disc.top_radius = 0.17; disc.bottom_radius = 0.17; disc.height = 0.005
		_mi(disc, bulb, Vector3(x, 2.85, -(seat_d + 0.1)))
		_mi(_box(0.01, 1.3, 0.01), sm, Vector3(x, 3.65, -(seat_d + 0.1)))

## Side walls: acoustic panels with a faint cosmic pattern, and back-lit posters between the pilasters.
func _walls() -> void:
	_concourse_furniture()
	var wm := _shader("res://shaders/wall.gdshader")
	for s in [-1, 1]:
		var wall := QuadMesh.new()
		wall.size = Vector2(Tune.DECK + 14, 4.6)
		var w := _mi(wall, wm, Vector3(s * (HALL - 0.002), 2.2, -((Tune.DECK - 14) / 2 + 0.3)))
		w.rotation.y = -s * PI / 2
	var box := QuadMesh.new()
	box.size = Vector2(2.4, 1.3)
	var frame := _box(0.08, 1.42, 2.52)
	var frame_mat := _mat("#0B0A12", 0.4, 0.6)
	var pal := [[Tune.MAG, Tune.VIO, Tune.PCOL[0]], [Tune.VIO, Tune.MAG, Color("#20C997")], [Color("#FFB020"), Tune.MAG, Tune.VIO], [Tune.PCOL[0], Tune.VIO, Tune.MAG]]
	var i := 0
	for s in [-1, 1]:
		var d := -4.0
		while d < Tune.DECK - 2:
			var p: Array = POSTERS[i % POSTERS.size()]
			var c: Array = pal[i % pal.size()]
			_mi(frame, frame_mat, Vector3(s * (HALL - 0.05), 1.8, -d))
			var pm := _shader("res://shaders/poster.gdshader", { "design": p[0], "c1": c[0], "c2": c[1], "c3": c[2] })
			var q := _mi(box, pm, Vector3(s * (HALL - 0.095), 1.8, -d))
			q.rotation.y = -s * PI / 2
			var t := Label3D.new()
			t.text = p[1]
			t.font = Gx.font(800)
			t.font_size = 96
			t.pixel_size = 0.0016
			t.outline_size = 0
			t.modulate = Color(1.3, 1.3, 1.35)
			t.shaded = false
			t.position = Vector3(s * (HALL - 0.1), 1.8 - 0.47, -d)
			t.rotation.y = -s * PI / 2
			add_child(t)
			var light := OmniLight3D.new()                       # posters throw a little coloured light
			light.light_color = c[0]
			light.light_energy = 0.35
			light.omni_range = 2.2
			light.position = Vector3(s * (HALL - 0.6), 1.8, -d)
			add_child(light)
			i += 1
			d += 4.0

## The pit: a folded black curtain with glow paint, and black lights that pick it out.
func _pit() -> void:
	var q := QuadMesh.new()
	q.size = Vector2(HALL * 2, 1.8)
	_mi(q, _shader("res://shaders/curtain.gdshader"), Vector3(0, 0.4, -(Tune.PIT + 0.08)))
	for n in range(-NL, NL + 1):
		var uv := OmniLight3D.new()
		uv.light_color = Color("#6A3CFF")
		uv.light_energy = 0.5
		uv.omni_range = 1.2
		uv.position = Vector3(n * PITCH, 0.35, -(Tune.PIT - 0.25))
		uv.light_volumetric_fog_energy = 0.0
		add_child(uv)

## Masking units: a lit strip along the bottom edge and slim neon dividers between the lane screens.
func _masking() -> void:
	var edge := StandardMaterial3D.new()
	edge.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	edge.albedo_color = Color(0.9, 0.85, 1.4)
	_mi(_box(PITCH * (2 * NL + 1), 0.014, 0.02), edge, Vector3(0, 0.645, -(Tune.DECK + 0.13)))
	var div := StandardMaterial3D.new()
	div.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	div.albedo_color = Color(Tune.VIO.r * 2.0, Tune.VIO.g * 2.0, Tune.VIO.b * 2.0)
	for n in range(-NL, NL):
		_mi(_box(0.012, 0.8, 0.012), div, Vector3((n + 0.5) * PITCH, 1.13, -(Tune.DECK + 0.13)))

## Dust in the air: slow motes, lit by whatever light they drift through, so they show in the deck lights and the cans.
func _dust() -> void:
	var q := QuadMesh.new()
	q.size = Vector2(0.004, 0.004)
	var m := StandardMaterial3D.new()
	m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	m.billboard_mode = BaseMaterial3D.BILLBOARD_PARTICLES
	m.albedo_color = Color(1, 0.97, 0.9, 0.45)
	m.albedo_texture = _dot()
	m.disable_ambient_light = true                 # only direct light shows them: they appear in the beams and vanish in the dark
	m.disable_receive_shadows = true
	q.material = m
	var pm := ParticleProcessMaterial.new()
	pm.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_BOX
	pm.emission_box_extents = Vector3(1.0, 0.75, 3.2)
	pm.gravity = Vector3(0, -0.004, 0)
	pm.initial_velocity_min = 0.0
	pm.initial_velocity_max = 0.03
	pm.spread = 180.0
	pm.turbulence_enabled = true
	pm.turbulence_noise_strength = 0.15
	pm.turbulence_noise_scale = 4.0
	pm.turbulence_influence_min = 0.02; pm.turbulence_influence_max = 0.06
	pm.color_ramp = _fade()
	dust = GPUParticles3D.new()
	dust.amount = 220
	dust.lifetime = 14.0
	dust.preprocess = 14.0
	dust.process_material = pm
	dust.draw_pass_1 = q
	dust.position = Vector3(0, 1.0, -(Tune.HEAD - 2.2))          # over the back end and the deck, where the close cameras look
	dust.visibility_aabb = AABB(Vector3(-1.5, -1.2, -4), Vector3(3, 2.6, 8))
	dust.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(dust)

func _dot() -> GradientTexture2D:
	var g := Gradient.new()
	g.set_color(0, Color(1, 1, 1, 1))
	g.set_color(1, Color(1, 1, 1, 0))
	var t := GradientTexture2D.new()
	t.gradient = g
	t.fill = GradientTexture2D.FILL_RADIAL
	t.fill_from = Vector2(0.5, 0.5)
	t.fill_to = Vector2(1.0, 0.5)
	t.width = 32; t.height = 32
	return t

func _fade() -> GradientTexture1D:
	var g := Gradient.new()
	g.offsets = PackedFloat32Array([0.0, 0.2, 0.8, 1.0])
	g.colors = PackedColorArray([Color(1, 1, 1, 0), Color(1, 1, 1, 1), Color(1, 1, 1, 1), Color(1, 1, 1, 0)])
	var t := GradientTexture1D.new()
	t.gradient = g
	return t

func set_tier(t: int) -> void:
	if dust: dust.visible = t >= 1
