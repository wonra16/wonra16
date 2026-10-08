using System.Collections.Generic;
using UnityEngine;

namespace Gyrion.VFX
{
    /// <summary>
    /// Topaca "vortex aura" ekler: donen enerji kasesi, ic girdap, zemin dalgalari + dikenler,
    /// ust hale halkasi, kivilcimlar ve aileye ozel ek (kubbe / yorunge / kristal / alev).
    ///
    /// Kullanim: topacin kok objesine ekle, Family sec. Gerisi otomatik.
    /// Oyun kodundan: SetSpin(0..1), Burst() (skill), SetFamily(), SetCustomColors().
    ///
    /// Efekt objesi sahnenin kokunde ayri bir obje olarak yaratilir ve sadece POZISYONU takip eder;
    /// boylece topac donerken aura donmez, zemine (banked bowl dahil) yaslanir.
    /// Built-in RP ve URP ile calisir. Parlama icin kamerada HDR + Bloom acik olmali.
    /// </summary>
    [DisallowMultipleComponent]
    [AddComponentMenu("Gyrion/VFX/Bey Aura")]
    public class BeyAura : MonoBehaviour
    {
        [Header("Aura")]
        public BeyFamily family = BeyFamily.Kor;
        [Tooltip("Aileden bagimsiz ozel renk (ornegin oyuncunun kendi topaci / MINE)")]
        public bool useCustomColors;
        [ColorUsage(false, true)] public Color customColorA = new Color(0.05f, 1f, 0.12f);
        [ColorUsage(false, true)] public Color customColorB = new Color(0.75f, 1f, 0.5f);

        [Header("Boyut")]
        [Tooltip("Topacin yaricapini Renderer sinirlarindan otomatik hesapla")]
        public bool autoSize = true;
        [Tooltip("autoSize kapaliysa kullanilir (metre)")]
        public float beyRadius = 0.5f;
        [Range(0.3f, 3f)] public float sizeMultiplier = 1f;

        [Header("Zemin")]
        public LayerMask groundMask = ~0;
        public float groundRayLength = 3f;
        [Tooltip("Egimli stadyumda (banked bowl) aurayi yuzey normaline yasla")]
        public bool alignToGroundNormal = true;
        [Tooltip("Zemin bulunamazsa topac pivotunun ne kadar altina konsun")]
        public float fallbackHeightOffset = 0f;

        [Header("Spin / Guc")]
        [Range(0f, 1f)] public float spin01 = 1f;
        [Tooltip("spin01'i Rigidbody acisal hizindan otomatik oku")]
        public bool spinFromRigidbody = false;
        public float maxAngularSpeed = 60f;
        [Range(0f, 1f)] public float minIntensity = 0.25f;
        [Tooltip("Genel parlaklik carpani")]
        public float intensity = 1f;

        [Header("Isik & Kalite")]
        public bool addPointLight = true;
        public float lightIntensity = 3f;
        [Range(0f, 1f)] public float particleDensity = 1f;

        [Header("Shader (bos birakilirsa Resources'tan bulunur)")]
        public Shader auraShader;
        public Shader particleShader;

        // ------------------------------------------------------------------ runtime
        const float RefRadius = 0.5f; // efektin modellendigi topac yaricapi

        Transform fx, halo;
        readonly List<Material> materials = new List<Material>();
        readonly List<System.Action<float>> extraUpdates = new List<System.Action<float>>();
        Material bowlMat, innerMat, floorMat, haloMat, sparkMat, shardMat;
        Light auraLight;
        ParticleSystem sparks;
        ParticleSystem.Particle[] particleBuf;
        Rigidbody body;
        BeyAuraPreset preset;
        BeyFamily builtFamily;
        bool builtCustom;
        Color builtA, builtB;
        float auraTime, burstT, scale = 1f, seed;
        readonly RaycastHit[] hits = new RaycastHit[8];

        // kivilcim durumu (three.js prototipiyle ayni mantik)
        int sparkPool;
        float[] pA, pR, pY, pVy, pW, pLife, pMax, pSize, pHot;
        Vector3[] pPos, pVel;
        bool[] pBurst;

