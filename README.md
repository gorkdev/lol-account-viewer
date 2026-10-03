# LoL Hesap Görüntüleyici

Kendi League of Legends hesabının bilgilerini yerelde listeler: şampiyonlar, kostümler, renkler, ustalık, derece, cüzdan, ganimet, totemler, simgeler ve son maçlar.

Veriler, bilgisayarda çalışan League istemcisinin yerel API'sinden (LCU) okunur. Şifren bu araca hiç girilmez. Sunucu sadece `127.0.0.1` adresini dinler.

## Kullanım

1. League of Legends istemcisini aç ve hesabına giriş yap.
2. Bu klasörde çalıştır:

   ```
   npm start
   ```

3. Tarayıcıda `http://127.0.0.1:5174` adresini aç.

İstemci kapalıysa sayfa 5 saniyede bir yeniden dener.

## Ayarlar

| Değişken | Açıklama |
| --- | --- |
| `PORT` | Web arayüzünün portu, varsayılan 5174 |
| `LOL_DIR` | Oyun farklı bir klasöre kuruluysa kurulum klasörü |
| `LCU_PORT`, `LCU_PASSWORD` | Bağlantı bilgilerini elle vermek için |

## Notlar

- LCU, Riot'un resmi olarak desteklediği bir API değildir. Uç noktalar istemci güncellemeleriyle değişebilir. Alınamayan veriler sayfanın altında listelenir.
- Araç sadece okuma yapar. Görsel proxy'si yalnızca `/lol-game-data/assets/` altındaki dosyalara izin verir.
