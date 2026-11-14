shader_type spatial;
// Side walls: deep indigo acoustic panels with seams, a darker wainscot, and a faint cosmic pattern of thin glowing lines.

uniform vec3 base : source_color = vec3(0.07, 0.06, 0.13);
uniform vec3 glow_a : source_color = vec3(1.0, 0.31, 0.85);
uniform vec3 glow_b : source_color = vec3(0.55, 0.42, 1.0);
uniform float glow = 0.35;

varying vec3 wp;
void vertex() { wp = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz; }

float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

void fragment() {
	float u = -wp.z;                       // along the hall
	float y = wp.y;
	vec3 col = base;
	// panels 1.2 m wide, with a dark seam
	float pu = fract(u / 1.2);
	col *= 1.0 - 0.35 * (smoothstep(0.02, 0.0, pu) + smoothstep(0.98, 1.0, pu));
	// wainscot: darker below 1.05 m, with a bright trim line
	col *= y < 1.05 ? 0.55 : 1.0;
	float trim = smoothstep(0.012, 0.0, abs(y - 1.05));
	// cosmic pattern: zig-zags and rings in the upper panels, each panel different
	float cell = floor(u / 1.2);
	float r = h(vec2(cell, 3.0));
	vec2 q = vec2(pu - 0.5, (y - 2.6) / 1.2);
	float zig = abs(q.y - 0.18 * (abs(fract(q.x * 3.0 + r) - 0.5) * 2.0 - 0.5));
	float ring = abs(length(q - vec2(r - 0.5, 0.35 * (r - 0.4))) - 0.22 - 0.1 * r);
	float lines = (smoothstep(0.012, 0.0, zig) * step(0.4, r) + smoothstep(0.01, 0.0, ring) * step(r, 0.7)) * step(1.25, y) * step(y, 4.0);
	vec3 gc = mix(glow_a, glow_b, step(0.5, h(vec2(cell, 9.0))));
	ALBEDO = col;
	ROUGHNESS = 0.75;
	EMISSION = gc * (lines * glow + trim * 0.6);
}