        static readonly int IdColorA = Shader.PropertyToID("_ColorA");
        static readonly int IdColorB = Shader.PropertyToID("_ColorB");
        static readonly int IdIntensity = Shader.PropertyToID("_Intensity");
        static readonly int IdMode = Shader.PropertyToID("_Mode");
        static readonly int IdTime = Shader.PropertyToID("_AuraTime");
        static readonly int IdSpeed = Shader.PropertyToID("_Speed");
        static readonly int IdTwist = Shader.PropertyToID("_Twist");
        static readonly int IdStreaks = Shader.PropertyToID("_Streaks");
        static readonly int IdFlame = Shader.PropertyToID("_Flame");
        static readonly int IdRimSpeed = Shader.PropertyToID("_RimSpeed");
        static readonly int IdRim = Shader.PropertyToID("_Rim");
        static readonly int IdBottomFade = Shader.PropertyToID("_BottomFade");
        static readonly int IdTopFade = Shader.PropertyToID("_TopFade");
        static readonly int IdDensity = Shader.PropertyToID("_Density");
        static readonly int IdRings = Shader.PropertyToID("_Rings");
        static readonly int IdSpikes = Shader.PropertyToID("_Spikes");
        static readonly int IdSpikeAmt = Shader.PropertyToID("_SpikeAmt");
        static readonly int IdInner = Shader.PropertyToID("_Inner");
        static readonly int IdBurst = Shader.PropertyToID("_Burst");
        static readonly int IdDash = Shader.PropertyToID("_Dash");
        static readonly int IdOffsetFactor = Shader.PropertyToID("_OffsetFactor");
        static readonly int IdOffsetUnits = Shader.PropertyToID("_OffsetUnits");
        static readonly int IdGlow = Shader.PropertyToID("_Glow");

        // ================================================================== Public API

        /// <summary>Spin enerjisi 0..1 (oyundaki "spin energy" yuzdesi / 100).</summary>
        public void SetSpin(float value01) { spin01 = Mathf.Clamp01(value01); }

        /// <summary>Skill / carpisma patlamasi: sok dalgasi + parlama + disari sacilan kivilcimlar.</summary>
        [ContextMenu("Test Burst")]
        public void Burst()
        {
            burstT = 0.001f;
            if (pBurst == null) return;
            int n = Mathf.Min(40, sparkPool);
            for (int k = 0; k < n; k++) SpawnBurst(Random.Range(0, sparkPool));
        }

        public void SetFamily(BeyFamily newFamily)
        {
            family = newFamily;
            useCustomColors = false;
            Rebuild();
        }

        public void SetCustomColors(Color a, Color b)
        {
            useCustomColors = true;
            customColorA = a;
            customColorB = b;
            ApplyColors();
        }

        public void ClearCustomColors()
        {
            useCustomColors = false;
            ApplyColors();
        }

        public void SetVisible(bool visible)
        {
            if (fx) fx.gameObject.SetActive(visible);
        }

        // ================================================================== Unity

        void Awake()
        {
            body = GetComponent<Rigidbody>();
            seed = Random.value * 10f;
        }

        void OnEnable()
        {
            if (fx == null) Rebuild();
            else fx.gameObject.SetActive(true);
        }

        void OnDisable()
        {
            if (fx) fx.gameObject.SetActive(false);
        }

        void OnDestroy() { Teardown(); }

        void Update()
        {
            if (fx == null) return;

            // Inspector'dan aile / renk degistiyse uygula
            if (builtFamily != family) { Rebuild(); return; }
            if (builtCustom != useCustomColors || (useCustomColors && (builtA != customColorA || builtB != customColorB))) ApplyColors();

            float dt = Time.deltaTime;
            auraTime += dt;

            if (spinFromRigidbody && body != null)
                spin01 = Mathf.Clamp01(body.angularVelocity.magnitude / Mathf.Max(0.01f, maxAngularSpeed));

            float boost = burstT > 0f ? 1f + 1.6f * Mathf.Max(0f, 1f - burstT * 1.4f) : 1f;
            float breathe = 0.92f + 0.08f * Mathf.Sin(auraTime * 2.2f + seed);
            float I = Mathf.Lerp(minIntensity, 1f, spin01) * breathe * boost * intensity;

            for (int i = 0; i < materials.Count; i++)
            {
                materials[i].SetFloat(IdTime, auraTime);
                materials[i].SetFloat(IdIntensity, I);
            }
            floorMat.SetFloat(IdBurst, burstT);
            sparkMat.SetFloat(IdGlow, 3.2f * I);
            if (burstT > 0f) { burstT += dt * 1.1f; if (burstT >= 1f) burstT = 0f; }

            halo.localRotation = Quaternion.Euler(Mathf.Sin(auraTime * 0.9f) * 3.4f, 0f, Mathf.Cos(auraTime * 0.7f) * 3.4f);
            for (int i = 0; i < extraUpdates.Count; i++) extraUpdates[i](auraTime);
            if (auraLight) auraLight.intensity = lightIntensity * I;

            UpdateSparks(dt);
        }

