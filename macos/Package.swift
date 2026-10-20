// swift-tools-version: 5.9
// SPDX-License-Identifier: GPL-3.0-or-later
import PackageDescription

let package = Package(
    name: "ClipNacre",
    platforms: [.macOS(.v13)],
    products: [.executable(name: "ClipNacre", targets: ["ClipNacre"])],
    targets: [
        .target(name: "ClipNacreCore"),
        .executableTarget(name: "ClipNacre", dependencies: ["ClipNacreCore"]),
        .testTarget(name: "ClipNacreCoreTests", dependencies: ["ClipNacreCore"]),
    ]
)
