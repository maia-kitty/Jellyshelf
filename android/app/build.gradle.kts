plugins {
    id("com.android.application")
}

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

    buildTypes {
        release {
            isMinifyEnabled = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"))
            // shortcut: signed with the debug key so it installs as is; use a real keystore before publishing anywhere.
            signingConfig = signingConfigs.getByName("debug")
        }
    }
}
