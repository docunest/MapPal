plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// The web app's address, baked in at build time when known
// (GitHub Actions passes the repo variable MAPPAL_URL); can always be
// changed in the app.
val mappalUrl: String = (project.findProperty("mappalUrl") as String?)?.trim().orEmpty()

android {
    namespace = "com.docunest.mappal"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.docunest.mappal"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "1.0"
        buildConfigField("String", "MAPPAL_URL", "\"$mappalUrl\"")
    }

    signingConfigs {
        // A fixed key (from CI secrets) lets new builds install over old
        // ones; without it each build is signed with a throwaway debug key.
        getByName("debug") {
            val ks = System.getenv("MAPPAL_KEYSTORE")
            if (ks != null && file(ks).exists()) {
                storeFile = file(ks)
                storePassword = System.getenv("MAPPAL_KEYSTORE_PASSWORD")
                keyAlias = System.getenv("MAPPAL_KEY_ALIAS") ?: "mappal"
                keyPassword = System.getenv("MAPPAL_KEY_PASSWORD") ?: System.getenv("MAPPAL_KEYSTORE_PASSWORD")
            }
        }
    }

    buildFeatures {
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
}

// One small, stable library (Custom Tabs). Fewer dependencies = fewer
// reasons to ever rebuild — the APK should be installed once.
dependencies {
    implementation("androidx.browser:browser:1.8.0")
}
