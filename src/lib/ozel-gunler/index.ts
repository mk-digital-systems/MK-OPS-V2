import type { OzelGun } from "./schedule";
import { ON_KASIM } from "./10-kasim";

/**
 * Özel günler listesi. Yeni özel gün eklemek için:
 * 1. src/lib/ozel-gunler/<gun-ay>/index.ts dosyasını oluşturun (10-kasim örnek alınır),
 * 2. görselleri public/images/ozel-gunler/<gun-ay>/ altına koyun (masaustu.png, mobil.png),
 * 3. aşağıya ekleyin. Her gün her yıl otomatik tekrarlanır.
 * İki özel günün aralığı çakışmamalıdır (aynı anda yalnızca biri gösterilir).
 */
export const OZEL_GUNLER: OzelGun[] = [ON_KASIM];
