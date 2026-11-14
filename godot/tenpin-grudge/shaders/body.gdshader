shader_type spatial;
// A Quaternius base character: the textured skin, and two-tone bowling shoes painted on. The shirt and trousers are
// separate loose meshes (scripts/outfit.gd, shaders/cloth.gdshader); under them the skin is pulled in, and the edges
// just inside each opening are painted as the cloth. Painting goes by where each vertex sits in the T-pose
// (UV2 = x, y and COLOR.r = z * 2 + 0.5, set when the mesh is loaded), so it follows the skinning exactly.
// The character faces +Z in this space, +Y is up, and its right side is -X.
uniform sampler2D skin_tex : source_color, filter_linear_mipmap_anisotropic;
uniform sampler2D skin_nrm : hint_normal, filter_linear_mipmap_anisotropic;
uniform sampler2D skin_rough : hint_default_white, filter_linear_mipmap;
uniform vec3 skin : source_color = vec3(0.95, 0.82, 0.71);
uniform vec3 skin_ref : source_color = vec3(0.66, 0.465, 0.33);   // the texture's own average skin tone
uniform vec3 base : source_color = vec3(0.43, 0.64, 1.0);
uniform vec3 panel : source_color = vec3(0.08, 0.1, 0.2);
uniform vec3 trousers : source_color = vec3(0.16, 0.17, 0.22);
uniform vec3 shoes : source_color = vec3(0.8, 0.1, 0.15);
// where things are on this body, in metres (set from the skeleton)
uniform float collar_y = 1.5;
uniform float hem_y = 0.93;
uniform float waist_y = 1.0;
uniform float sleeve_x = 0.36;
uniform float shoulder_x = 0.2;
uniform float ankle_y = 0.13;
uniform float armpit_y = 1.37;
uniform float cuff_y = 0.14;
uniform float chest_z = 0.1;

varying vec3 rp;

void vertex() {
	rp = vec3(UV2.x, UV2.y, (COLOR.r - 0.5) * 0.5);
	// under the clothes (outfit.gd's shirt and trousers) the skin is drawn in 3 cm, so nothing pokes through the cloth
	// as the body bends. The few centimetres inside each opening stay put, painted as the cloth's inside.
	float ax = abs(rp.x);
	float arm = smoothstep(shoulder_x - 0.01, shoulder_x + 0.01, ax) * smoothstep(armpit_y - 0.01, armpit_y + 0.01, rp.y);
	float under = smoothstep(cuff_y + 0.05, cuff_y + 0.09, rp.y) * (1.0 - smoothstep(collar_y - 0.06, collar_y - 0.035, rp.y)) * (1.0 - arm);
	VERTEX -= NORMAL * 0.03 * under;
}

float band(float x, float a, float w) { return smoothstep(a - w, a + w, x); }

void fragment() {
	vec2 uv = UV;
	vec3 sk = texture(skin_tex, uv).rgb * (skin / skin_ref);
	vec3 nrm = texture(skin_nrm, uv).rgb;
	float rough = texture(skin_rough, uv).g;
	float ax = abs(rp.x);
	float y = rp.y;
	// the shirt: the torso between the hem and the collar, and the upper arm out to the sleeve
	float arm = band(ax, shoulder_x, 0.01) * band(y, armpit_y, 0.01);       // (the arms are out along x in the T-pose)
	float shirt = (1.0 - band(y, collar_y, 0.006)) * band(y, hem_y, 0.004);
	shirt *= mix(1.0, 1.0 - band(ax, sleeve_x, 0.004), arm);
	// trousers: waist to ankle, on the legs
	float legs = (1.0 - band(y, waist_y, 0.004)) * band(y, ankle_y, 0.004) * (1.0 - arm);
	float shoe = 1.0 - band(y, ankle_y, 0.004);
	// shirt detail
	float front = smoothstep(-0.01, 0.02, rp.z - chest_z * 0.2) * (1.0 - arm);
	vec3 sh = base;
	float pnl = band(ax, 0.045, 0.003) * (1.0 - band(ax, 0.08, 0.003)) * front * band(y, hem_y + 0.04, 0.004);
	float piping = (smoothstep(0.004, 0.0, abs(ax - 0.045)) + smoothstep(0.004, 0.0, abs(ax - 0.08))) * front * step(hem_y + 0.04, y);
	sh = mix(sh, panel, pnl);
	sh = mix(sh, vec3(0.95), clamp(piping, 0.0, 1.0) * 0.8);
	float collar = band(y, collar_y - 0.03, 0.004) * (1.0 - band(ax, 0.075, 0.01)) * (1.0 - arm);   // a band round the neck
	sh = mix(sh, panel, collar);
	float btn = step(length(vec2(ax / 0.012, (fract((y - hem_y) * 11.0) - 0.5) / 0.12)), 1.0) * front * step(y, collar_y - 0.045) * step(hem_y + 0.03, y);
	sh = mix(sh, vec3(0.95), btn);
	float hem = 1.0 - band(y, hem_y + 0.025, 0.003);
	sh = mix(sh, sh * 0.72, hem * (1.0 - arm));                                // a darker turned hem
	sh = mix(sh, panel, (1.0 - band(ax, sleeve_x - 0.025, 0.003)) * band(ax, sleeve_x - 0.045, 0.003) * arm);   // sleeve cuffs
	// a faint cloth weave so the fabric isn't flat
	float weave = 0.96 + 0.04 * sin(rp.x * 900.0) * sin(rp.y * 900.0);
	// shoes: coloured upper, white toe and heel, dark sole
	vec3 sho = shoes;
	float toe = smoothstep(0.115, 0.13, rp.z);
	float heel = 1.0 - smoothstep(-0.075, -0.06, rp.z);
	sho = mix(sho, vec3(0.93, 0.92, 0.9), clamp(toe + heel, 0.0, 1.0));
	sho = mix(sho, vec3(0.05), 1.0 - smoothstep(0.018, 0.026, y));
	vec3 col = sk;
	col = mix(col, trousers * weave, legs);
	col = mix(col, sh * weave, shirt);
	col = mix(col, sho, shoe);
	float cloth = clamp(shirt + legs + shoe, 0.0, 1.0);
	ALBEDO = col;
	ROUGHNESS = mix(rough, mix(0.72, 0.4, shoe), cloth);
	NORMAL_MAP = mix(nrm, vec3(0.5, 0.5, 1.0), cloth * 0.85);
}
