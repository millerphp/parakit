# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# If your project uses WebView with JS, uncomment the following
# and specify the fully qualified class name to the JavaScript interface
# class:
#-keepclassmembers class fqcn.of.javascript.interface.for.webview {
#   public *;
#}

# Keep line numbers for stack traces in Play Console.
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile

# Capacitor: keep plugin classes & their @PluginMethod / @CapacitorPlugin
# annotations so the JS bridge can find and invoke them.
-keep class com.getcapacitor.** { *; }
-keep @com.getcapacitor.annotation.CapacitorPlugin class * { *; }
-keepclassmembers class * {
    @com.getcapacitor.annotation.PluginMethod *;
    @com.getcapacitor.annotation.ActivityCallback *;
    @com.getcapacitor.annotation.PermissionCallback *;
}

# Our own native plugins.
-keep class tech.christophermiller.parakit.MagnetometerPlugin { *; }
-keep class tech.christophermiller.parakit.LinearAccelerationPlugin { *; }
-keep class tech.christophermiller.parakit.VoiceRecorderPlugin { *; }
-keep class tech.christophermiller.parakit.PhotoPlugin { *; }
-keep class tech.christophermiller.parakit.VideoPlugin { *; }
-keep class tech.christophermiller.parakit.SharePlugin { *; }
-keep class tech.christophermiller.parakit.DownloadsPlugin { *; }
-keep class tech.christophermiller.parakit.StoragePlugin { *; }

# Capacitor uses reflection on JSON / WebView interfaces.
-keepattributes *Annotation*,Signature,InnerClasses

# Don't strip warnings about classes referenced from the JS bridge.
-dontwarn org.apache.cordova.**
-dontwarn com.getcapacitor.**
