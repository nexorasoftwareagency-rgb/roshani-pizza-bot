import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.roshani.pizza.admin',
  appName: 'Roshani ERP Admin',
  webDir: '../Admin',
  loggingBehavior: 'debug',
  backgroundColor: '#ffffff',
  android: {
    allowMixedContent: true,
    webContentsDebuggingEnabled: true
  },
  server: {
    cleartext: true
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
