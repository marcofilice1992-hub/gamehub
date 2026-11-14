extends Node
## Pulls the clips the bowlers use out of Quaternius's Universal Animation Library 1 and 2 (CC0) into one small
## AnimationLibrary, so the game ships only those clips and not the two 7 MB source files.
##   godot --headless tools/make_clips.tscn -- --src=/path/to/folder/with/UAL1_Standard.glb+UAL2_Standard.glb
const KEEP := {
	"UAL1_Standard.glb": ["Idle_Loop", "Idle_Talking_Loop", "Dance_Loop", "Jump_Start", "Jump_Loop", "Jump_Land", "Hit_Chest",
		"Sitting_Idle_Loop", "Sitting_Talking_Loop", "Walk_Loop", "Interact", "PickUp_Table"],
	"UAL2_Standard.glb": ["Idle_FoldArms_Loop", "Idle_No_Loop", "Yes", "Idle_Rail_Call", "Idle_TalkingPhone_Loop", "Consume",
		"Walk_Carry_Loop", "Hit_Knockback"],
}
func _ready() -> void:
	var src := "/tmp/ual-src"
	for a in OS.get_cmdline_user_args():
		if a.begins_with("--src="): src = a.substr(6)
	var lib := AnimationLibrary.new()
	for f in KEEP:
		var doc := GLTFDocument.new()
		var st := GLTFState.new()
		if doc.append_from_file(src.path_join(f), st) != OK:
			push_error("can't read " + f); get_tree().quit(1); return
		var s := doc.generate_scene(st)
		var ap: AnimationPlayer = s.find_children("*", "AnimationPlayer", true, false)[0]
		for n in KEEP[f]:
			var a: Animation = ap.get_animation(n).duplicate(true)
			a.loop_mode = Animation.LOOP_LINEAR if n.ends_with("_Loop") else Animation.LOOP_NONE
			lib.add_animation(n, a)
		s.free()
	var err := ResourceSaver.save(lib, "res://characters/clips.res", ResourceSaver.FLAG_COMPRESS)
	print("saved ", lib.get_animation_list().size(), " clips: ", err)
	get_tree().quit()
