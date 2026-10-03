// src/services/billing.ts
import { Capacitor } from '@capacitor/core';
import { Myket } from '@salarizadi/capacitor-myket';

// ⬇️ کلید عمومی RSA را از پنل توسعه‌دهنده استور کپی و اینجا جایگزین کنید
const RSA_PUBLIC_KEY = 'MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQCiOrLsHwp5r6CeIm/ydDXlCsjlSzMGe+u1tAFuw0lstCgyJy6kJX/zl/Po0vJKpmbsQSc+ua3fE8MmrDpPeBTxUNEbjNjdCQWWCc6SZrMHZvPSz82Fxyhyf/A8GkAPtv9CtVsELNLKr1mcOueD3SJtl5S4eYiNvT6NgXjicAfkswIDAQAB';

export const initBilling = async () => {
  if (!Capacitor.isNativePlatform()) {
    console.log('ℹ️ Web environment detected: Native billing plugin skipped.');
    return;
  }
  try {
    await (Myket.initialize as any)({ rsaPublicKey: RSA_PUBLIC_KEY });
    console.log('✅ اتصال به استور با موفقیت برقرار شد');
    
    // گوش دادن به تغییرات وضعیت خرید در تمام برنامه
    Myket.addListener('purchaseStateChanged', (event: any) => {
      console.log('وضعیت خرید تغییر کرد:', event.state);
      
      if (event.state === 'PURCHASED' && event.purchase) {
        handleSuccessfulPurchase(event.purchase);
      } else if (event.state === 'CANCELLED') {
        console.log('کاربر از خرید انصراف داد');
      } else if (event.state === 'FAILED') {
        console.error('خرید ناموفق بود');
      }
    });
  } catch (error) {
    console.error('❌ خطا در اتصال به استور:', error);
  }
};

export const buyProduct = async (productId: string) => {
  if (!Capacitor.isNativePlatform()) {
    console.log('ℹ️ Web environment: simulating test purchase for product:', productId);
    // در محیط وب برای تست، خرید موفق شبیه‌سازی می‌شود
    return true;
  }
  try {
    const result = await Myket.purchaseProduct({
      productId: productId,
      payload: 'user_' + Date.now() // یک شناسه یکتا برای ردیابی
    });
    return result;
  } catch (error) {
    console.error('❌ خطا در شروع فرآیند خرید:', error);
    throw error;
  }
};

const handleSuccessfulPurchase = async (purchase: any) => {
  try {
    console.log('پرداخت موفق، در حال تحویل کالا...', purchase.productId);
    
    // اگر محصول شما "مصرفی" است (مثل سکه یا الماس)، باید آن را Consume کنید
    await Myket.consumeProduct({ token: purchase.purchaseToken });
    
    console.log('✅ محصول با موفقیت تحویل و مصرف شد:', purchase.productId);
  } catch (error) {
    console.error('❌ خطا در مصرف (Consume) محصول:', error);
  }
};
