shader_type spatial;
render_mode cull_disabled;
// The bowlers' clothes (scripts/outfit.gd builds the meshes). One shader for both garments:
//   shirt = 1: a retro bowling shirt in the player's colour, two contrasting panels with piping down the front,
//              a collar band, buttons, contrasting cuffs and a turned hem;
//   shirt = 0: trousers, with a pressed crease down each leg.
// Patterns are laid out by each vertex's T-pose position (UV2 = x, y; COLOR.r = z * 2 + 0.5), facing +Z, +Y up.
// Folds are bumped in from a height field (no tangents needed), and the inside of the cloth is shaded darker.
uniform float shirt = 1.0;
uniform vec3 base : source_color = vec3(0.43, 0.64, 1.0);
uniform vec3 panel : source_color = vec3(0.08, 0.1, 0.2);
uniform float collar_y = 1.5;
uniform float chest_y = 1.3;
uniform float hem_y = 0.93;
uniform float sleeve_x = 0.36;
uniform float shoulder_x = 0.2;
uniform float armpit_y = 1.37;
uniform float knee_y = 0.5;
uniform float cuff_y = 0.12;

varying vec3 rp;

float band(float x, float a, float w) { return smoothstep(a - w, a + w, x); }

// the height of the folds at this T-pose point
float folds(vec3 p) {
	float ax = abs(p.x);
	if (shirt > 0.5) {
		float arm = step(shoulder_x, ax) * step(armpit_y, p.y);
		float hang = smoothstep(chest_y, hem_y, p.y) * (1.0 - arm);                 // drape hangs from the chest
		float a = atan(p.x, p.z + 0.02);
		float drape = sin(a * 9.0 + sin(p.y * 9.0) * 0.7) * 0.0025 * hang;
		float sleeve = sin(atan(p.y - 1.45, p.z) * 7.0 + ax * 30.0) * 0.0018 * arm * smoothstep(shoulder_x, sleeve_x, ax);
		return drape + sleeve;
	}
	float lx = ax - 0.11;
	float a = atan(lx, p.z);
	float brk = smoothstep(cuff_y + 0.12, cuff_y, p.y);                             // the break over the shoe
	float knee = exp(-pow((p.y - knee_y) / 0.05, 2.0));
	return sin(p.y * 70.0 + a * 1.5) * 0.0018 * brk + sin(p.y * 90.0 + sin(a * 3.0)) * 0.0010 * knee
		+ sin(a * 6.0 + p.y * 4.0) * 0.0012 * (1.0 - brk);
}

void vertex() {
	rp = vec3(UV2.x, UV2.y, (COLOR.r - 0.5) * 0.5);
}

void fragment() {
	float ax = abs(rp.x);
	float y = rp.y;
	vec3 col;
	float rough;
	if (shirt > 0.5) {
		float arm = band(ax, shoulder_x, 0.01) * band(y, armpit_y, 0.01);
		float front = smoothstep(-0.01, 0.02, rp.z) * (1.0 - arm);
		col = base;
		float pnl = band(ax, 0.045, 0.003) * (1.0 - band(ax, 0.08, 0.003)) * front * band(y, hem_y + 0.04, 0.004);
		float piping = (smoothstep(0.004, 0.0, abs(ax - 0.045)) + smoothstep(0.004, 0.0, abs(ax - 0.08))) * front * step(hem_y + 0.04, y);
		col = mix(col, panel, pnl);
		col = mix(col, vec3(0.95), clamp(piping, 0.0, 1.0) * 0.8);
		float collar = band(y, collar_y - 0.035, 0.004) * (1.0 - arm);
		col = mix(col, panel, collar);
		float btn = step(length(vec2(ax / 0.011, (fract((y - hem_y) * 11.0) - 0.5) / 0.11)), 1.0) * front * step(y, collar_y - 0.045) * step(hem_y + 0.03, y);
		col = mix(col, vec3(0.95), btn);
		col = mix(col, col * 0.78, (1.0 - band(y, hem_y + 0.022, 0.003)) * (1.0 - arm));          // a turned hem
		col = mix(col, panel, band(ax, sleeve_x - 0.028, 0.003) * arm);                           // cuffs
		rough = 0.68;
	} else {
		col = base;
		float lx = ax - 0.11;
		float crease = smoothstep(0.004, 0.0, abs(lx)) * smoothstep(0.0, 0.04, rp.z) * step(y, hem_y + 0.02);
		col = mix(col, col * 1.35 + 0.02, crease * 0.6);
		col = mix(col, col * 0.7, 1.0 - band(y, cuff_y + 0.012, 0.003));                         // the turn-up
		rough = 0.78;
	}
	col *= 0.97 + 0.03 * sin(rp.x * 900.0) * sin(rp.y * 900.0);                                    // weave
	// fold bump: perturb the normal by the gradient of folds() across the screen
	vec3 n = FRONT_FACING ? NORMAL : -NORMAL;
	float h = folds(rp);
	vec3 dpx = dFdx(VERTEX), dpy = dFdy(VERTEX);
	float dhx = dFdx(h), dhy = dFdy(h);
	vec3 r1 = cross(dpy, n), r2 = cross(n, dpx);
	float det = dot(dpx, r1);
	vec3 g = sign(det) * (dhx * r1 + dhy * r2);
	NORMAL = normalize(abs(det) * n - g * 6.0);
	if (!FRONT_FACING) col *= 0.45;
	ALBEDO = col;
	ROUGHNESS = rough;
	SPECULAR = 0.3;
}
