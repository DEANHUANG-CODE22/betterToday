// betterToday 图标：环与点，「黎明」配色（2026-11-19 用户选的）。设计坐标 108×108（Android 自适应图标画布）。
// 底：自上而下靛蓝 #2B3A8F → App 深底 #0E1116；轨道 #33407F；色带橙 #FF6B2C → 琥珀 #FFB547；点白。
// 用法：swift render.swift <输出目录>
import AppKit
import CoreGraphics

let bg = CGColor(srgbRed: 0x0E/255, green: 0x11/255, blue: 0x16/255, alpha: 1)
let dawnTop = CGColor(srgbRed: 0x2B/255, green: 0x3A/255, blue: 0x8F/255, alpha: 1)
let track = CGColor(srgbRed: 0x33/255, green: 0x40/255, blue: 0x7F/255, alpha: 1)
let accent = CGColor(srgbRed: 0xFF/255, green: 0x6B/255, blue: 0x2C/255, alpha: 1)
let amber = CGColor(srgbRed: 0xFF/255, green: 0xB5/255, blue: 0x47/255, alpha: 1)
let text = CGColor(srgbRed: 1, green: 1, blue: 1, alpha: 1)

/// 底色渐变在画布上的起止：自适应图标只露中间 72dp（18…90），legacy 整张都露。
func dawnSpan(_ layer: Layer) -> (CGFloat, CGFloat) { layer == .full || layer == .round ? (0, 108) : (18, 90) }
func dawnGradient() -> CGGradient {
    CGGradient(colorsSpace: CGColorSpace(name: CGColorSpace.sRGB)!, colors: [dawnTop, bg] as CFArray, locations: [0, 1])!
}
/// 画布纵坐标 y 处的底色（点外圈那道缝要和底一个颜色）。
func dawnAt(_ y: CGFloat, _ layer: Layer) -> CGColor {
    let (y0, y1) = dawnSpan(layer)
    let t = max(0, min(1, (y - y0) / (y1 - y0)))
    let a = dawnTop.components!, b = bg.components!
    return CGColor(srgbRed: a[0] + (b[0] - a[0]) * t, green: a[1] + (b[1] - a[1]) * t, blue: a[2] + (b[2] - a[2]) * t, alpha: 1)
}
let white = CGColor(srgbRed: 1, green: 1, blue: 1, alpha: 1)

enum Layer { case full, round, background, foreground, monochrome }

let R: CGFloat = 19, W: CGFloat = 5.5, dotR: CGFloat = 5.2, gap: CGFloat = 2
let a0: CGFloat = -130, a1: CGFloat = -29.7, aDot: CGFloat = -80
func rad(_ d: CGFloat) -> CGFloat { d * .pi / 180 }

