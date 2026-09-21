// src/services/billing.ts

// اگر کافه بازار هستید:
//import { CafebazaarPoolakey } from '@salarizadi/capacitor-cafebazaar-poolakey';

// اگر مایکت هستید، خط بالا را پاک کرده و خط زیر را فعال کنید:
import { Myket } from '@salarizadi/capacitor-myket';

// ⬇️ کلید عمومی RSA را از پنل توسعه‌دهنده استور کپی و اینجا جایگزین کنید
const RSA_PUBLIC_KEY = 'MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQCiOrLsHwp5r6CeIm/ydDXlCsjlSzMGe+u1tAFuw0lstCgyJy6kJX/zl/Po0vJKpmbsQSc+ua3fE8MmrDpPeBTxUNEbjNjdCQWWCc6SZrMHZvPSz82Fxyhyf/A8GkAPtv9CtVsELNLKr1mcOueD3SJtl5S4eYiNvT6NgXjicAfkswIDAQAB';

// انتخاب پلاگین بر اساس استور (برای سادگی کد، فرض را بر بازار می‌گذاریم)
//const BillingPlugin = CafebazaarPoolakey; 
const BillingPlugin = Myket;

export const initBilling = async () => {
  try {
    await BillingPlugin.initialize({ rsaPublicKey: RSA_PUBLIC_KEY });
    console.log('✅ اتصال به استور با موفقیت برقرار شد');
    
    // گوش دادن به تغییرات وضعیت خرید در تمام برنامه
    BillingPlugin.addListener('purchaseStateChanged', (event: any) => {
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
  try {
    const result = await BillingPlugin.purchaseProduct({
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
    // تا کاربر بتواند دوباره آن را بخرد. اگر "غیرمصرفی" است (مثل حذف تبلیغ)، این خط را حذف کنید.
    await BillingPlugin.consumeProduct({ token: purchase.purchaseToken });
    
    console.log('✅ محصول با موفقیت تحویل و مصرف شد:', purchase.productId);
    
    // ⬇️ اینجا منطق برنامه خود را فراخوانی کنید
    // مثلاً: store.commit('addCoins', 100) یا ارسال درخواست به سرور خودتان
  } catch (error) {
    console.error('❌ خطا در مصرف (Consume) محصول:', error);
  }
};
