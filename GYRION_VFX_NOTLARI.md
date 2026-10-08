# Gyrion VFX – Çalışma Notları

> Bulut oturumunda yaptıklarımızın tam özeti. Cumartesi lokal PC'de buradan devam edeceğiz.
> **Branch:** `claude/threejs-high-level-code-lqphvj` · **Repo:** `wonra16/wonra16`

---

## İçindekiler
1. [Kısa özet](#1-kısa-özet)
2. [Projeyi lokale alma](#2-projeyi-lokale-alma)
3. [Dosya haritası](#3-dosya-haritası)
4. [Three.js Playground kuralları](#4-threejs-playground-kuralları)
5. [İş 1 – Sci-fi lazer sahnesi](#5-iş-1--sci-fi-lazer-sahnesi)
6. [İş 2 – Bey Aura (three.js prototipi)](#6-iş-2--bey-aura-threejs-prototipi)
7. [İş 3 – Bey Aura (Unity paketi)](#7-iş-3--bey-aura-unity-paketi)
8. [Nasıl çalıştık: render → karşılaştır → düzelt](#8-nasıl-çalıştık-render--karşılaştır--düzelt)
9. [Teknik notlar ve dersler](#9-teknik-notlar-ve-dersler)
10. [Neler doğrulandı, neler doğrulanmadı](#10-neler-doğrulandı-neler-doğrulanmadı)
11. [Cumartesi planı](#11-cumartesi-planı)
12. [Cumartesi için hazırlanacaklar](#12-cumartesi-için-hazırlanacaklar)

---

## 1. Kısa özet

| # | İş | Nerede çalışır | Durum |
|---|---|---|---|
| 1 | **Sci-fi lazer sahnesi.** Silah, pembe lazer ve duvardaki çarpma efekti. Referans bir Unreal görseliydi | compilebytes Three.js Playground → `scene.js` | ✅ Playground'da çalışıyor |
| 2 | **Bey Aura prototipi.** 4 topaca 4 farklı girdap aurası (sadece aura) | compilebytes Three.js Playground → `scene.js` | ✅ Playground'da çalışıyor |
| 3 | **Bey Aura Unity paketi.** Aynı auralar, topaca eklenen tek bir component olarak | Unity (Built-in RP veya URP) | ⚠️ Yazıldı, Unity'de **henüz derlenmedi** |

Ortak teknik: HDR render + Bloom + ACES tonlama. Bütün geometri kodla üretiliyor; hiçbir model, doku veya addon gerekmiyor.

---

## 2. Projeyi lokale alma

```bash
git clone https://github.com/wonra16/wonra16.git
cd wonra16
git checkout claude/threejs-high-level-code-lqphvj
```

Lokal önizleme için (isteğe bağlı) Node.js 18+ gerekiyor:

```bash
cd threejs/preview
npm install
npx playwright install chromium     # bir kez
npm run shot:aura                    # -> aura.png
npm run shot:laser                   # -> laser.png
# veya herhangi bir sahne:  node shot.mjs ../beyblade-aura-scene.js cikti.png 6000 1920 1080
```

> Playground'un sağ üstündeki **"Download Vite project"** butonuyla projenin tamamını indirip `npm install && npm run dev` ile lokalde de çalıştırabilirsin. İndirdikten sonra `src/scene.js` dosyasını bizim dosyalardan biriyle değiştirmen yeterli.

---

## 3. Dosya haritası

```
wonra16/
├── GYRION_VFX_NOTLARI.md                ← bu dosya
├── threejs/
│   ├── laser-beam-scene.js              ← İş 1: playground scene.js
│   ├── laser-beam-preview.png           ← İş 1 render çıktısı
│   ├── beyblade-aura-scene.js           ← İş 2: playground scene.js (sadece auralar)
│   ├── beyblade-aura-preview.png        ← İş 2 render çıktısı
│   └── preview/                         ← headless render aracı (lokal doğrulama)
│       ├── shot.mjs
│       ├── index.html
│       └── package.json
└── unity/
    └── GyrionBeyAura/                   ← İş 3: Assets/ içine kopyalanacak klasör
        ├── README.md                    ← Unity kurulum rehberi
        └── Runtime/
            ├── BeyAura.cs               ← ana component + prosedürel mesh üretici
            ├── BeyAuraPreset.cs         ← 4 ailenin ayarları (enum + preset)
            └── Resources/
                ├── GyrionBeyAura.shader          ← kase / zemin / kubbe / halka / kristal
                └── GyrionBeyAuraParticle.shader  ← kıvılcımlar
```

---

## 4. Three.js Playground kuralları

Site: `compilebytes.com/tools/threejs` · Three.js **0.186** · sadece `three` core paketi var. `three/addons` yok; yani OrbitControls, EffectComposer, UnrealBloomPass kullanılamıyor.

Proje yapısı:
- `src/main.js` → `createCrystalScene(canvas)` fonksiyonunu çağırır.
- `src/interaction.js` → butonları ve fareyi dönen nesneye bağlar.

**Sözleşme:** `scene.js` dosyası şu şekilde olmalı:

```js
import * as THREE from 'three';

export function createCrystalScene(canvas) {
  // ... sahne
  return {
    setPointer(x, y) {},      // fare hareketi, x/y -1..1 (NDC)
    selectAt(x, y) {},        // tıklama -> true/false (seçildi mi)
    shiftPalette() {},        // "Shift colour" -> durum yazısında görünecek isim (string)
    toggleMotion() {},        // "Pause motion" -> true = DURDU
    dispose() {},             // sayfa kapanırken
  };
}
```

> ⚠️ İlk lazer sahnesinde bu isimleri tahmin etmiştim. Sonra gönderdiğin zip'teki `interaction.js` dosyasından gerçek isimleri öğrendim; "Shift colour" butonu ilk başta çalışmıyordu. İkisi de düzeltildi.

**Kullanım:** Playground'da `scene.js` içini tamamen sil, ilgili `.js` dosyasının içeriğini yapıştır. Diğer dosyalara dokunma.

---

## 5. İş 1 – Sci-fi lazer sahnesi

**Dosya:** `threejs/laser-beam-scene.js` · **Referans:** silahtan çıkan pembe lazer, grid zemin ve duvarda kıvılcım.

### Sahnede neler var
| Parça | Nasıl yapıldı |
|---|---|
| Gökyüzü | İç tarafa bakan küre ve gradient shader (ufukta siyah, yukarıda lacivert) |
| Zemin / duvarlar | Canvas'ta çizilen grid dokusu. Duvarlarda dünya ölçekli UV var, böylece her yüzde hücre boyu aynı |
| Silah | `ExtrudeGeometry` profilleri. Yüzü beyaz, kenarları koyu malzemeyle hard-surface görünüm. Kırmızı yanan ızgara, 3 çatal bıçak, havalandırma bloğu |
| Lazer | 3 katman silindir (çekirdek, iç parlama, hale) ve noise ile kıvrılan 9 elektrik ipliği (vertex shader) |
| Çarpma | Kameraya doğru çekilmiş parlama sprite'ları, duvarda sıcak leke, pembe point light |
| Parçacıklar | Yere düşüp seken 520 kıvılcım (çizgi) ve ışın boyunca uçuşan 320 parçacık |
| Post-process | Kendi yazdığımız bloom (aşağıda), kromatik sapma, vinyet, dithering |

### Ayarlar (`CFG`)
`exposure`, `bloomStrength`, `bloomThreshold`, `bloomKnee`, `sparkCount`, `emberCount`, `cellSize`

### Kontroller
- Sürükle: kamerayı döndür
- Tekerlek: zoom
- Çift tık / Shift colour: renk değiştir (Magenta → Cyan → Plasma → Toxic)
- Pause: animasyonu durdur

---

## 6. İş 2 – Bey Aura (three.js prototipi)

**Dosya:** `threejs/beyblade-aura-scene.js` · **Referans:** karakterlerin etrafındaki renkli girdap auraları.
Sahnede **sadece auralar** var. Örnek topaç modeli kodda duruyor ama gösterilmiyor; sadece auranın konumunu belirlemek için kullanılıyor.

### 4 topaç, 4 farklı aura
| Topaç | Renk | Ayırt edici ek | Karakter |
|---|---|---|---|
| **KOR / Crimson Rift** | Kızıl | Alev: kıvılcımlar içe çekilip hızla yükselir | Hızlı, agresif, en çok diken |
| **ATLAS / Domed Guardian** | Altın | Altıgen kalkan kubbesi ve yukarı kayan tarama bandı | Ağır, savunmacı |
| **SEREIN / Silent Orbit** | Mavi | 3 eğik yörünge halkası | Sakin, akıcı |
| **VEKTOR / Broken Prism** | Mor | Yörüngede 12 prizma renkli kırık kristal | Keskin, parçalı |

### Bir auranın katmanları
1. **Girdap kasesi.** Lathe mesh: `r = 0.2 + 1.15·t^0.62`, yükseklik 0.82. Shader'da dönen spiral şeritler var; üst kenarda kalın parlak bir halka ve bu halka üzerinde dönen bir "hilal" parlaklığı var.
2. **İç koni.** Daha dar ve daha hızlı dönen ikinci girdap. Üstü ve altı soluyor.
3. **Zemin.** Kesik kesik spiral halkalar, aura kenarından dışarı fışkıran yumuşak ışık "dilleri" ve patlama anındaki şok dalgası.
4. **Üst hale halkası.** Kasenin kenarında hafifçe yalpalayan ince bir halka.
5. **Kıvılcımlar.** Girdapla birlikte dönerek yükselen, titreyen noktalar.
6. **Point light.** Zemini auranın rengine boyuyor.
7. **Aileye özel ek.** Kubbe, yörünge halkaları, kristaller veya alev.

### Preset parametreleri (Unity'de de aynı değerler)
| Parametre | Anlamı | KOR | ATLAS | SEREIN | VEKTOR |
|---|---|---|---|---|---|
| `colA` | ana renk (linear) | 1, .07, .015 | 1, .62, 0 | .02, .35, 1 | .75, .05, 1 |
| `colB` | sıcak / vurgu rengi | 1, .5, .18 | 1, .95, .55 | .55, .95, 1 | 1, .6, 1 |
| `swirlSpeed` | girdap hızı | .75 | .35 | .28 | .55 |
| `twist` | spiral kıvrımı | 2.6 | 1.6 | 1.2 | 2.0 |
| `streaks` | şerit sayısı | 7 | 5 | 4 | 6 |
| `flame` | şeritlerin yukarı akışı | 1.6 | .4 | .25 | .8 |
| `rimSpeed` | hilalin dönüş hızı | 2.6 | .9 | .7 | 1.6 |
| `spikes` / `spikeAmt` | diken sayısı / oranı | 30 / 1 | 20 / .55 | 16 / .35 | 26 / .85 |
| `rings` | zemin halkası sayısı | 5 | 4 | 7 | 5 |
| `sparkRise` / `sparkCount` | kıvılcım hızı / sayısı | 1.6 / 170 | .55 / 120 | .35 / 130 | .9 / 140 |

### Kontroller
- Auraya tıklama: o aura seçilir ve patlama oynar (skill efekti)
- Shift colour: seçili auranın rengi değişir (Emerald, White, Azure, Ember, Gold, Violet, sonra tekrar orijinal). Hiçbiri seçili değilse hepsi değişir
- Pause motion: animasyonu durdurur
- Sürükle: kamera · Tekerlek: zoom

---

## 7. İş 3 – Bey Aura (Unity paketi)

Detaylı rehber: `unity/GyrionBeyAura/README.md`

### Kurulum
1. `unity/GyrionBeyAura` klasörünü projendeki `Assets/` altına kopyala.
2. Topaç prefab'ının **kök objesine** şu component'i ekle: **Add Component → Gyrion → VFX → Bey Aura**.
3. **Family** seç: Kor, Atlas, Serein veya Vektor.
4. **HDR ve Bloom'u aç.** Bloom olmadan aura parlamaz.
   - **URP:** URP Asset'te HDR açık olmalı. Kamerada Post Processing açık olmalı. Global Volume'a **Bloom** (Threshold 0.9, Intensity 1–2) ve **Tonemapping ACES** ekle.
   - **Built-in:** Kamerada HDR açık olmalı. *Post Processing* paketini kur. Kameraya Post-process Layer ekle. Global Volume'a Bloom ve Color Grading (ACES) ekle.
   - HDRP **desteklenmiyor**.

### Oyun koduna bağlama
```csharp
using Gyrion.VFX;

var aura = GetComponent<BeyAura>();
aura.SetSpin(spinEnergy / 100f);   // "Launch now: %92,9 spin energy"
aura.Burst();                      // Q/W/E/R skill'leri, sert çarpışmalar
aura.SetFamily(BeyFamily.Vektor);  // seçim ekranı
aura.SetCustomColors(a, b);        // MINE / özel renk
aura.SetVisible(false);
```

### Mimari kararlar
- **Aura topaçla dönmez.** Efekt, sahnenin kökünde ayrı bir obje olarak (`<Topaç>_Aura`) yaratılır ve topacın sadece **pozisyonunu** takip eder.
- **Zemine oturur.** Her karede aşağıya ışın atılır ve aura zemine yerleştirilir. Banked turn ve velodrom gibi eğimli yüzeylere de yaslanır. Topacın kendi collider'ı yok sayılır.
- **Boyutu otomatik hesaplanır.** Efekt 0.5 m yarıçaplı bir topaca göre modellendi; gerçek boyut topacın Renderer sınırlarından ölçülür. Gerekirse `sizeMultiplier` ile ayarlanır.
- **Mesh'ler bir kez üretilir.** Hepsi kodla oluşturulur (`BeyAuraMeshes`) ve tüm topaçlar bunları paylaşır.
- **Kıvılcımlar script'ten yönetilir.** ParticleSystem sadece çizim için kullanılıyor; hareketleri `SetParticles` ile biz veriyoruz. Böylece three.js'teki davranışın birebir aynısı oluyor.
- **Tek shader, 5 mod.** `_Mode`: 0 kase, 1 zemin, 2 kubbe, 3 halka, 4 kristal. Pass'te LightMode etiketi yok; bu yüzden URP'de de çizilir.
- **Renk uzayı dönüşümü.** Presetler linear renk. Linear projede `SetColor` değeri gamma kabul edilip dönüştürülüyor; bunu `ToShaderColor()` ile telafi ediyoruz.
- **Kıvılcım rengi materyalden gelir.** Vertex rengi sadece veri olarak kullanılıyor (`r` = sıcaklık, `a` = parlaklık). Böylece Unity'nin vertex rengi dönüşümü sonucu bozmaz.

### Inspector alanları
`family`, `useCustomColors`, `customColorA/B` · `autoSize`, `beyRadius`, `sizeMultiplier` · `groundMask`, `groundRayLength`, `alignToGroundNormal`, `fallbackHeightOffset` · `spin01`, `spinFromRigidbody`, `maxAngularSpeed`, `minIntensity`, `intensity` · `addPointLight`, `lightIntensity`, `particleDensity` · `auraShader`, `particleShader` (boşsa Resources'tan bulunur)

---

## 8. Nasıl çalıştık: render → karşılaştır → düzelt

"Aynı görüntüyü nasıl yakaladın?" sorusunun cevabı bu döngü:

1. **Referansı parçalara ayır.** Ne var? Gökyüzü, zemin, model, efekt katmanları, ışık. Görüntüyü asıl veren nedir? Bloom ve ACES.
2. **Platformun kuralını öğren.** Hangi paketler var, hangi fonksiyon isimleri bekleniyor? Hazır bloom yoksa kendimiz yazıyoruz.
3. **Kodla üret.** Model veya doku kullanmadan geometri ve shader yazıyoruz.
4. **Headless tarayıcıda render al** (`threejs/preview/shot.mjs`) ve referansla yan yana koy.
5. **Farkları listele ve düzelt.** Lazer sahnesinde 5 tur sürdü: kamera açısı, bloom yoğunluğu, ışın rengi, gökyüzü, kadraj. Aura sahnesinde 4 tur sürdü: dikenlerin sertliği, kenar halkasının beyazlığı, kasenin basıklığı, KOR'un rengi.
6. **Gerçek ortamda test et.** Playground'un kendi `main.js` ve `interaction.js` dosyalarıyla butonları ve tıklamayı denedik.

### Kendi bloom pipeline'ımız (playground'da addon olmadığı için)
```
Sahne -> HalfFloat render target (MSAA 4x, HDR, tonlama yok)
      -> parlaklık filtresi (threshold + yumuşak knee) -> yarım çözünürlük
      -> 5 kademe ayrık (H+V) gaussian blur, her kademe yarı boyut
      -> bileşim: sahne + Σ kademe·ağırlık
      -> ACES tonlama + sRGB (#include <tonemapping_fragment> / <colorspace_fragment>)
      -> vinyet + dithering
```
Glow için malzemelere 1'in çok üstünde renk değerleri veriyoruz (örneğin çekirdek ×9). Bloom bu değerleri yakalıyor.

---

## 9. Teknik notlar ve dersler

- **`pow(negatif, 2.0)` kullanma.** GLSL ve HLSL'de negatif tabanlı `pow` tanımsız; bazı GPU'larda siyah piksel veya NaN üretir. Gaussian bantlar için `sq(x) = x*x` kullan. İki tarafta da düzeltildi.
- **Periyodik noise.** Kasenin açısal koordinatı 0 ile 1 arasında sarıyor. Noise'u x ekseninde periyodik yaptık (`vnoiseP`); bu yüzden dikiş izi yok. Oktav başına periyot da 2 katına çıkıyor.
- **GLSL `mod` ile HLSL `fmod` farklı davranır.** Negatif sayılarda sonuçları farklı. HLSL tarafında `modp(x, y) = x - y*floor(x/y)` yazdık.
- **Sprite parlamaları duvara gömülmesin diye** sprite'ı kameraya doğru 0.25–0.6 m çekiyoruz. Ekrandaki yeri değişmiyor ama depth testi geçiyor.
- **Three.js r18x:** `THREE.Clock` deprecated; `performance.now()` kullandık. `PCFSoftShadowMap` yerine `PCFShadowMap` kullandık.
- **Playground önizleme kartı küçük.** Canvas boyutu `ResizeObserver` ile takip ediliyor. `setSize(w, h, false)` CSS'i ezmez.

---

## 10. Neler doğrulandı, neler doğrulanmadı

| Konu | Durum |
|---|---|
| Lazer sahnesi playground'da çalışıyor | ✅ Senin ekran görüntünde doğrulandı |
| Aura sahnesi render ve butonlar (seçim, renk, pause) | ✅ Headless Chromium + gerçek `main.js` / `interaction.js` ile doğrulandı |
| Unity C# derleniyor mu? | ❌ **Bulutta Unity / derleyici yoktu.** Kod sadece elle kontrol edildi |
| Unity shader'ları derleniyor mu? | ❌ Aynı sebep. Matematik three.js ile birebir aynı, ama HLSL tarafı hiç derlenmedi |
| Unity'de görünüm three.js ile aynı mı? | ❓ Bloom ayarı ve renk uzayına bağlı; ince ayar gerekebilir |
| Playground Console'daki "1" mesaj | ❓ İçeriğine bakmadık (muhtemelen bir uyarı) |

---

## 11. Cumartesi planı

**Hedef:** Auraları gerçek oyunda, gerçek topaçlarda çalıştırmak.

- [ ] **1. Paketi içe aktar.** `GyrionBeyAura` klasörünü `Assets/` altına kopyala. Derleme veya shader hatası çıkarsa önce onları düzelt.
- [ ] **2. Render pipeline'ı belirle** (Built-in mi URP mi). HDR ve Bloom'u aç.
- [ ] **3. Bir topaçla başla.** Örneğin KOR. Component'i ekle, Play'e bas, "Test Burst" ile dene.
- [ ] **4. Boyut ve konum ayarı.** `sizeMultiplier`, `groundMask` (stadyum layer'ı), `alignToGroundNormal`. Banked turn'de kontrol et.
- [ ] **5. Oyuna bağla.**
  - [ ] spin energy → `SetSpin()`
  - [ ] Q/W/E/R skill'leri → `Burst()`
  - [ ] sert çarpışma → `Burst()`
  - [ ] seçim ekranı (KOR / ATLAS / SEREIN / VEKTOR / MINE) → `SetFamily()` / `SetCustomColors()`
- [ ] **6. Kalan 3 topacı ekle** ve 4'ünü aynı anda test et.
- [ ] **7. Görsel ince ayar.** Oyun kamerasından bakıp three.js referansıyla karşılaştır. Bloom threshold ve intensity'yi ayarla.
- [ ] **8. Performans.** Profiler'a bak. Gerekirse `particleDensity` değerini düşür, `addPointLight`'ı kapat.
- [ ] **9. (İsteğe bağlı) Yeni efektler.** Launch trail (fırlatma izi), çarpışma kıvılcımı, ring-out patlaması, spin düşerken auranın titreyip sönmesi.

---

## 12. Cumartesi için hazırlanacaklar

- Unity sürümü (Help → About)
- Render pipeline: Edit → Project Settings → Graphics → hangi Render Pipeline Asset seçili?
- Color Space: Project Settings → Player → Other Settings → *Linear* mi *Gamma* mı?
- Topaç prefab'larının yapısı: kökte Rigidbody var mı, model child'da mı, dönüş fizikle mi yoksa script'le mi?
- Spin enerjisinin tutulduğu script ve değişkenin adı
- Skill sisteminin (QWER) script'i
- Stadyum zeminin layer'ı
- Mümkünse oyun kamerasından bir ekran görüntüsü

> Lokal PC'de Claude Code'u proje klasöründe açarsak Unity scriptlerini doğrudan okuyup entegrasyonu birlikte yaparız.
