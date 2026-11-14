shader_type spatial;
// The lane: 39 maple and pine boards with grain, the foul line, inlaid arrows, dots and range finders, the pin spots,
// and the oil, which makes the front of the lane glossy (and so reflective under SSR) and the back end dry.

uniform float lw = 0.527;
uniform float head = 18.29;
uniform float oil = 12.0;
uniform float dim = 1.0;          // neighbouring lanes are a shade darker
uniform float seed = 7.0;

varying vec2 xd;                  // x across the lane, d down it

void vertex() {
	vec3 w = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	xd = vec2(VERTEX.x, -w.z);
}

vec3 srgb_to_linear_approx(vec3 c) { return pow(c, vec3(2.2)); }
float h1(float n) { return fract(sin(n * 127.1 + seed * 311.7) * 43758.5453); }
float n1(float x) { float i = floor(x); float f = fract(x); return mix(h1(i), h1(i + 1.0), f * f * (3.0 - 2.0 * f)); }

vec3 hsl(float h, float s, float l) {
	vec3 rgb = clamp(abs(mod(h / 60.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
	return l + s * (rgb - 0.5) * (1.0 - abs(2.0 * l - 1.0));
}

float tri(vec2 p, vec2 a, float len, float half_w) {   // an arrow pointing down the lane, apex at a + (0, len)
	float t = (p.y - a.y) / len;
	return step(0.0, t) * step(t, 1.0) * step(abs(p.x - a.x), half_w * (1.0 - t));
}

void fragment() {
	float x = xd.x;
	float d = xd.y;
	float u = x / lw * 0.5 + 0.5;
	float bi = floor(u * 39.0);
	float bf = fract(u * 39.0);
	float n = h1(bi);
	// the board's tone: maple on the approach, the heads and the pin deck; pine through the middle
	float l = d < 0.0 ? 0.58 + n * 0.06 : d < 4.5 ? 0.71 + n * 0.06 : d < head - 1.5 ? 0.66 + n * 0.07 : 0.70 + n * 0.06;
	float hue = d > 4.5 && d < head - 1.5 ? 30.0 + n * 5.0 : 33.0 + n * 4.0;
	vec3 col = srgb_to_linear_approx(hsl(hue, 0.48 + n * 0.08, l));
	// grain: long wobbling streaks along each board
	float g = 0.0;
	for (int k = 0; k < 4; k++) {
		float kk = float(k);
		float cx = h1(bi * 7.0 + kk) + (n1(d * 1.3 + bi * 3.0 + kk * 11.0) - 0.5) * 0.25;
		float wdt = 0.02 + h1(bi * 13.0 + kk) * 0.05;
		float s = smoothstep(wdt, 0.0, abs(bf - cx));
		g += s * (h1(bi * 5.0 + kk) < 0.5 ? -0.12 : 0.08);
	}
	col *= 1.0 + g;
	col *= 1.0 - 0.3 * smoothstep(0.06, 0.0, bf);                     // the seam between boards
	if (d < 0.0) col *= 0.82;                                         // the approach is a shade darker
	float inl = 0.0;
	inl = max(inl, step(abs(d), 0.006));                              // foul line
	for (int i = -3; i <= 3; i++) {
		float fi = float(i);
		float ax = fi * 5.0 * lw / 19.5;
		inl = max(inl, tri(vec2(x, d), vec2(ax, 4.57 + (3.0 - abs(fi)) * 0.3 - 0.06), 0.2, 0.013));
		for (int j = 0; j < 3; j++) {
			float dd = j == 0 ? 2.13 : j == 1 ? -0.35 : -1.2;
			inl = max(inl, step(length(vec2(x - ax, d - dd)), 0.0068));
		}
	}
	for (int s = -1; s <= 1; s += 2) {
		float ax = float(s) * 10.0 * lw / 19.5;
		inl = max(inl, step(abs(x - ax), 0.004) * step(10.4, d) * step(d, 12.2));
	}
	vec3 ink = srgb_to_linear_approx(vec3(0.227, 0.141, 0.078));
	col = mix(col, ink, inl);
	// pin spots
	for (int r = 0; r < 4; r++) { for (int i = 0; i <= r; i++) {
		vec2 sp = vec2((float(i) - float(r) / 2.0) * 0.3048, head + float(r) * 0.26396);
		vec2 q = (vec2(x, d) - sp) / vec2(0.0135, 0.0135);
		col = mix(col, ink, 0.55 * step(length(q), 1.0));
	} }
	// oil: glossy for its length, fading over 1.5 m, then dry boards
	float o = d < 0.0 ? 0.0 : d < oil ? 1.0 : d < oil + 1.5 ? 1.0 - (d - oil) / 1.5 : 0.0;
	ALBEDO = col * dim;
	ROUGHNESS = d < 0.0 ? 0.5 : 0.5 - 0.42 * o + (d > head - 0.5 ? 0.06 : 0.0);
	SPECULAR = 0.5 + 0.2 * o;
	METALLIC = 0.0;
}

