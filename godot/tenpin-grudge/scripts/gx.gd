class_name Gx
## The HUD drawing kit, ported from the browser engine's G: panels, text, markers and button pictures, in a 1920×1080 frame.
## Every function draws onto the CanvasItem passed in, from inside its _draw().

const FS := { "xs": 22, "sm": 28, "md": 36, "lg": 52, "xl": 96 }
const S1 := Color("#11151C")
const S3 := Color("#202632")
const BAR := Color("#07090D")
const LINE := Color(1, 1, 1, 0.07)
const LINE2 := Color(1, 1, 1, 0.14)
const PANEL := Color(0.067, 0.082, 0.11, 0.86)
const PSOFT := [Color(0.431, 0.635, 1.0, 0.16), Color(0.949, 0.663, 0.231, 0.16)]

static var _fonts := {}
static var _boxes := {}

static func font(weight := 400, mono := false, track := 0.0) -> Font:
	var key := "%d%s%.1f" % [weight, mono, track]
	if _fonts.has(key): return _fonts[key]
	var file: String = "GeistMono-" + ("Bold" if weight >= 700 else "Medium") if mono else "Geist-" + ({400: "Regular", 500: "Medium", 700: "Bold", 800: "ExtraBold"}.get(weight, "Regular"))
	var f: Font = load("res://fonts/%s.ttf" % file)
	if track != 0.0:
		var v := FontVariation.new()
		v.base_font = f
		v.spacing_glyph = int(round(track))
		f = v
	_fonts[key] = f
	return f

static func measure(s: String, o := {}) -> float:
	var f := font(o.get("weight", 400), o.get("mono", false), o.get("track", 0.0))
	var txt: String = s.to_upper() if o.get("upper", false) else s
	return f.get_string_size(txt, HORIZONTAL_ALIGNMENT_LEFT, -1, int(o.get("size", FS.sm))).x

## Text with its baseline at y (or its middle, with base = "middle"). align: left, center, right.
static func text(ci: CanvasItem, s: String, x: float, y: float, o := {}) -> void:
	var size := int(o.get("size", FS.sm))
	var f := font(o.get("weight", 400), o.get("mono", false), o.get("track", 0.0))
	var txt: String = s.to_upper() if o.get("upper", false) else s
	var w := f.get_string_size(txt, HORIZONTAL_ALIGNMENT_LEFT, -1, size).x
	var al: String = o.get("align", "left")
	if al == "center": x -= w / 2
	elif al == "right": x -= w
	if o.get("base", "") == "middle": y += (f.get_ascent(size) - f.get_descent(size)) / 2.0
	var col: Color = o.get("color", Tune.TEXT)
	col.a *= o.get("alpha", 1.0)
	if o.has("glow"):                                    # a soft halo, like the neon on the lane screens
		var g: Color = o.glow
		for k in [[int(size * 0.32), 0.10], [int(size * 0.18), 0.18], [int(size * 0.08), 0.35]]:
			ci.draw_string_outline(f, Vector2(x, y), txt, HORIZONTAL_ALIGNMENT_LEFT, -1, size, k[0], Color(g.r, g.g, g.b, g.a * k[1] * o.get("alpha", 1.0)))
	ci.draw_string(f, Vector2(x, y), txt, HORIZONTAL_ALIGNMENT_LEFT, -1, size, col)

static func eyebrow(ci: CanvasItem, s: String, x: float, y: float, o := {}) -> void:
	var oo := { "size": FS.xs, "weight": 500, "color": Tune.MUTED, "track": 1.6, "upper": true }
	oo.merge(o, true)
	text(ci, s, x, y, oo)

static func rrect(ci: CanvasItem, x: float, y: float, w: float, h: float, r: float, fill = null, stroke = null, lw := 2.0) -> void:
	var key := "%s|%s|%.0f|%.1f" % [fill, stroke, r, lw]
	var sb: StyleBoxFlat = _boxes.get(key)
	if sb == null:
		sb = StyleBoxFlat.new()
		sb.bg_color = fill if fill != null else Color(0, 0, 0, 0)
		sb.draw_center = fill != null
		sb.set_corner_radius_all(int(r))
		sb.corner_detail = 12
		sb.anti_aliasing = true
		if stroke != null:
			sb.border_color = stroke
			sb.set_border_width_all(int(lw))
		_boxes[key] = sb
	ci.draw_style_box(sb, Rect2(x, y, w, h))

## The lane-screen look, shared by the HUD scorecard and the screens over the lanes: deep indigo glass, top lighter.
const SCREEN_TOP := Color(0.102, 0.094, 0.204, 0.94)
const SCREEN_BOT := Color(0.043, 0.039, 0.090, 0.94)

static func grad_rrect(ci: CanvasItem, x: float, y: float, w: float, h: float, r: float, top: Color, bot: Color) -> void:
	var pts := PackedVector2Array()
	var cols := PackedColorArray()
	var corners := [[x + w - r, y + r, -PI / 2], [x + w - r, y + h - r, 0.0], [x + r, y + h - r, PI / 2], [x + r, y + r, PI]]
	for c in corners:
		for i in 7:
			var a: float = c[2] + PI / 2 * i / 6.0
			var p := Vector2(c[0] + cos(a) * r, c[1] + sin(a) * r)
			pts.append(p)
			cols.append(top.lerp(bot, clampf((p.y - y) / h, 0, 1)))
	ci.draw_polygon(pts, cols)

## A neon outline: the line itself and a halo around it.
static func glow_rrect(ci: CanvasItem, x: float, y: float, w: float, h: float, r: float, col: Color, lw := 3.0, glow := 1.0) -> void:
	for k in [[9.0, 0.06], [5.0, 0.12], [2.5, 0.22]]:
		var e: float = k[0]
		rrect(ci, x - e, y - e, w + e * 2, h + e * 2, r + e, null, Color(col.r, col.g, col.b, col.a * k[1] * glow), lw + 1)
	rrect(ci, x, y, w, h, r, null, col, lw)

