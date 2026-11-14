class_name Score
## Ten-pin scoring as pure functions over a list of pin counts, one per ball.

## One entry per frame: { balls: [...], done: bool, total: int or -1 while a bonus is pending }.
static func frames(rolls: Array) -> Array:
	var out := []
	var i := 0
	var sum := 0
	var live := true
	for f in 10:
		var a = rolls[i] if i < rolls.size() else null
		var b = rolls[i + 1] if i + 1 < rolls.size() else null
		var c = rolls[i + 2] if i + 2 < rolls.size() else null
		var balls := []
		var sc := -1
		var done := false
		if f < 9:
			if a == 10:
				balls = [10]
				done = true
				if b != null and c != null: sc = 10 + b + c
				i += 1
			else:
				for v in [a, b]:
					if v != null: balls.append(v)
				done = b != null
				if done:
					if a + b == 10:
						if c != null: sc = 10 + c
					else:
						sc = a + b
				i += 2
		else:
			for v in [a, b, c]:
				if v != null: balls.append(v)
			done = balls.size() == 3 or (balls.size() == 2 and a != 10 and a + b < 10)
			if done: sc = a + b + (c if c != null else 0)
		if sc >= 0 and live:
			sum += sc
		else:
			live = false
		out.append({ "balls": balls, "done": done, "total": sum if live else -1 })
	return out

## Pins on the deck before this player's next ball.
static func standing(rolls: Array) -> int:
	var fr := frames(rolls)
	for f in 10:
		if fr[f].done: continue
		var bs: Array = fr[f].balls
		if bs.is_empty(): return 10
		var a: int = bs[0]
		if f < 9 or bs.size() == 1: return 10 if a == 10 else 10 - a
		var b: int = bs[1]
		if a == 10: return 10 if b == 10 else 10 - b
		return 10
	return 0

## The score with every remaining ball either a strike (best) or a miss.
static func fill(rolls: Array, best: bool) -> Array:
	var r := rolls.duplicate()
	var n := 0
	while n < 24 and not frames(r)[9].done:
		r.append(standing(r) if best else 0)
		n += 1
	return r

static func shown(rolls: Array) -> int:
	var t := 0
	for f in frames(rolls):
		if f.total >= 0: t = f.total
	return t

static func final_score(rolls: Array) -> int:
	return maxi(0, frames(rolls)[9].total)

static func _sym(v: int) -> String:
	return "-" if v == 0 else str(v)

## The marks for one frame: X, /, - and pin counts.
static func marks(fr: Dictionary, f: int) -> Array:
	var bs: Array = fr.balls
	var out := []
	if bs.is_empty(): return out
	var a: int = bs[0]
	out.append("X" if a == 10 else _sym(a))
	if bs.size() < 2: return out
	var b: int = bs[1]
	if f < 9:
		out.append("/" if a + b == 10 else _sym(b))
		return out
	out.append(("X" if b == 10 else _sym(b)) if a == 10 else ("/" if a + b == 10 else _sym(b)))
	if bs.size() > 2:
		var c: int = bs[2]
		out.append("/" if a == 10 and b != 10 and b + c == 10 else ("X" if c == 10 else _sym(c)))
	return out

## Strikes, spares and open frames so far.
static func tally(rolls: Array) -> Dictionary:
	var s := { "strikes": 0, "spares": 0, "open": 0 }
	var fr := frames(rolls)
	for f in 10:
		var bs: Array = fr[f].balls
		if bs.is_empty(): continue
		var a: int = bs[0]
		var b = bs[1] if bs.size() > 1 else null
		var c = bs[2] if bs.size() > 2 else null
		if f < 9:
			if a == 10: s.strikes += 1
			elif b != null:
				if a + b == 10: s.spares += 1
				else: s.open += 1
			continue
		if a == 10:
			s.strikes += 1
			if b == 10:
				s.strikes += 1
				if c == 10: s.strikes += 1
			elif b != null and c != null and b + c == 10: s.spares += 1
		elif b != null:
			if a + b == 10:
				s.spares += 1
				if c == 10: s.strikes += 1
			else: s.open += 1
	return s

## Head pin down, and the standing pins form two or more separate groups.
static func is_split(up: Array) -> bool:
	if up.has(0) or up.size() < 2: return false
	var spots := Tune.spots()
	var seen := { up[0]: true }
	var todo := [up[0]]
	while not todo.is_empty():
		var a: Vector2 = spots[todo.pop_back()]
		for j in up:
			if not seen.has(j) and a.distance_to(spots[j]) < Tune.SP * 1.05:
				seen[j] = true
				todo.append(j)
	return seen.size() < up.size()