        void LateUpdate()
        {
            if (fx == null) return;
            Vector3 origin = transform.position + Vector3.up * 0.25f * scale;
            Vector3 pos = transform.position - Vector3.up * fallbackHeightOffset;
            Vector3 up = Vector3.up;

            int count = Physics.RaycastNonAlloc(origin, Vector3.down, hits, groundRayLength * scale + 0.25f * scale, groundMask, QueryTriggerInteraction.Ignore);
            float best = float.MaxValue;
            for (int i = 0; i < count; i++)
            {
                if (hits[i].collider.transform.IsChildOf(transform)) continue; // topacin kendi collider'i
                if (hits[i].distance < best) { best = hits[i].distance; pos = hits[i].point; up = hits[i].normal; }
            }

            fx.position = pos + up * 0.003f * scale;
            Quaternion target = alignToGroundNormal ? Quaternion.FromToRotation(Vector3.up, up) : Quaternion.identity;
            fx.rotation = Quaternion.Slerp(fx.rotation, target, 1f - Mathf.Exp(-Time.deltaTime * 12f));
        }

        // ================================================================== Kurulum

        void Rebuild()
        {
            Teardown();
            if (auraShader == null) auraShader = Shader.Find("Gyrion/BeyAura");
            if (particleShader == null) particleShader = Shader.Find("Gyrion/BeyAuraParticle");
            if (auraShader == null || particleShader == null)
            {
                Debug.LogError("[BeyAura] Shader bulunamadi. GyrionBeyAura klasorundeki Resources/ icindeki .shader dosyalarini kontrol et.", this);
                enabled = false;
                return;
            }

            preset = BeyAuraPreset.Get(family);
            builtFamily = family;

            float radius = beyRadius;
            if (autoSize)
            {
                var rends = GetComponentsInChildren<Renderer>();
                if (rends.Length > 0)
                {
                    Bounds b = rends[0].bounds;
                    for (int i = 1; i < rends.Length; i++) b.Encapsulate(rends[i].bounds);
                    radius = Mathf.Max(b.extents.x, b.extents.z);
                }
            }
            scale = Mathf.Max(0.01f, radius / RefRadius * sizeMultiplier);

            fx = new GameObject(name + "_Aura").transform;
            fx.localScale = Vector3.one * scale;
            fx.position = transform.position;

            BeyAuraMeshes.Ensure();

            // --- girdap kasesi
            bowlMat = NewMat(0f, 0, 0);
            bowlMat.SetFloat(IdSpeed, preset.swirlSpeed);
            bowlMat.SetFloat(IdTwist, preset.twist);
            bowlMat.SetFloat(IdStreaks, preset.streaks);
            bowlMat.SetFloat(IdFlame, preset.flame);
            bowlMat.SetFloat(IdRimSpeed, preset.rimSpeed);
            bowlMat.SetFloat(IdRim, 1.8f);
            bowlMat.SetFloat(IdBottomFade, 0.3f);
            bowlMat.SetFloat(IdTopFade, 0f);
            bowlMat.SetFloat(IdDensity, 0.07f);
            AddPart("Bowl", BeyAuraMeshes.Bowl, bowlMat);

            // --- ic koni (daha hizli, daha seyrek)
            innerMat = NewMat(0f, 0, 1);
            innerMat.SetFloat(IdSpeed, preset.swirlSpeed * 2.2f);
            innerMat.SetFloat(IdTwist, preset.twist * 1.8f);
            innerMat.SetFloat(IdStreaks, Mathf.Max(3f, preset.streaks - 2f));
            innerMat.SetFloat(IdFlame, preset.flame * 1.5f);
            innerMat.SetFloat(IdRimSpeed, preset.rimSpeed);
            innerMat.SetFloat(IdRim, 0f);
            innerMat.SetFloat(IdBottomFade, 0.15f);
            innerMat.SetFloat(IdTopFade, 0.55f);
            innerMat.SetFloat(IdDensity, -0.08f);
            AddPart("InnerSwirl", BeyAuraMeshes.Inner, innerMat);

            // --- zemin
            floorMat = NewMat(1f, 0, 0);
            floorMat.SetFloat(IdSpeed, preset.swirlSpeed);
            floorMat.SetFloat(IdRings, preset.rings);
            floorMat.SetFloat(IdSpikes, preset.spikes);
            floorMat.SetFloat(IdSpikeAmt, preset.spikeAmount);
            floorMat.SetFloat(IdInner, 0.5f);
            floorMat.SetFloat(IdOffsetFactor, -1f);
            floorMat.SetFloat(IdOffsetUnits, -2f);
            AddPart("Floor", BeyAuraMeshes.Floor, floorMat);

            // --- ust hale halkasi
            haloMat = NewMat(3f, 0, 2);
            haloMat.SetFloat(IdSpeed, preset.rimSpeed * 1.3f);
            haloMat.SetFloat(IdDash, 0.35f);
            halo = AddPart("Halo", BeyAuraMeshes.Halo, haloMat).transform;
            halo.localPosition = new Vector3(0f, 0.8f, 0f);

            BuildExtra();
            BuildSparks();

            if (addPointLight)
            {
                var lgo = new GameObject("AuraLight");
                lgo.transform.SetParent(fx, false);
                lgo.transform.localPosition = new Vector3(0f, 0.35f, 0f);
                auraLight = lgo.AddComponent<Light>();
                auraLight.type = LightType.Point;
                auraLight.range = 4.5f * scale;
                auraLight.shadows = LightShadows.None;
            }

            ApplyColors();
            if (!isActiveAndEnabled) fx.gameObject.SetActive(false);
        }

