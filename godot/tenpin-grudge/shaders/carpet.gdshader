shader_type spatial;
// The concourse carpet: the classic bowling-alley pattern of planets, rings, squiggles and stars on deep navy,
// in dyes that glow a little under the black lights.

uniform float glow = 0.25;

varying vec2 xz;
void vertex() { xz = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xz; }

float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

void fragment() {
	vec2 p = xz * 2.2;
	vec2 id = floor(p);
	vec2 f = fract(p) - 0.5;
	float r = h(id);
	vec2 o = (vec2(h(id + 1.3), h(id + 5.9)) - 0.5) * 0.5;
	vec3 pal[4] = { vec3(1.0, 0.31, 0.85), vec3(0.55, 0.42, 1.0), vec3(0.2, 0.85, 0.8), vec3(1.0, 0.75, 0.25) };
	vec3 c = pal[int(h(id + 9.0) * 3.99)];
	vec3 col = vec3(0.02, 0.025, 0.06);
	float m = 0.0;
	if (r < 0.25) m = smoothstep(0.03, 0.0, length(f - o) - 0.16);                                  // a planet
	else if (r < 0.45) m = smoothstep(0.02, 0.0, abs(length(f - o) - 0.2)) ;                       // a ring
	else if (r < 0.7) m = smoothstep(0.025, 0.0, abs(f.y - o.y - 0.08 * sin(f.x * 18.0 + r * 9.0))) * step(abs(f.x), 0.35);   // a squiggle
	else m = smoothstep(0.05, 0.0, length(f - o)) ;                                                 // a star
	col = mix(col, c * 0.45, m);
	// pile texture
	col *= 0.85 + 0.15 * h(floor(xz * 300.0));
	ALBEDO = col;
	ROUGHNESS = 1.0;
	SPECULAR = 0.1;
	EMISSION = c * m * glow;
}
