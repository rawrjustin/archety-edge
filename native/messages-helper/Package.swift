// swift-tools-version:5.9

import PackageDescription

let package = Package(
    name: "MessagesHelper",
    platforms: [
        .macOS(.v13)
    ],
    products: [
        .executable(name: "messages-helper", targets: ["MessagesHelper"])
    ],
    targets: [
        .executableTarget(
            name: "MessagesHelper",
            dependencies: []
        )
    ]
)