        void BuildExtra()
        {
            extraUpdates.Clear();
            switch (preset.extra)
            {
                case AuraExtra.Dome:
                {
                    var m = NewMat(2f, 0, 3);
                    var dome = AddPart("Dome", BeyAuraMeshes.Dome, m).transform;
                    extraUpdates.Add(t => dome.localRotation = Quaternion.Euler(0f, t * 0.15f * Mathf.Rad2Deg, 0f));
                    break;
                }
                case AuraExtra.Orbit:
                {
                    for (int i = 0; i < 3; i++)
                    {
                        var m = NewMat(3f, 0, 3 + i);
                        m.SetFloat(IdSpeed, 1.2f + i * 0.5f);
                        m.SetFloat(IdDash, 0.6f);
                        var ring = AddPart("Orbit" + i, BeyAuraMeshes.Orbit, m).transform;
                        ring.localScale = Vector3.one * (0.75f + i * 0.22f);
                        int k = i;
                        float tilt = (0.35f + k * 0.25f) * Mathf.Rad2Deg, phase = k * 2.1f;
                        extraUpdates.Add(t =>
                        {
                            ring.localPosition = new Vector3(0f, 0.35f + k * 0.08f, 0f);
                            ring.localRotation = Quaternion.Euler(
                                Mathf.Sin(t * 0.4f + phase) * tilt,
                                t * (0.6f + k * 0.3f) * Mathf.Rad2Deg,
                                Mathf.Cos(t * 0.4f + phase) * tilt);
                        });
                    }
                    break;
                }
                case AuraExtra.Prism:
                {
                    shardMat = NewMat(4f, 0, 3);
                    for (int i = 0; i < 12; i++)
                    {
                        var r = AddPart("Shard" + i, BeyAuraMeshes.Shard, shardMat).GetComponent<MeshRenderer>();
                        var tr = r.transform;
                        float hue = Mathf.Repeat(0.72f + i / 12f * 0.35f, 1f);
                        var mpb = new MaterialPropertyBlock();
                        mpb.SetColor(IdColorA, ToShaderColor(Color.HSVToRGB(hue, 0.85f, 1f) * 2.2f));
                        r.SetPropertyBlock(mpb);
                        float rad = Random.Range(0.55f, 1.3f), h = Random.Range(0.15f, 0.75f);
                        float sp = Random.Range(0.5f, 1.4f), ph = Random.Range(0f, 6.28f);
                        tr.localScale = Vector3.one * Random.Range(0.6f, 1.5f);
                        extraUpdates.Add(t =>
                        {
                            float a = ph + t * sp;
                            tr.localPosition = new Vector3(Mathf.Cos(a) * rad, h + Mathf.Sin(t * 2f + ph) * 0.06f, Mathf.Sin(a) * rad);
                            tr.localRotation = Quaternion.Euler((t * 1.7f + ph) * Mathf.Rad2Deg, t * 2.3f * Mathf.Rad2Deg, ph * Mathf.Rad2Deg);
                        });
                    }
                    break;
                }
            }
        }

