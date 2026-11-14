shader_type spatial;
// Two-tone bowling shoes: a coloured upper, a white toe and heel, a dark sole.
uniform vec3 a : source_color = vec3(0.8, 0.1, 0.15);
varying vec3 lp;
void vertex() { lp = VERTEX; }
void fragment() {
	vec3 col = a;
	float along = lp.y;                       // the capsule runs along its own y
	col = mix(col, vec3(0.93, 0.92, 0.9), step(0.05, abs(along)));
	col = mix(col, vec3(0.06), step(0.03, lp.z));
	ALBEDO = col;
	ROUGHNESS = 0.45;
}
