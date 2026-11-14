class_name Fx
extends Node3D
## GPU particles in the hall: a puff of lacquer dust and chips where the ball meets the pins, and confetti over the deck on a strike.
## Both are built once and restarted; they are fired once below the floor while the hall loads, so their shaders are compiled
## before the first shot rather than in the middle of it.

var dust: GPUParticles3D
var chips: GPUParticles3D
var confetti: GPUParticles3D
var scale_k := 1.0                  # the graphics tier trims the counts

var _soft: GradientTexture2D

## A round, soft-edged sprite, so dust reads as puffs rather than squares.
func _soft_dot() -> GradientTexture2D:
	var g := Gradient.new()
	g.set_color(0, Color(1, 1, 1, 1))
	g.set_color(1, Color(1, 1, 1, 0))
	g.add_point(0.35, Color(1, 1, 1, 0.75))
	var t := GradientTexture2D.new()
	t.gradient = g
	t.fill = GradientTexture2D.FILL_RADIAL
	t.fill_from = Vector2(0.5, 0.5)
	t.fill_to = Vector2(1.0, 0.5)
	t.width = 64; t.height = 64
	return t

func _quad_mat(additive: bool, soft := true) -> StandardMaterial3D:
	var m := StandardMaterial3D.new()
	m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	m.vertex_color_use_as_albedo = true
	m.vertex_color_is_srgb = true                 # particle colours are given in sRGB, like everything else here
	m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	m.billboard_mode = BaseMaterial3D.BILLBOARD_PARTICLES
	m.billboard_keep_scale = true
	if additive: m.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
	m.disable_receive_shadows = true
	if soft: m.albedo_texture = _soft
	return m

func _ramp(cols: Array, offs: Array) -> GradientTexture1D:
	var g := Gradient.new()
	g.offsets = PackedFloat32Array(offs)
	g.colors = PackedColorArray(cols)
	var t := GradientTexture1D.new()
	t.gradient = g
	return t

func _make(amount: int, life: float, mesh: Mesh, pm: ParticleProcessMaterial) -> GPUParticles3D:
	var p := GPUParticles3D.new()
	p.amount = amount
	p.lifetime = life
	p.one_shot = true
	p.explosiveness = 0.95
	p.emitting = false
	p.process_material = pm
	p.draw_pass_1 = mesh
	p.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	p.visibility_aabb = AABB(Vector3(-2, -1, -2), Vector3(4, 4, 4))
	p.fixed_fps = 60
	p.interpolate = true
	add_child(p)
	return p

func _ready() -> void:
	_soft = _soft_dot()
	# dust: soft, warm-white, quick, drifting up and out from the contact
	var q := QuadMesh.new()
	q.size = Vector2(0.09, 0.09)
	q.material = _quad_mat(true)
	var pm := ParticleProcessMaterial.new()
	pm.direction = Vector3(0, 0.6, 1)
	pm.spread = 75.0
	pm.initial_velocity_min = 0.4
	pm.initial_velocity_max = 1.6
	pm.gravity = Vector3(0, -1.2, 0)
	pm.damping_min = 1.5; pm.damping_max = 3.0
	pm.scale_min = 0.4; pm.scale_max = 1.3
	pm.scale_curve = _curve([Vector2(0, 0.6), Vector2(1, 1.6)])
	pm.color_ramp = _ramp([Color(1, 0.93, 0.82, 0.0), Color(1, 0.93, 0.82, 0.35), Color(1, 0.9, 0.8, 0.0)], [0.0, 0.12, 1.0])
	pm.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_SPHERE
	pm.emission_sphere_radius = 0.05
	dust = _make(40, 0.8, q, pm)
	# chips: small bright flecks thrown hard, falling fast
	var q2 := QuadMesh.new()
	q2.size = Vector2(0.012, 0.012)
	q2.material = _quad_mat(true)
	var pm2 := ParticleProcessMaterial.new()
	pm2.direction = Vector3(0, 0.5, -1)
	pm2.spread = 80.0
	pm2.initial_velocity_min = 1.5
	pm2.initial_velocity_max = 4.0
	pm2.gravity = Vector3(0, -9.8, 0)
	pm2.color_ramp = _ramp([Color(2.2, 2.0, 1.8, 1), Color(1.2, 1.0, 0.8, 0)], [0.0, 1.0])
	chips = _make(30, 0.5, q2, pm2)
	# confetti: paper flakes in the bowler's colour, white and magenta, thrown up over the deck and fluttering down
	var q3 := QuadMesh.new()
	q3.size = Vector2(0.04, 0.02)
	var cm := _quad_mat(false, false)
	cm.billboard_mode = BaseMaterial3D.BILLBOARD_DISABLED
	cm.cull_mode = BaseMaterial3D.CULL_DISABLED
	q3.material = cm
	var pm3 := ParticleProcessMaterial.new()
	pm3.direction = Vector3(0, 1, 0.2)
	pm3.spread = 55.0
	pm3.initial_velocity_min = 1.0
	pm3.initial_velocity_max = 2.4
	pm3.gravity = Vector3(0, -2.4, 0)
	pm3.damping_min = 1.0; pm3.damping_max = 2.2
	pm3.angular_velocity_min = -540.0; pm3.angular_velocity_max = 540.0
	pm3.angle_min = 0.0; pm3.angle_max = 360.0
	pm3.particle_flag_rotate_y = true
	pm3.turbulence_enabled = true
	pm3.turbulence_noise_strength = 0.6
	pm3.turbulence_noise_scale = 1.6
	pm3.turbulence_influence_min = 0.05; pm3.turbulence_influence_max = 0.2
	pm3.color_ramp = _ramp([Color(1, 1, 1, 1), Color(1, 1, 1, 1), Color(1, 1, 1, 0)], [0.0, 0.75, 1.0])
	pm3.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_BOX
	pm3.emission_box_extents = Vector3(0.55, 0.05, 0.3)
	confetti = _make(240, 2.6, q3, pm3)
	confetti.explosiveness = 0.85
	# fire everything once out of sight, so the first real shot has nothing to compile
	for p in [dust, chips, confetti]:
		p.position = Vector3(0, -8, 0)
		p.restart()
		p.emitting = true

func _curve(pts: Array) -> CurveTexture:
	var c := Curve.new()
	for p in pts: c.add_point(p)
	var t := CurveTexture.new()
	t.curve = c
	return t

func impact(at: Vector3, speed: float) -> void:
	for p in [dust, chips]:
		p.position = at
		p.amount_ratio = clampf(speed / 9.0, 0.35, 1.0) * scale_k
		p.restart()
		p.emitting = true

func strike(col: Color, reduced: bool) -> void:
	var pm: ParticleProcessMaterial = confetti.process_material
	pm.color_initial_ramp = _ramp([col, col, Color(0.95, 0.95, 1.0), Tune.MAG, col], [0.0, 0.45, 0.6, 0.8, 1.0])   # mostly the bowler's colour
	confetti.position = Vector3(0, 0.45, -(Tune.HEAD + 0.25))
	confetti.amount_ratio = (0.3 if reduced else 1.0) * scale_k
	confetti.restart()
	confetti.emitting = true

## Clear everything in the air (the replay starts clean, then plays its own impact).
func clear() -> void:
	for p in [dust, chips, confetti]:
		p.emitting = false
		p.restart()
		p.emitting = false
