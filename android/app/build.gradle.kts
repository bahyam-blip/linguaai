plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.linguaai.app"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.linguaai.app"
        minSdk = 24
        targetSdk = 34
        versionCode = 3
        versionName = "1.1.1"
        vectorDrawables.useSupportLibrary = true
    }

    signingConfigs {
        create("release") {
            storeFile = file("../linguaai-release.keystore")
            storePassword = "linguaai2026"
            keyAlias = "linguaai"
            keyPassword = "linguaai2026"
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            isShrinkResources = false
            signingConfig = signingConfigs.getByName("release")
            // Ensure all APK signature schemes are applied (v1+v2+v3)
            // This fixes "app can't be installed" on Samsung/Xiaomi/Huawei devices
            // that reject debug-signed or v2-only APKs
        }
        debug {
            isMinifyEnabled = false
        }
    }

    // Build a single universal APK (no splits) for maximum compatibility
    splits {
        abi {
            isEnable = false
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }

    packaging {
        resources.excludes += setOf(
            "META-INF/AL2.0",
            "META-INF/LGPL2.1",
            "META-INF/*.kotlin_module"
        )
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.appcompat:appcompat:1.7.0")