        void BuildSparks()
        {
            sparkPool = Mathf.Max(8, Mathf.RoundToInt(preset.sparkCount * particleDensity));
            pA = new float[sparkPool]; pR = new float[sparkPool]; pY = new float[sparkPool]; pVy = new float[sparkPool];
            pW = new float[sparkPool]; pLife = new float[sparkPool]; pMax = new float[sparkPool]; pSize = new float[sparkPool];
            pHot = new float[sparkPool]; pPos = new Vector3[sparkPool]; pVel = new Vector3[sparkPool]; pBurst = new bool[sparkPool];
            for (int i = 0; i < sparkPool; i++) Spawn(i, true);

            var go = new GameObject("Sparks");
            go.transform.SetParent(fx, false);
            sparks = go.AddComponent<ParticleSystem>();
            sparks.Stop(true, ParticleSystemStopBehavior.StopEmittingAndClear);

            var main = sparks.main;
            main.loop = true;
            main.playOnAwake = false;
            main.startLifetime = 100f;
            main.startSpeed = 0f;
            main.maxParticles = sparkPool;
            main.simulationSpace = ParticleSystemSimulationSpace.Local;
            main.scalingMode = ParticleSystemScalingMode.Hierarchy;
            var emission = sparks.emission; emission.enabled = false;
            var shape = sparks.shape; shape.enabled = false;

            sparkMat = new Material(particleShader) { name = "BeyAuraSparks", renderQueue = 3100 + 9 };
            var rend = go.GetComponent<ParticleSystemRenderer>();
            rend.renderMode = ParticleSystemRenderMode.Billboard;
            rend.sharedMaterial = sparkMat;
            rend.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            rend.receiveShadows = false;

            particleBuf = new ParticleSystem.Particle[sparkPool];
            sparks.Play();
        }

        void Spawn(int i, bool warm)
        {
            pBurst[i] = false;
            pA[i] = Random.value * Mathf.PI * 2f;
            pR[i] = 0.2f + Mathf.Pow(Random.value, 0.7f) * 1.35f;
            pY[i] = Random.value * 0.15f;
            pVy[i] = preset.sparkRise * Random.Range(0.3f, 1.2f);
            pW[i] = Random.Range(0.6f, 1.6f) * preset.swirlSpeed * 2.4f / Mathf.Max(0.35f, pR[i]);
            pMax[i] = Random.Range(0.5f, 2.1f);
            pLife[i] = warm ? Random.value * pMax[i] : pMax[i];
            pSize[i] = Random.Range(0.012f, 0.04f) * (Random.value < 0.1f ? 2f : 1f);
            pHot[i] = Random.value;
        }

