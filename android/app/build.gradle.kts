import java.util.Properties

plugins {
    id("com.android.application")
}

// Your own signing key, kept outside the repo (see README): ~/.local/share/jellyshelf-android/keystore.properties.
val keystore = File(System.getProperty("user.home"), ".local/share/jellyshelf-android/keystore.properties")
    .takeIf { it.exists() }
    ?.let { f -> Properties().apply { f.inputStream().use { load(it) } } }

android {
    namespace = "io.github.maiakitty.jellyshelf"
    compileSdk = 36

    defaultConfig {
        applicationId = "io.github.maiakitty.jellyshelf"
        minSdk = 30
        targetSdk = 36
        versionCode = 2
        versionName = "0.2.0"
        // Phones (and the x86_64 emulator): libass's native code for older 32-bit CPUs would double the size.
        ndk { abiFilters += listOf("arm64-v8a", "x86_64") }
    }

    signingConfigs {
        if (keystore != null) create("release") {
            storeFile = File(keystore.getProperty("storeFile"))
            storePassword = keystore.getProperty("storePassword")
            keyAlias = keystore.getProperty("keyAlias")
            keyPassword = keystore.getProperty("keyPassword")
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"))
            // Without a key of your own it falls back to the debug key, so a fresh clone still builds an installable APK.
            signingConfig = signingConfigs.findByName("release") ?: signingConfigs.getByName("debug")
        }
    }
}

dependencies {
    // The offline player: Media3 (ExoPlayer) reads MKV directly; ass-media draws styled anime subtitles with libass.
    implementation("androidx.media3:media3-exoplayer:1.8.0")
    implementation("androidx.media3:media3-ui:1.8.0")
    implementation("io.github.peerless2012:ass-media:0.5.1")
}
