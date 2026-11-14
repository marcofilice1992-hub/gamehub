shader_type spatial;
// A swirled pearl ball in the bowler's colour, with three finger holes and the player's mark (circle or diamond) opposite.

uniform vec3 base : source_color = vec3(0.43, 0.64, 1.0);
uniform int mark = 0;
uniform float seed = 11.0;

varying vec3 n;

void vertex() { n = normalize(VERTEX); }

float h(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719)) + seed) * 43758.5453); }
float noise(vec3 p) {
	vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
	return mix(mix(mix(h(i), h(i + vec3(1,0,0)), f.x), mix(h(i + vec3(0,1,0)), h(i + vec3(1,1,0)), f.x), f.y),
		mix(mix(h(i + vec3(0,0,1)), h(i + vec3(1,0,1)), f.x), mix(h(i + vec3(0,1,1)), h(i + vec3(1,1,1)), f.x), f.y), f.z);
}

void fragment() {
	vec3 p = n * 2.2;
	float sw = noise(p + vec3(noise(p * 1.7) * 2.0, 0.0, noise(p * 1.3 + 4.0) * 2.0));
	float band = sin(sw * 14.0 + n.y * 3.0);
	vec3 col = mix(base * 0.85, mix(base, vec3(1.0), 0.38), smoothstep(-0.6, 0.9, band));
	col += 0.06 * smoothstep(0.92, 1.0, sin(noise(p * 4.0) * 40.0));
	float rough = 0.18;
	// finger holes, grouped around +z; the mark around -z
	vec3 holes[3] = { normalize(vec3(0.0, -0.32, 1.0)), normalize(vec3(-0.16, 0.18, 1.0)), normalize(vec3(0.16, 0.18, 1.0)) };
	float rad[3] = { 0.16, 0.12, 0.12 };
	for (int i = 0; i < 3; i++) {
		float a = acos(clamp(dot(n, holes[i]), -1.0, 1.0));
		float rim = smoothstep(rad[i] * 1.3, rad[i], a);
		col = mix(col, mix(col, vec3(1.0), 0.35), rim * (1.0 - step(a, rad[i])));
		if (a < rad[i]) { col = vec3(0.004); rough = 0.9; }
	}
	vec3 m = vec3(0.0, 0.0, -1.0);
	vec3 t1 = vec3(1.0, 0.0, 0.0);
	vec3 t2 = vec3(0.0, 1.0, 0.0);
	vec2 q = vec2(dot(n, t1), dot(n, t2)) * (dot(n, m) > 0.0 ? 1.0 : 99.0);
	float inside = mark == 0 ? step(length(q), 0.22) : step(abs(q.x) + abs(q.y), 0.27);
	float ring = smoothstep(0.012, 0.0, abs(length(q) - 0.36));
	col = mix(col, vec3(0.95, 0.96, 0.98), max(inside, ring * 0.6));
	ALBEDO = col;
	ROUGHNESS = rough;
	CLEARCOAT = 1.0;
	CLEARCOAT_ROUGHNESS = 0.04;
	SPECULAR = 0.6;
}