        void SpawnBurst(int i)
        {
            pBurst[i] = true;
            float a = Random.value * Mathf.PI * 2f;
            var dir = new Vector3(Mathf.Cos(a), 0f, Mathf.Sin(a));
            pPos[i] = dir * Random.Range(0.3f, 0.7f) + Vector3.up * Random.Range(0.1f, 0.45f);
            pVel[i] = dir * Random.Range(2f, 4.5f) + Vector3.up * Random.Range(0.4f, 1.6f);
            pMax[i] = Random.Range(0.35f, 0.9f);
            pLife[i] = pMax[i];
            pSize[i] = Random.Range(0.03f, 0.07f);
            pHot[i] = Random.Range(0.6f, 1f);
        }

        void UpdateSparks(float dt)
        {
            if (sparks == null) return;
            bool flame = preset.extra == AuraExtra.Flame;
            float drag = Mathf.Exp(-dt * 2.5f);
            for (int i = 0; i < sparkPool; i++)
            {
                pLife[i] -= dt;
                if (pLife[i] <= 0f) Spawn(i, false);

                Vector3 p;
                if (pBurst[i])
                {
                    pVel[i] *= drag;
                    pVel[i].y -= 2f * dt;
                    pPos[i] += pVel[i] * dt;
                    p = pPos[i];
                }
                else
                {
                    pA[i] += pW[i] * dt;
                    pY[i] += pVy[i] * dt;
                    pR[i] += (flame ? -0.15f : 0.05f) * dt;
                    p = new Vector3(Mathf.Cos(pA[i]) * pR[i], pY[i], Mathf.Sin(pA[i]) * pR[i]);
                }

                float lf = pLife[i] / pMax[i];
                float fade = Mathf.Sin(lf * Mathf.PI);
                float tw = 0.55f + 0.45f * Mathf.Sin(auraTime * 25f + i * 1.7f);

                ref var q = ref particleBuf[i];
                q.position = p;
                q.velocity = Vector3.zero;
                q.startLifetime = 100f;
                q.remainingLifetime = 100f;
                q.startSize = pSize[i] * (0.4f + 0.6f * fade) * 1.5f;
                q.rotation = 0f;
                // vertex rengi = veri: r = A->B karisimi, a = parlaklik
                q.startColor = new Color32((byte)(pHot[i] * 255f), 0, 0, (byte)(Mathf.Clamp01(fade * tw) * 255f));
            }
            sparks.SetParticles(particleBuf, sparkPool);
        }

        // ================================================================== Renk

        void ApplyColors()
        {
            Color a = useCustomColors ? customColorA : preset.colorA;
            Color b = useCustomColors ? customColorB : preset.colorB;
            builtCustom = useCustomColors;
            builtA = customColorA;
            builtB = customColorB;

            Color sa = ToShaderColor(a), sb = ToShaderColor(b);
            foreach (var m in materials)
            {
                m.SetColor(IdColorA, sa);
                m.SetColor(IdColorB, sb);
            }
            if (sparkMat)
            {
                sparkMat.SetColor(IdColorA, sa);
                sparkMat.SetColor(IdColorB, sb);
            }
            if (auraLight) auraLight.color = ToShaderColor(a);
        }

        /// <summary>
        /// Presetler LINEAR renk. Linear projede Unity SetColor degerini gamma kabul edip
        /// linear'a cevirdigi icin once gamma'ya ceviriyoruz -> shader'a tam preset degeri ulasir.
        /// </summary>
        static Color ToShaderColor(Color linear)
        {
            return QualitySettings.activeColorSpace == ColorSpace.Linear ? linear.gamma : linear;
        }

        // ================================================================== Yardimcilar

        Material NewMat(float mode, int queueOffset, int order)
        {
            var m = new Material(auraShader) { name = "BeyAura_" + mode + "_" + order };
            m.SetFloat(IdMode, mode);
            m.renderQueue = 3100 + queueOffset + order;
            materials.Add(m);
            return m;
        }

        GameObject AddPart(string partName, Mesh mesh, Material mat)
        {
            var go = new GameObject(partName);
            go.transform.SetParent(fx, false);
            go.AddComponent<MeshFilter>().sharedMesh = mesh;
            var r = go.AddComponent<MeshRenderer>();
            r.sharedMaterial = mat;
            r.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            r.receiveShadows = false;
            r.lightProbeUsage = UnityEngine.Rendering.LightProbeUsage.Off;
            r.reflectionProbeUsage = UnityEngine.Rendering.ReflectionProbeUsage.Off;
            return go;
        }

