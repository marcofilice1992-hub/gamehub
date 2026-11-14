shader_type spatial;
render_mode unshaded;
// Kickback artwork: a dark violet panel with neon slashes and faint scan lines.
uniform vec3 mag : source_color = vec3(1.0, 0.31, 0.85);
uniform vec3 vio : source_color = vec3(0.55, 0.42, 1.0);
uniform float glow = 1.6;
void fragment() {
	vec2 p = UV * vec2(1024.0, 300.0);
	vec3 col = mix(vec3(0.1, 0.082, 0.19), vec3(0.04, 0.035, 0.07), UV.y) * 0.5;
	float xs[5] = { 180.0, 250.0, 560.0, 620.0, 880.0 };
	float ws[5] = { 14.0, 8.0, 14.0, 6.0, 10.0 };
	for (int i = 0; i < 5; i++) {
		// a line from (x, 330) to (x + 160, -30)
		vec2 a = vec2(xs[i], 330.0); vec2 b = vec2(xs[i] + 160.0, -30.0);
		vec2 pa = p - a; vec2 ba = b - a;
		float dist = length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0));
		vec3 c = (i == 0 || i == 3 || i == 4) ? mag : vio;
		col += c * (smoothstep(ws[i] * 0.5, ws[i] * 0.3, dist) * glow + exp(-dist / 18.0) * 0.5);
	}
	col *= 1.0 + 0.06 * step(fract(p.y / 6.0), 0.17);
	ALBEDO = col;
}
