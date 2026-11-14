shader_type spatial;
// A tenpin: ivory-white plastic coat over maple, two red neck stripes, and scuffs where balls and other pins strike the belly.
// Heights are from the pin's base (the mesh origin sits at the centre of gravity, 0.147 m up).

uniform float cog = 0.147;
uniform float wear = 1.0;

varying vec3 lp;

void vertex() { lp = VERTEX; }

float h(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
float noise(vec3 p) {
	vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
	return mix(mix(mix(h(i), h(i + vec3(1,0,0)), f.x), mix(h(i + vec3(0,1,0)), h(i + vec3(1,1,0)), f.x), f.y),
		mix(mix(h(i + vec3(0,0,1)), h(i + vec3(1,0,1)), f.x), mix(h(i + vec3(0,1,1)), h(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float band(float y, float a, float b) {
	float w = fwidth(y) * 1.5;
	return smoothstep(a - w, a + w, y) * (1.0 - smoothstep(b - w, b + w, y));
}

void fragment() {
	float y = lp.y + cog;
	vec3 col = vec3(0.97, 0.965, 0.95);
	float stripe = max(band(y, 0.249, 0.262), band(y, 0.271, 0.284));
	col = mix(col, vec3(0.62, 0.05, 0.08), stripe);
	// scuffs: grey marks around the belly, where the ball and other pins hit
	float belly = smoothstep(0.04, 0.09, y) * (1.0 - smoothstep(0.17, 0.22, y));
	float sc = smoothstep(0.78, 0.92, noise(lp * vec3(420.0, 90.0, 420.0))) * belly * wear;
	col *= 1.0 - 0.05 * sc;
	// the base, where the lacquer is worn from sliding on the deck
	col *= 1.0 - 0.18 * (1.0 - smoothstep(0.0, 0.02, y));
	ALBEDO = col;
	ROUGHNESS = 0.3 + 0.15 * sc;
	SPECULAR = 0.5;
	CLEARCOAT = 1.0 - 0.4 * sc;
	CLEARCOAT_ROUGHNESS = 0.05 + 0.2 * sc;
}