        void Teardown()
        {
            foreach (var m in materials) if (m) Destroy(m);
            materials.Clear();
            if (sparkMat) Destroy(sparkMat);
            extraUpdates.Clear();
            if (fx) Destroy(fx.gameObject);
            fx = null;
            halo = null;
            sparks = null;
            auraLight = null;
            shardMat = null;
        }
    }

    /// <summary>Tum auralarin paylastigi prosedurel mesh'ler (bir kez uretilir).</summary>
    public static class BeyAuraMeshes
    {
        public static Mesh Bowl, Inner, Floor, Halo, Dome, Orbit, Shard;

        public static void Ensure()
        {
            if (Bowl == null) Bowl = Lathe("BeyAura_Bowl", 0.2f, 1.35f, 0.82f, 128, 40);
            if (Inner == null) Inner = Lathe("BeyAura_Inner", 0.12f, 0.62f, 0.95f, 96, 40);
            if (Floor == null) Floor = Quad("BeyAura_Floor", 2.3f);
            if (Halo == null) Halo = Torus("BeyAura_Halo", 1.37f, 0.016f, 160, 8);
            if (Dome == null) Dome = Hemisphere("BeyAura_Dome", 1.05f, 64, 24);
            if (Orbit == null) Orbit = Torus("BeyAura_Orbit", 1f, 0.006f, 160, 6);
            if (Shard == null) Shard = Octahedron("BeyAura_Shard", new Vector3(0.6f, 1.6f, 0.6f) * 0.07f);
        }

        // r = r0 + (r1 - r0) * t^0.62 profili etrafinda donen kase; uv.x = aci, uv.y = yukseklik
        static Mesh Lathe(string name, float r0, float r1, float h, int seg, int rows)
        {
            int rr = rows + 1;
            var v = new Vector3[(seg + 1) * rr];
            var n = new Vector3[v.Length];
            var uv = new Vector2[v.Length];
            for (int i = 0; i <= seg; i++)
            {
                float u = (float)i / seg, a = u * Mathf.PI * 2f;
                float c = Mathf.Cos(a), s = Mathf.Sin(a);
                for (int j = 0; j < rr; j++)
                {
                    float t = (float)j / rows;
                    float r = r0 + (r1 - r0) * Mathf.Pow(t, 0.62f);
                    float dr = (r1 - r0) * 0.62f * Mathf.Pow(Mathf.Max(t, 0.001f), -0.38f);
                    int k = i * rr + j;
                    v[k] = new Vector3(r * c, h * t, r * s);
                    n[k] = new Vector3(h * c, -dr, h * s).normalized;
                    uv[k] = new Vector2(u, t);
                }
            }
            var tri = new int[seg * rows * 6];
            int q = 0;
            for (int i = 0; i < seg; i++)
                for (int j = 0; j < rows; j++)
                {
                    int a = i * rr + j, b = (i + 1) * rr + j;
                    tri[q++] = a; tri[q++] = a + 1; tri[q++] = b;
                    tri[q++] = b; tri[q++] = a + 1; tri[q++] = b + 1;
                }
            return Build(name, v, n, uv, tri);
        }

        static Mesh Torus(string name, float R, float tube, int seg, int tubeSeg)
        {
            int rr = tubeSeg + 1;
            var v = new Vector3[(seg + 1) * rr];
            var n = new Vector3[v.Length];
            var uv = new Vector2[v.Length];
            for (int i = 0; i <= seg; i++)
            {
                float u = (float)i / seg, a = u * Mathf.PI * 2f;
                float c = Mathf.Cos(a), s = Mathf.Sin(a);
                for (int j = 0; j < rr; j++)
                {
                    float b = (float)j / tubeSeg * Mathf.PI * 2f;
                    var nn = new Vector3(Mathf.Cos(b) * c, Mathf.Sin(b), Mathf.Cos(b) * s);
                    int k = i * rr + j;
                    v[k] = new Vector3(R * c, 0f, R * s) + nn * tube;
                    n[k] = nn;
                    uv[k] = new Vector2(u, (float)j / tubeSeg);
                }
            }
            var tri = new int[seg * tubeSeg * 6];
            int q = 0;
            for (int i = 0; i < seg; i++)
                for (int j = 0; j < tubeSeg; j++)
                {
                    int a = i * rr + j, b = (i + 1) * rr + j;
                    tri[q++] = a; tri[q++] = a + 1; tri[q++] = b;
                    tri[q++] = b; tri[q++] = a + 1; tri[q++] = b + 1;
                }
            return Build(name, v, n, uv, tri);
        }

