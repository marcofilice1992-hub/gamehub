shader_type spatial;
// Quaternius hair (and eyebrows): the strand texture, tinted to the bowler's hair colour.
uniform sampler2D tex : source_color, filter_linear_mipmap_anisotropic;
uniform sampler2D nrm : hint_normal, filter_linear_mipmap_anisotropic;
uniform vec3 tint : source_color = vec3(0.23, 0.16, 0.12);
void fragment() {
	vec3 t = texture(tex, UV).rgb;
	ALBEDO = clamp(t / 0.55, 0.0, 1.6) * tint;
	NORMAL_MAP = texture(nrm, UV).rgb;
	ROUGHNESS = 0.55;
	SPECULAR = 0.35;
}
