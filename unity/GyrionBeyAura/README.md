# Gyrion – Bey Aura VFX (Unity)

Her topaca kendine özgü bir "vortex aura" ekler. Görünüm, referanstaki dönen enerji kasesinin aynısı.

| Topaç | Aura |
|---|---|
| **KOR / Crimson Rift** | Kızıl alev girdabı. Hızlı döner, çok diken çıkarır, kıvılcımlar içe çekilerek hızla yükselir |
| **ATLAS / Domed Guardian** | Altın girdap ve üstünde altıgen kalkan kubbesi. Yukarı kayan bir tarama bandı var |
| **SEREIN / Silent Orbit** | Sakin mavi girdap ve 3 dönen yörünge halkası |
| **VEKTOR / Broken Prism** | Mor girdap. Etrafında prizma renginde 12 kırık kristal parçası döner |
| *MINE (oyuncu)* | `useCustomColors` ile istediğin renk |

Görsel önizleme için three.js prototipi `threejs/beyblade-aura-scene.js` dosyasında. Shader matematiği iki tarafta birebir aynı.

## Kurulum (2 dakika)

1. `GyrionBeyAura` klasörünü projendeki `Assets/` altına kopyala.
   Shader'lar `Runtime/Resources/` içinde. Bu sayede build'e otomatik dahil oluyorlar.
2. Topaç prefab'ının **kök objesine** `Gyrion/VFX/Bey Aura` component'ini ekle.
3. **Family** alanından topacı seç: Kor, Atlas, Serein veya Vektor.
4. **Bloom'u aç.** Bu şart; Bloom olmadan aura parlamaz, sadece renkli görünür.

### URP
- URP Asset ayarlarında **HDR** açık olmalı.
- Kamerada **Post Processing** açık olmalı.
- Sahneye bir *Global Volume* ekle ve ona şunları ekle:
  - **Bloom**: Threshold `0.9`, Intensity `1–2`, Scatter `0.7`
  - **Tonemapping**: `ACES`

### Built-in Render Pipeline
- Kamerada **HDR** açık olmalı.
- Package Manager'dan *Post Processing* paketini kur.
- Kameraya `Post-process Layer` ekle.
- *Post-process Volume* ekle (Is Global). Ona **Bloom** (Threshold `0.9`) ve **Color Grading → Tonemapper ACES** ekle.

> Shader'lar ışıksız ve additive. Built-in RP ile URP'de çalışırlar. HDRP desteklenmiyor.

## Oyun koduna bağlama

```csharp
using Gyrion.VFX;

public class BeyController : MonoBehaviour
{
    BeyAura aura;

    void Awake() => aura = GetComponent<BeyAura>();

    void Update()
    {
        // "Launch now: %92,9 spin energy" -> 0..1
        aura.SetSpin(spinEnergy / 100f);
    }

    // Q / W / E / R skill'leri ve sert çarpışmalar
    void OnSkillUsed() => aura.Burst();

    void OnCollisionEnter(Collision c)
    {
        if (c.relativeVelocity.magnitude > 6f) aura.Burst();
    }

    // Seçim ekranında topaç değişince
    void OnFamilyChanged(BeyFamily f) => aura.SetFamily(f);
}
```

| API | Ne yapar |
|---|---|
| `SetSpin(0..1)` | Aura gücü. Spin düştükçe aura söner (`minIntensity`'ye kadar) |
| `Burst()` | Şok dalgası, 2.6 kata kadar parlama ve dışarı saçılan kıvılcımlar. Inspector'da sağ tık → *Test Burst* |
| `SetFamily(BeyFamily)` | Aurayı başka bir aileye çevirir |
| `SetCustomColors(a, b)` / `ClearCustomColors()` | Özel renk (HDR) verir / kaldırır |
| `SetVisible(bool)` | Aurayı gösterir / gizler |

## Nasıl çalışıyor

- Aura, sahnenin kökünde ayrı bir obje olarak (`<Topaç>_Aura`) yaratılır ve topacın **sadece pozisyonunu** takip eder. Topaç saniyede onlarca tur dönse de aura kendi hızında döner.
- Her karede aşağıya ışın atılır ve aura zemine oturtulur. `alignToGroundNormal` açıksa eğimli velodrom / banked turn yüzeyine de yaslanır. Topacın kendi collider'ı yok sayılır.
- `autoSize`: Boyut topacın Renderer sınırlarından otomatik hesaplanır. Efekt 0.5 m yarıçaplı bir topaca göre modellendi. Büyük / küçük gelirse `sizeMultiplier` ile ayarla.
- Bütün mesh'ler (kase, iç koni, zemin, hale, kubbe, halka, kristal) kodla bir kez üretilir ve tüm topaçlar bunları paylaşır. Ekstra model veya doku gerekmez.
- Kıvılcımlar Unity ParticleSystem ile çizilir ama hareketleri script'ten yönetilir. Girdapla dönüp yükselirler.

## Performans

Her aura yaklaşık 6–9 draw call ve 120–170 kıvılcım demek. 4 topaç aynı anda rahat çalışır. Zayıf cihazlarda:
- `particleDensity` değerini düşür.
- `addPointLight`'ı kapat. Point light özellikle URP forward'da per-object light limitine takılabilir.
