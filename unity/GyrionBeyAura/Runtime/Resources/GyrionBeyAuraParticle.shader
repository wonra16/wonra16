// =============================================================================
// Gyrion / BeyAuraParticle - kivilcimlar icin additive, dokusuz parcacik shader'i
// (yumusak nokta + cekirdek + kucuk yildiz isini). Built-in ve URP uyumlu.
// Renk materyalden gelir (_ColorA/_ColorB). Vertex rengi VERI olarak kullanilir:
//   r = sicaklik (A->B karisimi), a = parlaklik (fade * titreme). _Glow = HDR carpani.
// =============================================================================
Shader "Gyrion/BeyAuraParticle"
{
    Properties
    {
        [HDR] _ColorA ("Color A", Color) = (1, 0.1, 0.8, 1)
        [HDR] _ColorB ("Color B", Color) = (1, 0.6, 1, 1)
        _Glow ("Glow (HDR carpani)", Float) = 3.2
    }

    SubShader
    {
        Tags { "Queue" = "Transparent" "RenderType" = "Transparent" "IgnoreProjector" = "True" "PreviewType" = "Plane" }

        Pass
        {
            Blend One One
            ZWrite Off
            Cull Off

            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #include "UnityCG.cginc"

            float4 _ColorA, _ColorB;
            float _Glow;

            struct appdata
            {
                float4 vertex : POSITION;
                float4 color  : COLOR;
                float2 uv     : TEXCOORD0;
                UNITY_VERTEX_INPUT_INSTANCE_ID
            };

            struct v2f
            {
                float4 pos   : SV_POSITION;
                float4 color : COLOR;
                float2 uv    : TEXCOORD0;
                UNITY_VERTEX_OUTPUT_STEREO
            };

            v2f vert(appdata v)
            {
                v2f o;
                UNITY_SETUP_INSTANCE_ID(v);
                UNITY_INITIALIZE_VERTEX_OUTPUT_STEREO(o);
                o.pos = UnityObjectToClipPos(v.vertex);
                o.color = v.color;
                o.uv = v.uv;
                return o;
            }

            fixed4 frag(v2f i) : SV_Target
            {
                float2 q = i.uv - 0.5;
                float d = length(q);
                float a = smoothstep(0.5, 0.0, d);
                float core = smoothstep(0.12, 0.0, d);
                float star = smoothstep(0.06, 0.0, min(abs(q.x), abs(q.y))) * a;
                float3 tint = lerp(_ColorA.rgb, _ColorB.rgb, i.color.r);
                float3 col = tint * i.color.a * _Glow * (a * a * 0.5 + core * 1.6 + star * 0.8);
                return float4(col, 1.0);
            }
            ENDCG
        }
    }
    Fallback Off
}
