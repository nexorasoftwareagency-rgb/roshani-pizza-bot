import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.roshani.pizza.rider',
  appName: 'Roshani Rider',
  webDir: '../rider',
  loggingBehavior: 'debug',
  backgroundColor: '#ffffff',
  android: {
    allowMixedContent: true,
    webContentsDebuggingEnabled: true
  },
  server: {
    url: 'https://roshani-sudha-rider.web.app',
    cleartext: true,
    androidScheme: 'https'
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: '#E84908',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false
    }
  }
};

export default config;
