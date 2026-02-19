# iOS Native Code

This directory contains iOS-specific native code for the Sikshya-Sathi Local Brain.

## Setup

1. Install Xcode from Mac App Store
2. Install CocoaPods: `sudo gem install cocoapods`
3. Run `pod install` in this directory

## Requirements

- iOS 13.0+
- Xcode 15+
- CocoaPods

## Native Modules

- SQLCipher for encrypted database
- Custom native modules for performance optimization

## Build

```bash
# Install pods
pod install

# Build from Xcode or command line
xcodebuild -workspace SikshyaSathi.xcworkspace \
  -scheme SikshyaSathi \
  -configuration Debug
```
