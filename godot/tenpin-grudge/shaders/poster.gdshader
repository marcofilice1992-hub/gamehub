shader_type spatial;
render_mode unshaded;
// Back-lit wall posters, drawn in the shader: 0 a giant pin with rays, 1 a ball with speed streaks,
// 2 retro sunset stripes, 3 a strike cross in a starburst. Text sits on top as a Label3D.

uniform int design = 0;
uniform vec3 c1 : source_color = vec3(1.0, 0.31, 0.85);
uniform vec3 c2 : source_color = vec3(0.55, 0.42, 1.0);
uniform vec3 c3 : source_color = vec3(0.43, 0.64, 1.0);
uniform float bright = 1.6;

float pin_sdf(vec2 p) {                 // a pin outline: belly circle, neck, head circle
	float belly = length((p - vec2(0.0, -0.18)) / vec2(0.85, 1.0)) - 0.2;
	float head = length(p - vec2(0.0, 0.22)) - 0.085;
	float neck = max(abs(p.x) - 0.05 - 0.02 * smoothstep(0.1, -0.1, p.y), abs(p.y - 0.06) - 0.12);
	return min(min(belly, head), neck);
}

void fragment() {
	vec2 p = (UV - 0.5) * vec2(2.4 / 1.3, 1.0);   // aspect of a 2.4 x 1.3 m box
	vec3 bg = mix(vec3(0.05, 0.03, 0.12), vec3(0.16, 0.05, 0.22), UV.y);
	vec3 col = bg;
	float a = atan(p.y, p.x);
	if (design == 0) {
		float rays = smoothstep(0.6, 1.0, sin(a * 14.0)) * smoothstep(1.2, 0.2, length(p));
		col += c2 * rays * 0.35;
		float d = pin_sdf(p * 1.15 + vec2(-0.45, 0.05));
		col = mix(col, vec3(0.95, 0.94, 1.0), smoothstep(0.006, 0.0, d));
		col = mix(col, c1, smoothstep(0.004, 0.0, abs(p.y * 1.15 + 0.05 - 0.04) - 0.012) * step(d, 0.0));
		col += c1 * smoothstep(0.03, 0.0, abs(d)) * 0.6;
	} else if (design == 1) {
		vec2 b = p - vec2(0.5, -0.02);
		for (int i = 0; i < 6; i++) {
			float y = -0.25 + float(i) * 0.1;
			col += c3 * smoothstep(0.012, 0.0, abs(p.y - y)) * step(p.x, 0.2) * smoothstep(-0.9, 0.2, p.x) * 0.9;
		}
		float ball = length(b) - 0.3;
		vec3 bc = mix(c3 * 0.6, c3 * 1.3, smoothstep(-0.3, 0.3, sin(b.x * 14.0 + sin(b.y * 9.0) * 2.0)));
		col = mix(col, bc, smoothstep(0.006, 0.0, ball));
		for (int i = 0; i < 3; i++) {
			vec2 hp = b - vec2(0.08 * float(i) - 0.06, 0.12 - 0.05 * float(i % 2));
			col = mix(col, vec3(0.02), smoothstep(0.004, 0.0, length(hp) - 0.035));
		}
	} else if (design == 2) {
		float sun = length(p - vec2(0.0, -0.32)) - 0.42;
		vec3 sc = mix(c1, vec3(1.0, 0.7, 0.3), smoothstep(-0.5, 0.1, p.y));
		float cut = step(0.5, fract((p.y + 0.5) * 12.0)) + step(-0.2, p.y);
		col = mix(col, sc, smoothstep(0.006, 0.0, sun) * min(cut, 1.0));
		col += c2 * smoothstep(0.01, 0.0, abs(p.y + 0.32)) * 0.8;
		for (int i = 1; i < 6; i++) col += c2 * 0.3 * smoothstep(0.006, 0.0, abs(p.y + 0.32 + float(i) * float(i) * 0.012));
	} else {
		float burst = smoothstep(0.3, 1.0, sin(a * 10.0 + 0.5)) * smoothstep(0.9, 0.1, length(p));
		col += c1 * burst * 0.5;
		vec2 q = p * 1.3;
		float x1 = abs(q.x - q.y) / 1.414 - 0.05;
		float x2 = abs(q.x + q.y) / 1.414 - 0.05;
		float xx = min(x1, x2);
		xx = max(xx, max(abs(q.x), abs(q.y)) - 0.3);
		col = mix(col, vec3(1.0), smoothstep(0.006, 0.0, xx));
		col += c3 * smoothstep(0.04, 0.0, abs(xx)) * 0.7;
	}
	// a thin inner border
	vec2 e = abs(UV - 0.5);
	col += c2 * smoothstep(0.006, 0.0, abs(max(e.x - 0.47, e.y - 0.44)));
	ALBEDO = col * bright;
}
