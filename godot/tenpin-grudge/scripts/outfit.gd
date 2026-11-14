class_name Outfit
## Loose bowling clothes, built from a Quaternius base body when the game starts (once per body, then shared):
##   * a boxy, untucked bowling shirt that hangs straight down from the chest, with short, flared sleeves;
##   * straight-leg trousers, loose from the knee down, breaking over the shoes.
## Each garment is the body's own triangles over that region, pushed out and reshaped in the T-pose, with flat hems
## cut where it ends. The garments keep the body's skin weights, so they move with the skeleton; the shirt's weights
## are moved off the legs onto the pelvis so its hem hangs from the hips instead of riding up with each step, and the
## trouser cuffs are moved off the feet onto the shins. Every vertex also carries its position in the garment's T-pose
## shape (x, y in UV2, z in COLOR.r as z * 2 + 0.5) for the cloth shader's pattern.
## The rig faces +Z in this space, +Y is up.

const SHIRT_OFF := 0.016        # how far the shirt stands off the body
const TROUSER_OFF := 0.01
const CUFF_R := 0.07            # trouser leg radius from the knee down (a straight leg)

static var _cache := {}

## Landmarks on this body, from its skeleton's rest pose (skeleton space).
static func zones(sk: Skeleton3D) -> Dictionary:
	var at := func(b: String) -> Vector3: return sk.get_bone_global_rest(sk.find_bone(b)).origin
	var pel: Vector3 = at.call("pelvis")
	var ua: Vector3 = at.call("upperarm_r")
	var la: Vector3 = at.call("lowerarm_r")
	var foot: Vector3 = at.call("foot_r")
	return {
		"collar": at.call("neck_01").y + 0.005,
		"chest": at.call("spine_03").y - 0.02,
		"hem": pel.y - 0.02,                                   # the shirt's hem: just below the hip bones
		"armpit": ua.y - 0.08,
		"shoulder": absf(ua.x) - 0.01,
		"sleeve": absf(ua.x) + 0.42 * absf(la.x - ua.x),
		"top": pel.y + 0.09,                                   # the trousers' waistband
		"cuff": foot.y + 0.05,                                 # the trousers' hem, over the top of the shoe
		"crotch": at.call("thigh_r").y - 0.09,
		"knee": at.call("calf_r").y,
		"thigh_l": at.call("thigh_l"), "thigh_r": at.call("thigh_r"),
		"foot_l": at.call("foot_l"), "foot_r": at.call("foot_r"),
		"shoe": foot.y + 0.045,
	}

## { shirt: ArrayMesh, trousers: ArrayMesh } for this body.
static func make(key: String, src: Mesh, skin: Skin, sk: Skeleton3D) -> Dictionary:
	if _cache.has(key): return _cache[key]
	var z := zones(sk)
	var bind := {}                                              # bone name -> bind index in the skin
	for i in skin.get_bind_count():
		var bn := skin.get_bind_name(i)
		if bn == "" and skin.get_bind_bone(i) >= 0: bn = sk.get_bone_name(skin.get_bind_bone(i))
		bind[String(bn)] = i
	var arr := src.surface_get_arrays(0)
	var shirt_w := {}                                           # weights to move: from bind -> to bind
	for b in ["thigh_l", "thigh_r", "calf_l", "calf_r", "foot_l", "foot_r", "ball_l", "ball_r"]:
		if bind.has(b): shirt_w[bind[b]] = bind.pelvis
	var trouser_w := {}
	for s in ["l", "r"]:
		for b in ["foot_", "ball_"]:
			if bind.has(b + s): trouser_w[bind[b + s]] = bind["calf_" + s]
	var out := {
		"shirt": _garment(arr, z, true, shirt_w),
		"trousers": _garment(arr, z, false, trouser_w),
	}
	_cache[key] = out
	return out

static func _is_arm(p: Vector3, z: Dictionary) -> bool:
	return absf(p.x) > z.shoulder and (p.y > z.armpit or absf(p.x) > z.shoulder + 0.12)    # (out along x in the T-pose)

## Is this T-pose point inside the garment (grown by m metres)?
static func _inside(p: Vector3, z: Dictionary, shirt: bool, m: float) -> bool:
	if shirt:
		if _is_arm(p, z): return absf(p.x) <= z.sleeve + m
		return p.y >= z.hem - m and p.y <= z.collar + m
	if _is_arm(p, z): return false
	return p.y >= z.cuff - m and p.y <= z.top + m

