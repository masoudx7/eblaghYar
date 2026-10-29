// src/services/paymentRouter.ts
import { Capacitor } from '@capacitor/core';
import { CafebazaarPoolakey } from '@salarizadi/capacitor-cafebazaar-poolakey';

export type StoreType = 'bazaar' | 'web';

export const getActiveStore = (): StoreType => {
  if (!Capacitor.isNativePlatform()) {
    return 'web';
  }
  try {
    const saved = localStorage.getItem('eblaghyar_active_store');
    if (saved === 'bazaar') {
      return 'bazaar';
    }
  } catch {}
  return 'bazaar';
};

export const setActiveStore = (store: StoreType) => {
  try {
    localStorage.setItem('eblaghyar_active_store', store);
  } catch {}
};

export const initDynamicBilling = async () => {
  const store = getActiveStore();
  if (store === 'web') {
    console.log('ℹ️ Web environment: Zarinpal payment gateway active.');
    return;
  }

  if (store === 'bazaar') {
    try {
      const RSA_PUBLIC_KEY = 'MIHNMA0GCSqGSIb3DQEBAQUAA4G7ADCBtwKBrwC51l6VdldfhH+mDXrMogeYOteb1u64iXvmmEA66skwoVYeaRU2FmNC6gou0ON5laOmoCzBFvHWp+kYQxAJ5AaJX5OSKp+dbTXT4K34fPJJst5tZSX8+aLvyVS5zXQDCCH71ox6tqgLjp3Iie5IaqLkNqQcxWK7ofu6zK6HiF7rHx6+tWdqAnR/mgFazy2JJbb7mTNQPHiml/05VH7RqRBEIJhg+xg/2zi8DIpzuBsCAwEAAQ==';
      await (CafebazaarPoolakey.initialize as any)({ rsaPublicKey: RSA_PUBLIC_KEY });
      console.log('✅ Cafe Bazaar billing initialized successfully');
    } catch (e) {
      console.error('Cafe Bazaar init error:', e);
    }
  }
};

export const processDynamicPayment = async (
  productType: 'coins_5' | 'coins_15' | 'premium',
  deviceId: string
): Promise<{ success: boolean; message?: string }> => {
  const store = getActiveStore();
  console.log(`🛒 Processing payment via [${store.toUpperCase()}] for product: ${productType}`);

  if (store === 'web') {
    try {
      const res = await fetch('/api/payment/zarinpal/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productType, deviceId }),
      });
      const data = await res.json();
      if (data.success && data.paymentUrl) {
        window.location.href = data.paymentUrl;
        return { success: false, message: 'در حال انتقال به درگاه زرین‌پال...' };
      } else {
        throw new Error(data.error || 'خطا در ایجاد تراکنش زرین‌پال');
      }
    } catch (e: any) {
      console.error('Zarinpal payment error:', e);
      throw new Error(e.message || 'خطا در اتصال به درگاه پرداخت زرین‌پال');
    }
  }

  if (store === 'bazaar') {
    const productIdMap: Record<string, string> = {
      coins_5: 'coin_5_pack',
      coins_15: 'coin_15_pack',
      premium: 'premium_1year',
    };
    const productId = productIdMap[productType];
    try {
      const result = await CafebazaarPoolakey.purchaseProduct({
        productId,
        payload: 'user_' + deviceId + '_' + Date.now(),
      });
      return { success: true };
    } catch (e: any) {
      if (e.message === 'CANCELLED') {
        throw new Error('CANCELLED');
      }
      throw e;
    }
  }

  return { success: false, message: 'استور نامشخص است.' };
};