        static Mesh Hemisphere(string name, float radius, int segU, int segV)
        {
            int rr = segV + 1;
            var v = new Vector3[(segU + 1) * rr];
            var n = new Vector3[v.Length];
            var uv = new Vector2[v.Length];
            for (int i = 0; i <= segU; i++)
            {
                float u = (float)i / segU, a = u * Mathf.PI * 2f;
                for (int j = 0; j < rr; j++)
                {
                    float t = (float)j / segV, phi = t * Mathf.PI * 0.5f;
                    var nn = new Vector3(Mathf.Cos(phi) * Mathf.Cos(a), Mathf.Sin(phi), Mathf.Cos(phi) * Mathf.Sin(a));
                    int k = i * rr + j;
                    v[k] = nn * radius;
                    n[k] = nn;
                    uv[k] = new Vector2(u, t);
                }
            }
            var tri = new int[segU * segV * 6];
            int q = 0;
            for (int i = 0; i < segU; i++)
                for (int j = 0; j < segV; j++)
                {
                    int a = i * rr + j, b = (i + 1) * rr + j;
                    tri[q++] = a; tri[q++] = a + 1; tri[q++] = b;
                    tri[q++] = b; tri[q++] = a + 1; tri[q++] = b + 1;
                }
            return Build(name, v, n, uv, tri);
        }

        // Zemin karesi: shader uv'yi -1..1 diske cevirir
        static Mesh Quad(string name, float half)
        {
            var v = new[] { new Vector3(-half, 0f, -half), new Vector3(half, 0f, -half), new Vector3(-half, 0f, half), new Vector3(half, 0f, half) };
            var n = new[] { Vector3.up, Vector3.up, Vector3.up, Vector3.up };
            var uv = new[] { new Vector2(0f, 0f), new Vector2(1f, 0f), new Vector2(0f, 1f), new Vector2(1f, 1f) };
            return Build(name, v, n, uv, new[] { 0, 2, 1, 1, 2, 3 });
        }

        // Duz yuzlu (flat shaded) uzatilmis oktahedron - kristal parcasi
        static Mesh Octahedron(string name, Vector3 s)
        {
            var top = Vector3.Scale(Vector3.up, s);
            var bot = Vector3.Scale(Vector3.down, s);
            var eq = new[] { Vector3.Scale(Vector3.right, s), Vector3.Scale(Vector3.forward, s), Vector3.Scale(Vector3.left, s), Vector3.Scale(Vector3.back, s) };
            var v = new List<Vector3>();
            var n = new List<Vector3>();
            void Face(Vector3 p0, Vector3 p1, Vector3 p2)
            {
                var nn = Vector3.Cross(p1 - p0, p2 - p0).normalized;
                v.Add(p0); v.Add(p1); v.Add(p2);
                n.Add(nn); n.Add(nn); n.Add(nn);
            }
            for (int k = 0; k < 4; k++)
            {
                Vector3 e0 = eq[k], e1 = eq[(k + 1) % 4];
                Face(top, e1, e0);
                Face(bot, e0, e1);
            }
            var tri = new int[v.Count];
            for (int i = 0; i < tri.Length; i++) tri[i] = i;
            return Build(name, v.ToArray(), n.ToArray(), new Vector2[v.Count], tri);
        }

        static Mesh Build(string name, Vector3[] v, Vector3[] n, Vector2[] uv, int[] tri)
        {
            var m = new Mesh { name = name, hideFlags = HideFlags.DontSave };
            if (v.Length > 65535) m.indexFormat = UnityEngine.Rendering.IndexFormat.UInt32;
            m.vertices = v;
            m.normals = n;
            m.uv = uv;
            m.triangles = tri;
            m.RecalculateBounds();
            return m;
        }
    }
}
