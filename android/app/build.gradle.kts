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
        versionCode = 1
        versionName = "0.1.0"
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
