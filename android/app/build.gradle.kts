plugins {
    id("com.android.application")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

android {
    namespace = "com.familybeacon.app"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    buildFeatures {
        // The flavors below set the application name through resValue, which is
        // off by default from Android Gradle Plugin 9 onwards.
        resValues = true
    }

    defaultConfig {
        applicationId = "com.familybeacon.app"
        minSdk = flutter.minSdkVersion
        targetSdk = flutter.targetSdkVersion
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    buildTypes {
        release {
            // Release signing is a deferred decision of ENG-FND-0001 and is
            // introduced with the distribution workflow. Until then the debug
            // keys are used so `flutter run --release` works locally.
            signingConfig = signingConfigs.getByName("debug")
        }
    }

    // The three environments are separate installable applications. Distinct
    // identifiers let all three sit on one device at once, so environment
    // isolation is something you can see rather than something you trust, and a
    // staging build can never quietly replace a production one.
    flavorDimensions += "environment"

    productFlavors {
        create("development") {
            dimension = "environment"
            applicationIdSuffix = ".dev"
            resValue("string", "app_name", "Family Beacon Dev")
        }
        create("staging") {
            dimension = "environment"
            applicationIdSuffix = ".stg"
            resValue("string", "app_name", "Family Beacon Staging")
        }
        create("production") {
            dimension = "environment"
            resValue("string", "app_name", "Family Beacon")
        }
    }
}

kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}

flutter {
    source = "../.."
}
