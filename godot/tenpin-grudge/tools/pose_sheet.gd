extends Node3D
## Renders a contact sheet of the bowlers in each pose and clip, for checking the rig by eye.
##   xvfb-run godot --rendering-driver vulkan tools/pose_sheet.tscn -- --out=/tmp/sheet.png [--side]
const LOOKS := [
	{ "skin": "#F2D0B5", "shirt": "#6EA2FF", "panel": "#16234A", "trousers": "#2A2D3A", "shoes": "#2F6BFF", "hair": "quiff", "hair_col": "#3B2A20", "height": 1.0 },
	{ "skin": "#D9A57E", "shirt": "#F2A93B", "panel": "#3D2410", "trousers": "#2B2630", "shoes": "#E24A3B", "hair": "ponytail", "hair_col": "#6B2E17", "height": 1.0 },
]
var bw: Array = []
var ball: MeshInstance3D
func _ready() -> void:
	var out := "/tmp/sheet.png"
	var side := false
	var back := false
	var only := ""
	for a in OS.get_cmdline_user_args():
		if a.begins_with("--out="): out = a.substr(6)
		if a == "--side": side = true
		if a == "--back": back = true
		if a.begins_with("--only="): only = a.substr(7)
	var env := WorldEnvironment.new()
	env.environment = Environment.new()
	env.environment.background_mode = Environment.BG_COLOR
	env.environment.background_color = Color("#2a2d38")
	env.environment.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.environment.ambient_light_color = Color("#9aa0b0")
	env.environment.ambient_light_energy = 0.6
	env.environment.tonemap_mode = Environment.TONE_MAPPER_AGX
	add_child(env)
	var sun := DirectionalLight3D.new()
	sun.rotation = Vector3(-0.7, 0.5, 0)
	sun.light_energy = 1.6
	sun.shadow_enabled = true
	add_child(sun)
	var fl := MeshInstance3D.new(); var pm := PlaneMesh.new(); pm.size = Vector2(8, 8); fl.mesh = pm; add_child(fl)
	for i in 2:
		var b := Bowler.new()
		add_child(b)
		b.build(LOOKS[i])
		b.position = Vector3(-0.55 + 1.1 * i, 0, 0)
		bw.append(b)
	ball = MeshInstance3D.new(); var sm := SphereMesh.new(); sm.radius = 0.108; sm.height = 0.216; ball.mesh = sm
	var bm := StandardMaterial3D.new(); bm.albedo_color = Color("#3355ff"); ball.material_override = bm; add_child(ball)
	var cam := Camera3D.new()
	add_child(cam)
	if side: cam.position = Vector3(3.6, 1.1, 0.0)
	elif back: cam.position = Vector3(0.8, 1.5, 2.6)
	else: cam.position = Vector3(1.1, 1.25, -3.3)
	cam.look_at(Vector3(0, 0.9, 0))
	cam.fov = 40
	get_viewport().size = Vector2i(560, 420)
	var cfg := [
		["rest", func(b, t): return b._blank(), "full", "Idle_Loop"],
		["hold", func(b, t): return b.p_hold(t), "full", "Idle_Loop"],
		["hold/upper", func(b, t): return b.p_hold(t), "upper", "Idle_Loop"],
		["appr .25", func(b, t): return b.p_approach(0.25, 0.6, 0.0), "full", "Idle_Loop"],
		["appr .55", func(b, t): return b.p_approach(0.55, 0.6, 0.0), "full", "Idle_Loop"],
		["appr .85", func(b, t): return b.p_approach(0.85, 0.6, 0.0), "full", "Idle_Loop"],
		["appr 1", func(b, t): return b.p_approach(1.0, 1.0, 0.0), "full", "Idle_Loop"],
		["rel .1", func(b, t): return b.p_release(0.1, 0.6), "full", "Idle_Loop"],
		["rel .5", func(b, t): return b.p_release(0.5, 0.6), "full", "Idle_Loop"],
		["cheer", func(b, t): return b.p_cheer(t, true), "full", "Idle_Loop"],
		["slump", func(b, t): return b.p_slump(t), "full", "Idle_Loop"],
		["clap", func(b, t): return b.p_clap(t), "upper", "Idle_Loop"],
		["heckle", func(b, t): return b.p_heckle(t), "upper", "Idle_Loop"],
	]
	for c in ["Idle_Loop", "Idle_Talking_Loop", "Idle_FoldArms_Loop", "Idle_No_Loop", "Yes", "Dance_Loop", "Jump_Loop", "Jump_Start", "Hit_Chest", "Hit_Knockback", "Idle_Rail_Call", "Idle_TalkingPhone_Loop", "Consume", "Interact", "PickUp_Table", "Walk_Carry_Loop", "Sitting_Idle_Loop"]:
		cfg.append([c, func(b, t): return b.pose, "none", c])
	var imgs := []
	if only != "": cfg = cfg.filter(func(c): return c[0] in only.split(","))
	for c in cfg:
		for b in bw:
			b.snap(c[1].call(b, 0.0), 0.0, c[3], c[2])
		for f in 24:
			for b in bw:
				b.act(c[1].call(b, b.clock()), 1.0 / 30.0, 30.0, -0.17 if c[0].begins_with("appr") or c[0].begins_with("rel") else 0.0, false, c[3], c[2])
		var hold: bool = c[0] in ["hold", "hold/upper"]
		ball.visible = c[0].begins_with("appr") or c[0].begins_with("rel .1") or hold
		ball.position = bw[0].ball_at_chest() if hold else bw[0].ball_in_hand()
		await RenderingServer.frame_post_draw
		await RenderingServer.frame_post_draw
		imgs.append(get_viewport().get_texture().get_image())
		print(imgs.size() - 1, ": ", c[0])
	var cols := mini(6, imgs.size())
	var w := 560; var h := 420
	var sheet := Image.create(w * cols, h * ((imgs.size() + cols - 1) / cols), false, Image.FORMAT_RGBA8)
	for i in imgs.size():
		var im: Image = imgs[i]
		im.convert(Image.FORMAT_RGBA8)
		sheet.blit_rect(im, Rect2i(0, 0, w, h), Vector2i((i % cols) * w, (i / cols) * h))
	sheet.save_png(out)
	get_tree().quit()