/// scale: 设计单位放大倍数；legacy 图标把 108 画布里的标记放大到 48dp 外框。
func render(_ layer: Layer, px: Int, markScale: CGFloat = 1) -> Data {
    let cs = CGColorSpace(name: CGColorSpace.sRGB)!
    let ctx = CGContext(data: nil, width: px, height: px, bitsPerComponent: 8, bytesPerRow: 0,
                        space: cs, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
    let s = CGFloat(px) / 108
    ctx.translateBy(x: 0, y: CGFloat(px)); ctx.scaleBy(x: s, y: -s)   // 和 SVG 一样 y 向下
    ctx.setShouldAntialias(true)

    let (gy0, gy1) = dawnSpan(layer)
    func fillDawn() {
        ctx.drawLinearGradient(dawnGradient(), start: CGPoint(x: 0, y: gy0), end: CGPoint(x: 0, y: gy1),
                               options: [.drawsBeforeStartLocation, .drawsAfterEndLocation])
    }
    switch layer {
    case .full:
        ctx.saveGState()
        ctx.addPath(CGPath(roundedRect: CGRect(x: 0, y: 0, width: 108, height: 108),
                           cornerWidth: 24, cornerHeight: 24, transform: nil))
        ctx.clip(); fillDawn(); ctx.restoreGState()
    case .round:
        ctx.saveGState()
        ctx.addEllipse(in: CGRect(x: 0, y: 0, width: 108, height: 108)); ctx.clip(); fillDawn(); ctx.restoreGState()
    case .background:
        fillDawn()
    default: break
    }
    if layer == .background { return png(ctx) }

    ctx.translateBy(x: 54, y: 54); ctx.scaleBy(x: markScale, y: markScale)
    let mono = layer == .monochrome
    ctx.setLineWidth(W)

    // 轨道
    ctx.addEllipse(in: CGRect(x: -R, y: -R, width: 2*R, height: 2*R))
    ctx.setStrokeColor(mono ? white.copy(alpha: 0.4)! : track); ctx.strokePath()
    // 色带
    ctx.setLineCap(.round)
    ctx.addArc(center: .zero, radius: R, startAngle: rad(a0), endAngle: rad(a1), clockwise: false)
    if mono {
        ctx.setStrokeColor(white); ctx.strokePath()
    } else {
        // 色带：沿 x 从橙到琥珀。先把弧描成轮廓再裁切，渐变只落在色带上。
        ctx.saveGState()
        ctx.replacePathWithStrokedPath(); ctx.clip()
        let g = CGGradient(colorsSpace: CGColorSpace(name: CGColorSpace.sRGB)!, colors: [accent, amber] as CFArray, locations: [0, 1])!
        ctx.drawLinearGradient(g, start: CGPoint(x: -R - W, y: 0), end: CGPoint(x: R + W, y: 0), options: [])
        ctx.restoreGState()
    }
    // 点：外圈挖空一道缝，再画点
    let c = CGPoint(x: R * cos(rad(aDot)), y: R * sin(rad(aDot)))
    let outer = CGRect(x: c.x - dotR - gap/2, y: c.y - dotR - gap/2, width: 2*dotR + gap, height: 2*dotR + gap)
    if mono || layer == .foreground {
        ctx.setBlendMode(.clear); ctx.fillEllipse(in: outer); ctx.setBlendMode(.normal)
    } else {
        ctx.setFillColor(dawnAt(54 + c.y * markScale, layer)); ctx.fillEllipse(in: outer)
    }
    ctx.setFillColor(mono ? white : text)
    ctx.fillEllipse(in: CGRect(x: c.x - dotR + gap/2, y: c.y - dotR + gap/2, width: 2*dotR - gap, height: 2*dotR - gap))
    return png(ctx)
}

func png(_ ctx: CGContext) -> Data {
    NSBitmapImageRep(cgImage: ctx.makeImage()!).representation(using: .png, properties: [:])!
}

let out = URL(fileURLWithPath: CommandLine.arguments[1])
func write(_ d: Data, _ rel: String) {
    let u = out.appendingPathComponent(rel)
    try! FileManager.default.createDirectory(at: u.deletingLastPathComponent(), withIntermediateDirectories: true)
    try! d.write(to: u)
}

// legacy 图标（API 24–25）：标记在 108 画布里约占 44（48dp 关键线内），legacy 没有遮罩裁切，放大 1.5 倍
let legacyScale: CGFloat = 1.5
let densities: [(String, CGFloat)] = [("mdpi", 1), ("hdpi", 1.5), ("xhdpi", 2), ("xxhdpi", 3), ("xxxhdpi", 4)]
for (d, m) in densities {
    let leg = Int(48 * m), ad = Int(108 * m)
    write(render(.full, px: leg, markScale: legacyScale), "res/mipmap-\(d)/ic_launcher.png")
    write(render(.round, px: leg, markScale: legacyScale), "res/mipmap-\(d)/ic_launcher_round.png")
    write(render(.background, px: ad), "res/mipmap-\(d)/ic_launcher_background.png")
    write(render(.foreground, px: ad), "res/mipmap-\(d)/ic_launcher_foreground.png")
    write(render(.monochrome, px: ad), "res/mipmap-\(d)/ic_launcher_monochrome.png")
}
// Expo 源图（app.json 引用），以后重新生成原生工程时用
write(render(.full, px: 1024, markScale: legacyScale), "assets/icon.png")
write(render(.foreground, px: 512), "assets/android-icon-foreground.png")
write(render(.background, px: 512), "assets/android-icon-background.png")
write(render(.monochrome, px: 432), "assets/android-icon-monochrome.png")
write(render(.full, px: 48, markScale: legacyScale), "assets/favicon.png")
write(render(.foreground, px: 1024), "assets/splash-icon.png")
print("done")
