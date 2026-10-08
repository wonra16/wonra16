// =============================================================================
// Gyrion / BeyAura  -  topac aurasi icin additive, isiksiz VFX shader'i
// Built-in Render Pipeline ve URP'de calisir (LightMode etiketi yok ->
// URP bunu "SRPDefaultUnlit" olarak cizer). HDR renk + Bloom ile parlar.
//
// _Mode: 0 = Girdap kasesi (bowl / ic koni)
//        1 = Zemin dalgalari + dikenler + sok dalgasi (quad, uv 0..1)
//        2 = Altigen kalkan kubbesi (ATLAS)
//        3 = Ince halka (hale / yorunge)
//        4 = Duz parlak (kristal parcalari)
// Matematik three.js prototipiyle birebir aynidir (threejs/beyblade-aura-scene.js).
// =============================================================================
Shader "Gyrion/BeyAura"
{
    Properties
    {
        [HDR] _ColorA ("Color A (ana)", Color) = (1, 0.1, 0.8, 1)
        [HDR] _ColorB ("Color B (sicak)", Color) = (1, 0.6, 1, 1)
        _Intensity ("Intensity", Float) = 1
        [Enum(Bowl,0,Floor,1,Dome,2,Ring,3,Solid,4)] _Mode ("Mode", Float) = 0
        _AuraTime ("Aura Time (script)", Float) = 0

        [Header(Bowl)]
        _Speed ("Swirl Speed", Float) = 0.5
        _Twist ("Twist", Float) = 2
        _Streaks ("Streaks (tam sayi)", Float) = 6
        _Flame ("Flame Scroll", Float) = 0.8
        _RimSpeed ("Rim Speed", Float) = 1.5
        _Rim ("Rim Strength", Float) = 1.8
        _BottomFade ("Bottom Fade", Float) = 0.3
        _TopFade ("Top Fade", Float) = 0
        _Density ("Density", Float) = 0.07

        [Header(Floor)]
        _Rings ("Rings", Float) = 5
        _Spikes ("Spike Count", Float) = 24
        _SpikeAmt ("Spike Amount", Range(0, 1)) = 0.8
        _Inner ("Spike Start Radius", Float) = 0.5
        _Burst ("Burst 0..1", Range(0, 1)) = 0

        [Header(Ring)]
        _Dash ("Dash", Range(0, 1)) = 0.35

        [Header(Render)]
        _OffsetFactor ("Depth Offset Factor", Float) = 0
        _OffsetUnits ("Depth Offset Units", Float) = 0
    }

    SubShader
    {
        Tags { "Queue" = "Transparent" "RenderType" = "Transparent" "IgnoreProjector" = "True" "PreviewType" = "Plane" }

        Pass
        {
            Blend One One
            ZWrite Off
            Cull Off
            Offset [_OffsetFactor], [_OffsetUnits]

            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #pragma target 3.0
            #include "UnityCG.cginc"

            float4 _ColorA, _ColorB;
            float _Intensity, _Mode, _AuraTime;
            float _Speed, _Twist, _Streaks, _Flame, _RimSpeed, _Rim, _BottomFade, _TopFade, _Density;
            float _Rings, _Spikes, _SpikeAmt, _Inner, _Burst, _Dash;

            #define TAU 6.28318530718

            struct appdata
            {
                float4 vertex : POSITION;
                float3 normal : NORMAL;
                float2 uv     : TEXCOORD0;
                UNITY_VERTEX_INPUT_INSTANCE_ID
            };

            struct v2f
            {
                float4 pos     : SV_POSITION;
                float2 uv      : TEXCOORD0;
                float3 nrm     : TEXCOORD1;
                float3 viewDir : TEXCOORD2;
                float3 local   : TEXCOORD3;
                UNITY_VERTEX_OUTPUT_STEREO
            };

            // ---- yardimcilar (GLSL mod() ile ayni davranis: negatifte de pozitif) ----
            float modp(float x, float y) { return x - y * floor(x / y); }
            float2 modp2(float2 x, float2 y) { return x - y * floor(x / y); }
            float sq(float x) { return x * x; }

            float hash12(float2 p)
            {
                float3 p3 = frac(float3(p.xyx) * 0.1031);
                p3 += dot(p3, p3.yzx + 33.33);
                return frac((p3.x + p3.y) * p3.z);
            }

            // x ekseninde "per" ile periyodik value noise -> kasede dikis izi olmaz
            float vnoiseP(float2 p, float per)
            {
                float2 i = floor(p), f = frac(p);
                float2 u = f * f * (3.0 - 2.0 * f);
                float i0 = modp(i.x, per), i1 = modp(i.x + 1.0, per);
                return lerp(lerp(hash12(float2(i0, i.y)), hash12(float2(i1, i.y)), u.x),
                            lerp(hash12(float2(i0, i.y + 1.0)), hash12(float2(i1, i.y + 1.0)), u.x), u.y);
            }

            float fbmP(float2 p, float per)
            {
                float s = 0.0, a = 0.5;
                [unroll] for (int k = 0; k < 4; k++) { s += a * vnoiseP(p, per); p *= 2.0; per *= 2.0; a *= 0.5; }
                return s;
            }

            float hexDist(float2 p)
            {
                p = abs(p);
                return max(dot(p, normalize(float2(1.0, 1.7320508))), p.x);
            }

            v2f vert(appdata v)
            {
                v2f o;
                UNITY_SETUP_INSTANCE_ID(v);
                UNITY_INITIALIZE_VERTEX_OUTPUT_STEREO(o);
                o.pos = UnityObjectToClipPos(v.vertex);
                o.uv = v.uv;
                o.nrm = UnityObjectToWorldNormal(v.normal);
                o.viewDir = WorldSpaceViewDir(v.vertex);
                o.local = v.vertex.xyz;
                return o;
            }

            // ---------------------------------------------------------------- 0
            float3 Bowl(v2f i, float fres)
            {
                float a = i.uv.x, t = i.uv.y, T = _AuraTime;
                float per = _Streaks;
                float2 sp = float2(a * per + t * _Twist - T * _Speed * per * 0.25, t * 2.5 - T * _Flame);
                float n  = fbmP(sp, per);
                float n2 = fbmP(sp * float2(2.0, 1.4) + float2(0.0, 7.3), per * 2.0);
                float streak = smoothstep(0.5 - _Density, 0.86, n) * (0.55 + 0.9 * n2);
                float wisps = smoothstep(0.62, 0.95, n2) * 0.8;
                float rimBand = exp(-sq((t - 0.955) / 0.035)) + 0.35 * exp(-sq((t - 0.86) / 0.03));
                float cres = 0.3 + 0.7 * sq(0.5 + 0.5 * cos(TAU * a - T * _RimSpeed));
                float fade = smoothstep(0.0, _BottomFade, t) * (1.0 - smoothstep(1.0 - _TopFade, 1.0, t));
                float3 col = _ColorA.rgb * (streak * 1.7 + wisps * 0.8 + 0.06) * (0.55 + fres * 1.1) * fade;
                col += lerp(_ColorA.rgb, _ColorB.rgb, 0.15 + 0.35 * cres * cres) * rimBand * cres * _Rim * (0.6 + 0.8 * n);
                col += _ColorB.rgb * streak * streak * streak * 0.3 * fade;
                return col;
            }

            // ---------------------------------------------------------------- 1
            float3 Floor(v2f i)
            {
                float T = _AuraTime;
                float2 p = i.uv * 2.0 - 1.0;
                float r = length(p);
                float ang = atan2(p.y, p.x) / TAU + 0.5;

                float f = r * _Rings + ang * 2.0 - T * _Speed * 1.4;
                float band = pow(0.5 + 0.5 * cos(TAU * f), 10.0);
                float brk = smoothstep(0.35, 0.75, fbmP(float2(ang * 12.0 + T * _Speed * 3.0, r * 3.0 - T * 0.6), 12.0));
                float rings = band * brk * smoothstep(0.08, 0.3, r) * (1.0 - smoothstep(0.55, 0.95, r));

                float cell = floor(ang * _Spikes);
                float c = frac(ang * _Spikes);
                float tick = floor(T * 3.0 + hash12(float2(cell, 3.1)) * 7.0);
                float h = hash12(float2(cell, tick));
                float on = step(1.0 - _SpikeAmt * 0.7, h);
                float r0 = _Inner;
                float L = r0 + 0.07 + 0.22 * hash12(float2(cell, tick + 9.0));
                float k = saturate((r - r0) / (L - r0));
                float bend = (hash12(float2(cell, 5.0)) - 0.5) * 0.5 * k;
                float w = (1.0 - k) * 0.3 + 0.02;
                float spike = on * smoothstep(w, 0.0, abs(c - 0.5 - bend)) * smoothstep(r0 - 0.03, r0 + 0.02, r) * (1.0 - smoothstep(L - 0.06, L, r));
                spike *= (1.0 - k * 0.7) * (0.45 + 0.55 * vnoiseP(float2(cell * 3.0 + r * 30.0, T * 6.0), 1000.0));

                float glow = exp(-r * r * 14.0) * 0.55 + exp(-r * r * 3.0) * 0.12;
                float edge = 1.0 - smoothstep(0.75, 1.0, r);
                float shock = exp(-sq((r - _Burst * 0.95) / 0.035)) * (1.0 - _Burst) * step(0.001, _Burst) * 3.0;

                return _ColorA.rgb * (rings * 1.4 + glow + spike * 0.9) * edge + _ColorB.rgb * (spike * 0.15 + shock);
            }

            // ---------------------------------------------------------------- 2
            float3 Dome(v2f i, float fres)
            {
                float2 uv = float2(i.uv.x * 28.0, i.uv.y * 9.0);
                float2 s = float2(1.0, 1.7320508);
                float2 a = modp2(uv, s) - s * 0.5;
                float2 b = modp2(uv - s * 0.5, s) - s * 0.5;
                float2 g = dot(a, a) < dot(b, b) ? a : b;
                float edge = smoothstep(0.42, 0.5, hexDist(g));
                float f = pow(fres, 2.5);
                float y = i.local.y;
                float scan = exp(-sq((y - frac(_AuraTime * 0.35) * 1.1) / 0.05));
                float base = smoothstep(0.0, 0.15, y);
                float3 col = _ColorA.rgb * (edge * (0.12 + f * 0.9) + f * 0.35) + _ColorB.rgb * scan * (0.25 + edge * 1.2);
                return col * base;
            }

            // ---------------------------------------------------------------- 3
            float3 Ring(v2f i)
            {
                float a = i.uv.x;
                float cres = 0.25 + 0.75 * pow(0.5 + 0.5 * cos(TAU * a - _AuraTime * _Speed), 3.0);
                float dash = lerp(1.0, smoothstep(0.3, 0.7, vnoiseP(float2(a * 24.0 - _AuraTime * _Speed * 2.0, 0.5), 24.0)), _Dash);
                return lerp(_ColorA.rgb, _ColorB.rgb, cres * 0.6) * cres * dash;
            }

            fixed4 frag(v2f i) : SV_Target
            {
                float fres = 1.0 - abs(dot(normalize(i.nrm), normalize(i.viewDir)));
                float3 col;
                if (_Mode < 0.5)      col = Bowl(i, fres);
                else if (_Mode < 1.5) col = Floor(i);
                else if (_Mode < 2.5) col = Dome(i, fres);
                else if (_Mode < 3.5) col = Ring(i);
                else                  col = _ColorA.rgb * (0.5 + fres * 1.5);
                return float4(max(col * _Intensity, 0.0), 1.0);
            }
            ENDCG
        }
    }
    Fallback Off
}
