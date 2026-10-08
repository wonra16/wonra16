using UnityEngine;

namespace Gyrion.VFX
{
    /// <summary>Oyundaki 4 topac ailesi.</summary>
    public enum BeyFamily
    {
        Kor,    // KOR    / Crimson Rift
        Atlas,  // ATLAS  / Domed Guardian
        Serein, // SEREIN / Silent Orbit
        Vektor, // VEKTOR / Broken Prism
    }

    /// <summary>Aileye ozel ek efekt.</summary>
    public enum AuraExtra
    {
        Flame, // kivilcimlar iceri cekilerek hizla yukselir
        Dome,  // altigen kalkan kubbesi
        Orbit, // donen yorunge halkalari
        Prism, // yorungede kirik kristal parcalari
    }

    /// <summary>
    /// Bir auranin tum ayarlari. Degerler three.js prototipindeki FAMILIES ile birebir aynidir.
    /// Renkler LINEAR degerlerdir (BeyAura bunlari proje renk uzayina gore cevirir).
    /// </summary>
    [System.Serializable]
    public struct BeyAuraPreset
    {
        public string label;
        public Color colorA;      // ana renk
        public Color colorB;      // sicak / beyaza yakin vurgu
        public float swirlSpeed;  // girdap donus hizi
        public float twist;       // spiral kivrimi
        public float streaks;     // girdaptaki serit sayisi (tam sayi)
        public float flame;       // seritlerin yukari akma hizi
        public float rimSpeed;    // ust halkadaki parlak hilalin donus hizi
        public float spikes;      // zemindeki diken hucresi sayisi
        public float spikeAmount; // dikenlerin ne kadari yanik (0..1)
        public float rings;       // zemindeki spiral halka sayisi
        public float sparkRise;   // kivilcim yukselme hizi
        public int sparkCount;    // ayni anda yaklasik kivilcim sayisi
        public AuraExtra extra;

        public static BeyAuraPreset Get(BeyFamily family)
        {
            switch (family)
            {
                case BeyFamily.Kor:
                    return new BeyAuraPreset
                    {
                        label = "KOR / Crimson Rift",
                        colorA = new Color(1.0f, 0.07f, 0.015f), colorB = new Color(1.0f, 0.5f, 0.18f),
                        swirlSpeed = 0.75f, twist = 2.6f, streaks = 7f, flame = 1.6f, rimSpeed = 2.6f,
                        spikes = 30f, spikeAmount = 1.0f, rings = 5f, sparkRise = 1.6f, sparkCount = 170,
                        extra = AuraExtra.Flame,
                    };
                case BeyFamily.Atlas:
                    return new BeyAuraPreset
                    {
                        label = "ATLAS / Domed Guardian",
                        colorA = new Color(1.0f, 0.62f, 0.0f), colorB = new Color(1.0f, 0.95f, 0.55f),
                        swirlSpeed = 0.35f, twist = 1.6f, streaks = 5f, flame = 0.4f, rimSpeed = 0.9f,
                        spikes = 20f, spikeAmount = 0.55f, rings = 4f, sparkRise = 0.55f, sparkCount = 120,
                        extra = AuraExtra.Dome,
                    };
                case BeyFamily.Serein:
                    return new BeyAuraPreset
                    {
                        label = "SEREIN / Silent Orbit",
                        colorA = new Color(0.02f, 0.35f, 1.0f), colorB = new Color(0.55f, 0.95f, 1.0f),
                        swirlSpeed = 0.28f, twist = 1.2f, streaks = 4f, flame = 0.25f, rimSpeed = 0.7f,
                        spikes = 16f, spikeAmount = 0.35f, rings = 7f, sparkRise = 0.35f, sparkCount = 130,
                        extra = AuraExtra.Orbit,
                    };
                default: // Vektor
                    return new BeyAuraPreset
                    {
                        label = "VEKTOR / Broken Prism",
                        colorA = new Color(0.75f, 0.05f, 1.0f), colorB = new Color(1.0f, 0.6f, 1.0f),
                        swirlSpeed = 0.55f, twist = 2.0f, streaks = 6f, flame = 0.8f, rimSpeed = 1.6f,
                        spikes = 26f, spikeAmount = 0.85f, rings = 5f, sparkRise = 0.9f, sparkCount = 140,
                        extra = AuraExtra.Prism,
                    };
            }
        }
    }
}
