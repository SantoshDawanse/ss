# Android Native Code

This directory contains Android-specific native code for the Sikshya-Sathi Local Brain.

## Setup

1. Install Android Studio
2. Open Android Studio and configure Android SDK
3. Run `./gradlew assembleDebug` to build

## Requirements

- Android SDK 24+ (Android 7.0)
- Target SDK 34 (Android 14)
- Minimum 2GB RAM device support

## Native Modules

- SQLCipher for encrypted database
- Custom native modules for performance optimization

## Build

```bash
# Debug build
./gradlew assembleDebug

# Release build
./gradlew assembleRelease
```
