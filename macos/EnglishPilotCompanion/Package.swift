// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "EnglishPilotCompanion",
    platforms: [.macOS(.v13)],
    products: [
        .executable(name: "EnglishPilotCompanion", targets: ["EnglishPilotCompanion"])
    ],
    targets: [
        .executableTarget(name: "EnglishPilotCompanion"),
        .testTarget(name: "EnglishPilotCompanionTests", dependencies: ["EnglishPilotCompanion"])
    ]
)