## Pull a point that is just outside the garment back onto its edge, so the hem is a clean line.
static func _clamp(p: Vector3, z: Dictionary, shirt: bool) -> Vector3:
	if shirt:
		if _is_arm(p, z): p.x = signf(p.x) * minf(absf(p.x), z.sleeve)
		else: p.y = clampf(p.y, z.hem, z.collar)
	else:
		p.y = clampf(p.y, z.cuff, z.top)
	return p

static func _garment(arr: Array, z: Dictionary, shirt: bool, reweight: Dictionary) -> ArrayMesh:
	var v: PackedVector3Array = arr[Mesh.ARRAY_VERTEX]
	var nrm: PackedVector3Array = arr[Mesh.ARRAY_NORMAL]
	var uv: PackedVector2Array = arr[Mesh.ARRAY_TEX_UV]
	var bones: PackedInt32Array = arr[Mesh.ARRAY_BONES]
	var wts: PackedFloat32Array = arr[Mesh.ARRAY_WEIGHTS]
	var idx: PackedInt32Array = arr[Mesh.ARRAY_INDEX]
	var per := bones.size() / v.size()
	# the triangles over the garment, and the vertices they use
	var remap := {}
	var tris := PackedInt32Array()
	for t in range(0, idx.size(), 3):
		var a := idx[t]; var b := idx[t + 1]; var c := idx[t + 2]
		var m := 0.035
		if not (_inside(v[a], z, shirt, m) and _inside(v[b], z, shirt, m) and _inside(v[c], z, shirt, m)): continue
		if not (_inside(v[a], z, shirt, 0.0) or _inside(v[b], z, shirt, 0.0) or _inside(v[c], z, shirt, 0.0)): continue
		for k in [a, b, c]:
			if not remap.has(k): remap[k] = remap.size()
			tris.append(remap[k])
	var n := remap.size()
	var rest := PackedVector3Array(); rest.resize(n)
	var pos := PackedVector3Array(); pos.resize(n)
	var uvs := PackedVector2Array(); uvs.resize(n)
	var uv2 := PackedVector2Array(); uv2.resize(n)
	var col := PackedColorArray(); col.resize(n)
	var bo := PackedInt32Array(); bo.resize(n * per)
	var wo := PackedFloat32Array(); wo.resize(n * per)
	for k in remap:
		var i: int = remap[k]
		rest[i] = _clamp(v[k], z, shirt)
		uvs[i] = uv[k]
		for j in per:
			var bi := bones[k * per + j]
			bo[i * per + j] = reweight.get(bi, bi)
			wo[i * per + j] = wts[k * per + j]
	# the shape: stand off the body, then loosen
	var ring := _chest_ring(v, z) if shirt else PackedFloat32Array()
	for k in remap:
		var i: int = remap[k]
		var p := rest[i]
		var nn := nrm[k].normalized()
		if shirt:
			var arm := _is_arm(p, z)
			var off := SHIRT_OFF
			if arm: off += 0.008 * smoothstep(z.shoulder, z.sleeve, absf(p.x))      # the sleeves flare to the cuff
			else: off += 0.008 * smoothstep(z.hem + 0.08, z.hem, p.y)             # and the hem stands off a little more
			var q := p + nn * off
			if not arm and p.y < z.chest:                                           # below the chest it hangs straight down
				var t := smoothstep(z.chest, z.chest - 0.12, p.y)
				var cz: float = ring[ring.size() - 1]
				var d := Vector2(q.x, q.z - cz)
				var r := d.length()
				if r > 1e-4:
					var R := _ring_at(ring, d) + off * 0.8
					if r < R: d = d / r * lerpf(r, R, t)
					q.x = d.x; q.z = d.y + cz
			pos[i] = q
		else:
			var q := p + nn * TROUSER_OFF
			if p.y < z.crotch:                                                      # each leg: straight from the knee down
				var s := "l" if p.x > 0.0 else "r"
				var th: Vector3 = z["thigh_" + s]
				var ft: Vector3 = z["foot_" + s]
				var c := ft.lerp(th, clampf((p.y - ft.y) / (th.y - ft.y), 0.0, 1.0))
				var d := Vector2(q.x - c.x, q.z - c.z)
				var r := d.length()
				var t := smoothstep(z.knee + 0.14, z.knee - 0.04, p.y)
				var R := lerpf(r + 0.006, maxf(r, CUFF_R + 0.006 * smoothstep(z.knee, z.cuff, p.y)), t)
				if r > 1e-4: d = d / r * maxf(r, R)
				q.x = c.x + d.x; q.z = c.z + d.y
			pos[i] = q
	for i in n:                                                 # the pattern goes by the garment's own shape, so panels hang straight
		uv2[i] = Vector2(pos[i].x, pos[i].y)
		col[i] = Color(clampf(pos[i].z * 2.0 + 0.5, 0.0, 1.0), 0, 0, 1)
	var out := []
	out.resize(Mesh.ARRAY_MAX)
	out[Mesh.ARRAY_VERTEX] = pos
	var ns := _normals(pos, rest, tris)
	var agree := 0.0
	for k in remap: agree += ns[remap[k]].dot(nrm[k])
	if agree < 0.0:                                             # (whichever way the winding runs, face outwards)
		for i in ns.size(): ns[i] = -ns[i]
	out[Mesh.ARRAY_NORMAL] = ns
	out[Mesh.ARRAY_TEX_UV] = uvs
	out[Mesh.ARRAY_TEX_UV2] = uv2
	out[Mesh.ARRAY_COLOR] = col
	out[Mesh.ARRAY_BONES] = bo
	out[Mesh.ARRAY_WEIGHTS] = wo
	out[Mesh.ARRAY_INDEX] = tris
	var am := ArrayMesh.new()
	am.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, out, [], {}, Mesh.ARRAY_FLAG_USE_8_BONE_WEIGHTS if per == 8 else 0)
	return am

