shader_type spatial;
// A retro bowling shirt: the bowler's colour, two contrasting panels down the front, a collar band and buttons.
uniform vec3 base : source_color = vec3(0.43, 0.64, 1.0);
uniform vec3 panel : source_color = vec3(0.08, 0.1, 0.2);
varying vec3 lp;
void vertex() { lp = VERTEX; }
void fragment() {
	vec3 col = base;
	float front = step(lp.z, 0.0);
	float ax = abs(lp.x);
	float pnl = step(0.035, ax) * step(ax, 0.075) * front * step(-0.2, lp.y);
	float piping = (smoothstep(0.004, 0.0, abs(ax - 0.035)) + smoothstep(0.004, 0.0, abs(ax - 0.075))) * front;
	col = mix(col, panel, pnl);
	col = mix(col, vec3(0.95), piping * 0.8);
	float collar = smoothstep(0.17, 0.2, lp.y);
	col = mix(col, panel, collar);
	float btn = step(length(vec2(lp.x, fract(lp.y * 9.0) - 0.5)), 0.12) * step(ax, 0.012) * front * step(lp.y, 0.16);
	col = mix(col, vec3(0.95), btn);
	ALBEDO = col;
	ROUGHNESS = 0.55;
}
