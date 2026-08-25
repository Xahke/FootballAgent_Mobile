/* Amblem vektörleştirme — SADECE geliştirici aracı, oyuna dahil değil.
 *
 * Bu dosya bir NOT'tur, çalıştırılabilir bir hat değil: kaynak PNG tabakalar
 * repoda olmadığı (ve olmayacağı) için path verisi tek doğru kaynak sayılıyor
 * ve tools/badge-lab-data.js içinde duruyor. Burada üretim yönteminin kendisi
 * kayıt altına alınıyor ki geometri bir gün yeniden üretilmek istenirse
 * ayarlar tahmin edilmesin.
 *
 * Yöntem (Python + OpenCV ile uygulandı, bkz. docs/team-badge-prototype.md):
 *
 *   1. Hücreyi gri tonlamada kırp. Hücre sınırları VARSAYILMAZ: mürekkep
 *      sütun/satır toplamlarındaki boş bantların orta noktaları kesme çizgisi.
 *   2. Gauss bulanıklığı (σ 2.5–3.0) ile piksel merdivenlerini yumuşat.
 *   3. 128'de eşikle.
 *   4. En büyük bileşenin belirli bir oranından küçük bağlı bileşenleri at.
 *   5. RETR_CCOMP ile dış konturlar ve delikler ayrı çıkar; küçük delikleri at.
 *   6. 0 0 64 64 içine, dört tarafta pay bırakarak, ORANI BOZMADAN ölçekle.
 *   7. Optik merkezle: kutu merkezi ile alan ağırlık merkezinin tam ortası.
 *   8. Normalize birimlerde Douglas-Peucker ile sadeleştir.
 *
 * Mikro sürüm aynı hattan geçer, farkı: daha yüksek bulanıklık, morfolojik
 * CLOSE (küçük boşlukları birleştirir) ve DILATE (çizgileri kalınlaştırır),
 * daha yüksek bileşen/delik eşiği, daha yüksek DP toleransı. Bulanıklaştırma
 * DEĞİL — sonuç yine keskin path, sadece daha az noktalı.
 *
 * PUSULA İSTİSNASI. Kaynak pusulada W/E/S/E harfleri var. Harfler ayrı bağlı
 * bileşenler ve merkezden uzaklıkları da alanları da ışınlardan ayrı bir bantta:
 *
 *     ana gövde (halka+yıldız+merkez)  19547 px   r≈9
 *     dört çapraz ışın            3940–4083 px   r≈120–134
 *     dört harf                    880–1101 px   r≈201–216
 *
 * Işın ile harf arasında ~3.6x alan farkı var, bu yüzden eşik belirsiz değil:
 * en büyük bileşenin %10'undan küçükler atılıyor ve tam DÖRT bileşenin
 * atıldığı, atılanların hepsinin harf bandında olduğu doğrulanıyor.
 * Sonuçta pusulada hiçbir harf/metin path'i yok.
 */

