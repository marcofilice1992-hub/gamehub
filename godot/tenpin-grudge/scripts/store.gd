extends Node
## What the game remembers between sessions: settings, the head-to-head record, each colour's ball and hook,
## and whether the first-game coaching has been seen. Saved as JSON in the user folder.

const PATH := "user://tenpin-grudge.json"
var data := {
	"settings": { "volume": 7, "rumble": true, "reduced_motion": false, "fullscreen": true },
	"assists": [0, 0],
	"wins": [0, 0], "draws": 0, "last_loser": -1, "best": 0,
	"balls": [1, 1], "hooks": [3, 3], "coached": false,
}
var memory := false            # tests run without touching the disk

func _ready() -> void:
	if FileAccess.file_exists(PATH):
		var f := FileAccess.open(PATH, FileAccess.READ)
		var got = JSON.parse_string(f.get_as_text())
		if got is Dictionary:
			for k in got:
				if data.has(k) and typeof(data[k]) == TYPE_DICTIONARY and got[k] is Dictionary: data[k].merge(got[k], true)
				elif data.has(k): data[k] = got[k]
	apply_settings()

func get_setting(k: String, fallback = null):
	return data.settings.get(k, fallback)

func set_setting(k: String, v) -> void:
	data.settings[k] = v
	apply_settings()
	flush()

func apply_settings() -> void:
	var bus := AudioServer.get_bus_index("Master")
	var vol: int = data.settings.volume
	AudioServer.set_bus_mute(bus, vol == 0)
	AudioServer.set_bus_volume_db(bus, linear_to_db(max(0.0001, vol / 10.0)))

func reduced() -> bool:
	return bool(data.settings.reduced_motion)

func flush() -> void:
	if memory: return
	var f := FileAccess.open(PATH, FileAccess.WRITE)
	if f: f.store_string(JSON.stringify(data, "  "))
