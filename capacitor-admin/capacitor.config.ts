import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.roshani.pizza.admin',
  appName: 'Roshani ERP',
  webDir: '../Admin',
  loggingBehavior: 'debug',
  backgroundColor: '#ffffff',
  android: {
    allowMixedContent: true,
    webContentsDebuggingEnabled: true
  },
  server: {
    url: 'https://roshani-sudha-admin.web.app',
    cleartext: true,
    androidScheme: 'https'
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: '#f36b21',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false
    }
  }
};

export default config;