## The body's outline round the chest: the furthest the body reaches, in 48 directions round the torso's centre line.
## The last entry is the centre's z.
static func _chest_ring(v: PackedVector3Array, z: Dictionary) -> PackedFloat32Array:
	const N := 48
	var sel := []
	var cz := 0.0
	for p in v:
		if absf(p.y - z.chest) < 0.03 and not _is_arm(p, z) and absf(p.x) < z.shoulder:
			sel.append(p); cz += p.z
	cz /= maxf(1.0, sel.size())
	var ring := PackedFloat32Array(); ring.resize(N + 1)
	for p in sel:
		var d := Vector2(p.x, p.z - cz)
		var b := int(fposmod(atan2(d.x, d.y) / TAU * N, N))
		ring[b] = maxf(ring[b], d.length())
	var sm := ring.duplicate()
	for b in N:                                                 # fill gaps and smooth
		var a := 0.0; var w := 0.0
		for o in range(-2, 3):
			var r: float = ring[(b + o + N) % N]
			if r > 0.0: a += r * (3 - absi(o)); w += 3 - absi(o)
		sm[b] = a / maxf(w, 1e-6)
	sm[N] = cz
	return sm

static func _ring_at(ring: PackedFloat32Array, d: Vector2) -> float:
	var N := ring.size() - 1
	var f := fposmod(atan2(d.x, d.y) / TAU * N, N)
	var b := int(f)
	return lerpf(ring[b], ring[(b + 1) % N], f - b)

## Smooth normals, shared across UV seams (vertices at the same T-pose spot).
static func _normals(pos: PackedVector3Array, rest: PackedVector3Array, tris: PackedInt32Array) -> PackedVector3Array:
	var key := {}
	var acc := PackedVector3Array(); acc.resize(pos.size())
	var grp := PackedInt32Array(); grp.resize(pos.size())
	for i in pos.size():
		var kk := rest[i].snapped(Vector3(1e-4, 1e-4, 1e-4))
		if not key.has(kk): key[kk] = i
		grp[i] = key[kk]
	for t in range(0, tris.size(), 3):
		var a := tris[t]; var b := tris[t + 1]; var c := tris[t + 2]
		var fn := (pos[b] - pos[a]).cross(pos[c] - pos[a])
		acc[grp[a]] += fn; acc[grp[b]] += fn; acc[grp[c]] += fn
	var out := PackedVector3Array(); out.resize(pos.size())
	for i in pos.size(): out[i] = acc[grp[i]].normalized()
	return out
