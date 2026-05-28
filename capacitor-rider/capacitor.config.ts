import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.roshani.pizza.rider',
  appName: 'Roshani Rider',
  webDir: '../rider',
  loggingBehavior: 'debug',
  backgroundColor: '#F4F6F8',
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
      backgroundColor: '#FF5200',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false
    }
  }
};

export default config;
