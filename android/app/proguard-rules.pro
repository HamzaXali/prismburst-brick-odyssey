# Release shrinking (R8). Capacitor's own consumer rules keep @CapacitorPlugin
# classes; these rules keep the bridge, the app plugins, and the WebView
# JavaScript interface that the game talks to.

-keep class com.getcapacitor.** { *; }
-keep class com.capacitorjs.plugins.** { *; }
-keep class com.hamzaxali.prismburst.** { *; }

-keepattributes *Annotation*,Signature,InnerClasses,EnclosingMethod,JavascriptInterface,Exceptions

-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

-keep @com.getcapacitor.annotation.CapacitorPlugin public class * {
    @com.getcapacitor.annotation.PermissionCallback <methods>;
    @com.getcapacitor.annotation.ActivityCallback <methods>;
    @com.getcapacitor.annotation.Permission <methods>;
    @com.getcapacitor.PluginMethod public <methods>;
}

-keep public class * extends com.getcapacitor.Plugin { *; }
-keep public class * extends org.apache.cordova.** { *; }

-dontwarn com.getcapacitor.**
-dontwarn org.apache.cordova.**
-dontwarn com.google.android.gms.**