## Every HUD box shares the lane-screen glass, so the HUD reads as part of the hall's screens.
static func panel(ci: CanvasItem, x: float, y: float, w: float, h: float, r := 14.0) -> void:
	screen(ci, x, y, w, h, r, Color(0.62, 0.55, 1.0, 0.22), 1.0, 1.5)

## Indigo glass with an outline; a = overall opacity, for things that fade in and out.
static func screen(ci: CanvasItem, x: float, y: float, w: float, h: float, r: float, border: Color, a := 1.0, lw := 3.0) -> void:
	grad_rrect(ci, x, y, w, h, r, Color(SCREEN_TOP, SCREEN_TOP.a * a), Color(SCREEN_BOT, SCREEN_BOT.a * a))
	rrect(ci, x, y, w, h, r, null, Color(border, border.a * a), lw)

static func circle(ci: CanvasItem, x: float, y: float, r: float, fill = null, stroke = null, lw := 2.0) -> void:
	if fill != null: ci.draw_circle(Vector2(x, y), r, fill, true, -1.0, true)
	if stroke != null: ci.draw_arc(Vector2(x, y), r, 0, TAU, 48, stroke, lw, true)

static func line(ci: CanvasItem, x1: float, y1: float, x2: float, y2: float, col: Color, lw := 2.0) -> void:
	ci.draw_line(Vector2(x1, y1), Vector2(x2, y2), col, lw, true)

## A player's mark: Blue is a circle, Amber a diamond. Shape and colour together, never colour alone.
static func marker(ci: CanvasItem, i: int, x: float, y: float, r: float, o := {}) -> void:
	var col: Color = o.get("color", Tune.PCOL[i])
	if i == 0:
		if o.get("hollow", false): ci.draw_arc(Vector2(x, y), r, 0, TAU, 40, col, o.get("lw", 3.0), true)
		else: ci.draw_circle(Vector2(x, y), r, col, true, -1.0, true)
	else:
		var d := r * 1.18
		var pts := PackedVector2Array([Vector2(x, y - d), Vector2(x + d, y), Vector2(x, y + d), Vector2(x - d, y)])
		if o.get("hollow", false):
			pts.append(pts[0])
			ci.draw_polyline(pts, col, o.get("lw", 3.0), true)
		else: ci.draw_colored_polygon(pts, col)

static func _names(type: String) -> Dictionary:
	return Pads.NAMES.get(type, Pads.NAMES.xbox)

static func _key(type: String) -> bool:
	return type == "kb1" or type == "kb2"

static func glyph_width(type: String, btn: String, s := 36.0) -> float:
	if btn in ["a", "b", "x", "y"] and not _key(type): return s
	return maxf(s, measure(_names(type).get(btn, btn), { "size": s * 0.5, "weight": 500 }) + s * 0.7)

## A button picture for a device type. Left edge at x, centred on y. Returns its width.
static func glyph(ci: CanvasItem, type: String, btn: String, x: float, y: float, s := 36.0, o := {}) -> float:
	var names := _names(type)
	var lit: bool = o.get("lit", false)
	var fill: Color = o.get("color", Tune.TEXT) if lit else S3
	var ink: Color = Tune.BG if lit else Tune.TEXT
	if btn in ["a", "b", "x", "y"] and not _key(type):
		var r := s / 2
		var cx := x + r
		circle(ci, cx, y, r, fill, null if lit else LINE2)
		if type == "ps":
			var k := r * 0.42
			var lw := maxf(2.0, s * 0.07)
			match btn:
				"a":
					ci.draw_line(Vector2(cx - k, y - k), Vector2(cx + k, y + k), ink, lw, true)
					ci.draw_line(Vector2(cx + k, y - k), Vector2(cx - k, y + k), ink, lw, true)
				"b": ci.draw_arc(Vector2(cx, y), k * 1.15, 0, TAU, 32, ink, lw, true)
				"x": ci.draw_rect(Rect2(cx - k, y - k, k * 2, k * 2), ink, false, lw)
				_: ci.draw_polyline(PackedVector2Array([Vector2(cx, y - k * 1.2), Vector2(cx + k * 1.2, y + k * 0.85), Vector2(cx - k * 1.2, y + k * 0.85), Vector2(cx, y - k * 1.2)]), ink, lw, true)
		else: text(ci, names.get(btn, btn), cx, y, { "size": s * 0.56, "weight": 700, "color": ink, "align": "center", "base": "middle" })
		return s
	var label: String = names.get(btn, btn)
	var w := glyph_width(type, btn, s)
	rrect(ci, x, y - s / 2, w, s, s * 0.2 if _key(type) else s / 2, fill, null if lit else LINE2)
	text(ci, label, x + w / 2, y, { "size": s * 0.5, "weight": 500, "color": ink, "align": "center", "base": "middle" })
	return w

## A row of "button + what it does" hints. items: [["a", "Play"], ["b", "Back"]]
static func hints(ci: CanvasItem, x: float, y: float, items: Array, type: String, o := {}) -> void:
	var s: float = o.get("size", 36.0)
	var fo := { "size": FS.xs, "color": Tune.MUTED, "base": "middle" }
	if o.get("align", "") == "right":
		var total := 0.0
		for it in items: total += glyph_width(type, it[0], s) + 12 + measure(it[1], fo) + 40
		x -= total - 40
	for it in items:
		x += glyph(ci, type, it[0], x, y, s, o) + 12
		if it[1] != "":
			text(ci, it[1], x, y, fo)
			x += measure(it[1], fo) + 40
		else: x += 4
