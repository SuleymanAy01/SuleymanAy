# Değişiklik Günlüğü

## 1.0.1 — 26 Temmuz 2026

- Mevcut tasarım ve sayfa yapısı korunarak bozuk ZIP dosya eşleşmeleri temizlendi.
- Yanlış adlarla köke taşınmış workflow, CSS, HTML ve test kopyaları kaldırıldı.
- Tek içerik kaynağı olarak repository kökündeki `content.json` bırakıldı.
- Ana site, yönetim paneli ve üretim build'i aynı `content.json` dosyasına bağlandı.
- En güncel içerik ve medya kaydı tek veri kaynağına aktarıldı.
- Admin panelindeki ekleme, düzenleme, silme ve medya işlemleri gözden geçirildi.
- Medya silme işleminin ilgili dosyayı sonraki Git commit'inde kaldırması sağlandı.
- `Yayınla` işlemi tek Git tree ve commit üzerinden `content.json` ile medya
  değişikliklerini birlikte yayınlayacak şekilde sağlamlaştırıldı.
- GitHub hesabı değişmez kullanıcı ID'siyle, repository ise `SuleymanAy` adıyla
  sabitlendi.
- GitHub REST API ve `content.json` isteklerine önbellek kullanmama davranışı eklendi.
- Vite sonrası `content.json` bütünlüğünü doğrulayan build koruması eklendi.
- GitHub Pages workflow'u `.github/workflows/deploy-pages.yml` konumuna taşındı;
  yalnızca doğrulanmış `dist/` klasörünü yayınlayacak şekilde düzenlendi.
- `.nojekyll`, `.gitignore` ve kapsamlı statik build testleri eklendi.
- Aynı içeriğe sahip kullanılmayan medya kopyası kaldırıldı.