module.exports = {
  /* Kaynak tabakalar — repoya kopyalanmadı, commit edilmedi. */
  sheets: {
    'team-emblems-source.png': { size: [2048, 2048], grid: [4, 4], used: 12 },
    'team-frames-source.png': { size: [2544, 1904], grid: [5, 4], used: 10 },
    'team-emblems-supplement.png': { size: [2544, 1904], grid: [4, 3], used: 12 },
  },

  /* id -> [blur, minCompFrac, holeFrac, dpEps, blend] */
  main: {
    lion: [3.0, 0.02, 0.0012, 0.40, 0.50], eagle: [3.0, 0.02, 0.0018, 0.40, 0.50],
    wolf: [3.0, 0.02, 0.0060, 0.40, 0.50], bull: [3.0, 0.02, 0.0060, 0.40, 0.50],
    crown: [2.5, 0.02, 0.0060, 0.35, 0.50], star: [2.5, 0.02, 0.0100, 0.30, 0.50],
    castle: [2.5, 0.02, 0.0060, 0.30, 0.50], mountain: [2.5, 0.02, 0.0100, 0.35, 0.50],
    anchor: [2.5, 0.02, 0.0100, 0.35, 0.50], 'torch-spear': [2.5, 0.03, 0.0100, 0.40, 0.50],
    lightning: [2.5, 0.02, 0.0100, 0.30, 0.50], oak: [2.5, 0.02, 0.0080, 0.38, 0.50],
    anvil: [3.0, 0.02, 0.0080, 0.35, 0.50], 'crossed-hammers': [3.0, 0.03, 0.0080, 0.38, 0.50],
    'industrial-cog': [3.0, 0.02, 0.0060, 0.32, 0.50], 'ocean-wave': [3.0, 0.02, 0.0080, 0.36, 0.50],
    lighthouse: [3.0, 0.01, 0.0060, 0.34, 0.50], compass: [2.5, 0.10, 0.0060, 0.30, 0.50],
    'stone-bridge': [3.0, 0.02, 0.0070, 0.34, 0.50], 'fortified-gate': [3.0, 0.02, 0.0060, 0.30, 0.50],
    'sailor-knot': [3.0, 0.02, 0.0080, 0.36, 0.50], gemstone: [2.5, 0.02, 0.0080, 0.30, 0.50],
    'spear-shield': [3.0, 0.02, 0.0080, 0.34, 0.50], 'mill-wheel': [3.0, 0.02, 0.0060, 0.32, 0.50],
  },

  /* Mikro: [blur, minCompFrac, holeFrac, dpEps, blend, closePx, dilatePx] */
  micro: {
    lion: [6.0, 0.05, 0.0090, 1.15, 0.50, 0, 0], eagle: [6.0, 0.05, 0.0200, 1.05, 0.50, 0, 0],
    wolf: [7.0, 0.06, 0.0260, 1.15, 0.50, 0, 0], bull: [7.0, 0.06, 0.0260, 1.15, 0.50, 0, 0],
    crown: [4.0, 0.04, 0.0180, 0.85, 0.50, 0, 0], star: [2.5, 0.02, 0.0100, 0.35, 0.50, 0, 0],
    castle: [4.0, 0.04, 0.0180, 0.80, 0.50, 0, 0],
    /* mountain/anchor/oak/torch-spear: 1. turda 18px'te accent alanının
       %0.6-1.5'ine düşüyorlardı; DILATE ile gövde kalınlaştırıldı. */
    mountain: [4.0, 0.05, 0.0300, 0.95, 0.50, 10, 12],
    anchor: [4.0, 0.05, 0.0300, 0.95, 0.50, 12, 16],
    'torch-spear': [7.0, 0.10, 0.0400, 1.30, 0.50, 16, 18],
    lightning: [2.5, 0.02, 0.0100, 0.35, 0.50, 0, 0],
    oak: [6.0, 0.06, 0.0300, 1.10, 0.50, 14, 14],
    anvil: [5.0, 0.04, 0.0200, 0.90, 0.50, 6, 4],
    'crossed-hammers': [6.0, 0.06, 0.0300, 1.05, 0.50, 12, 10],
    /* Dişler close 20 ile tamamen eriyip 18px'te düz diske dönüyordu; 9
       dişleri yuvarlatıp bırakıyor, delik eşiği de göbeği koruyor. */
    'industrial-cog': [6.0, 0.05, 0.0130, 0.85, 0.50, 9, 5],
    'ocean-wave': [6.0, 0.06, 0.0300, 1.00, 0.50, 14, 10],
    lighthouse: [6.0, 0.06, 0.0300, 1.05, 0.50, 14, 12],
    compass: [5.0, 0.14, 0.0300, 0.95, 0.50, 10, 10],
    'stone-bridge': [6.0, 0.06, 0.0350, 1.05, 0.50, 16, 10],
    'fortified-gate': [5.0, 0.05, 0.0250, 0.95, 0.50, 12, 6],
    'sailor-knot': [6.0, 0.06, 0.0300, 1.05, 0.50, 12, 10],
    gemstone: [4.0, 0.04, 0.0250, 0.85, 0.50, 8, 6],
    'spear-shield': [6.0, 0.06, 0.0300, 1.05, 0.50, 12, 10],
    'mill-wheel': [6.0, 0.05, 0.0130, 0.85, 0.50, 9, 3],
  },
};
