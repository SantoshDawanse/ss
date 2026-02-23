import 'dotenv/config';

export default {
  expo: {
    name: "Sikshya Sathi",
    slug: "sikshya-sathi-local-brain",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/images/icon.png",
    scheme: "sikshyasathi",
    userInterfaceStyle: "automatic",
    newArchEnabled: true,
    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.sikshyasathi.localbrain"
    },
    android: {
      adaptiveIcon: {
        backgroundColor: "#E6F4FE",
        foregroundImage: "./assets/images/android-icon-foreground.png",
        backgroundImage: "./assets/images/android-icon-background.png",
        monochromeImage: "./assets/images/android-icon-monochrome.png"
      },
      edgeToEdgeEnabled: true,
      predictiveBackGestureEnabled: false,
      package: "com.sikshyasathi.localbrain"
    },
    web: {
      output: "static",
      favicon: "./assets/images/favicon.png"
    },
    plugins: [
      "expo-router",
      [
        "expo-splash-screen",
        {
          image: "./assets/images/splash-icon.png",
          imageWidth: 200,
          resizeMode: "contain",
          backgroundColor: "#ffffff",
          dark: {
            backgroundColor: "#000000"
          }
        }
      ]
    ],
    experiments: {
      typedRoutes: true,
      reactCompiler: true
    },
    extra: {
      apiBaseUrl: process.env.API_BASE_URL || 'https://zm3d9kk179.execute-api.us-east-1.amazonaws.com/development',
      environment: process.env.ENVIRONMENT || 'development',
      enableAnalytics: process.env.ENABLE_ANALYTICS === 'true',
      enableCrashReporting: process.env.ENABLE_CRASH_REPORTING === 'true',
    }
  }
};
