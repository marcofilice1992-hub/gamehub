shader_type spatial;
// The pit curtain: heavy black cloth in soft folds, with a faint glow-paint pattern of pins and stars that
// the black lights in the pit pick out.

uniform vec3 paint : source_color = vec3(0.55, 0.42, 1.0);
uniform vec3 paint2 : source_color = vec3(1.0, 0.31, 0.85);
uniform float glow = 0.5;

varying vec3 wp;
void vertex() { wp = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz; }

float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

void fragment() {
	float x = wp.x;
	float y = wp.y;
	float f = sin(x * 26.0 + sin(x * 5.0) * 1.5);
	float slope = cos(x * 26.0 + sin(x * 5.0) * 1.5);
	vec3 col = vec3(0.022, 0.022, 0.028) * (0.8 + 0.25 * f);
	// glow paint: small stars scattered, and a band of tiny pins along the bottom
	vec2 g = vec2(x, y) * 7.0;
	vec2 id = floor(g);
	vec2 fr = fract(g) - 0.5;
	float rnd = h(id);
	vec2 o = vec2(h(id + 3.1), h(id + 7.7)) - 0.5;
	float star = smoothstep(0.06, 0.0, length(fr - o * 0.6)) * step(0.82, rnd);
	float px = fract(x * 4.0) - 0.5;
	float pin = step(abs(y - 0.12), 0.07) * step(abs(px), 0.045 - 0.025 * smoothstep(0.1, 0.17, y)) + step(length(vec2(px, y - 0.2)), 0.025);
	pin *= step(abs(y - 0.12), 0.11);
	ALBEDO = col;
	ROUGHNESS = 0.95;
	NORMAL_MAP = vec3(0.5 + slope * 0.35, 0.5, 1.0);
	EMISSION = paint * star * glow + paint2 * pin * glow * 0.7;
}
