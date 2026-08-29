import UIKit
import Capacitor
import WebKit

class LaRosaBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        // iOS 27 can deadlock when Capacitor 8.5 performs its two synchronous
        // configuration prompts at document start. This app loads its HTTPS
        // origin directly, so WebKit's native cookies and fetch are sufficient.
        guard let contentController = webView?.configuration.userContentController else { return }
        let compatibleScripts = contentController.userScripts.map { script in
            let source = script.source
                .replacingOccurrences(
                    of: "const isCookiesEnabled = prompt(JSON.stringify(payload));",
                    with: "const isCookiesEnabled = 'false';"
                )
                .replacingOccurrences(
                    of: "const isHttpEnabled = prompt(JSON.stringify(payload));",
                    with: "const isHttpEnabled = 'false';"
                )
            return WKUserScript(
                source: source,
                injectionTime: script.injectionTime,
                forMainFrameOnly: script.isForMainFrameOnly
            )
        }
        contentController.removeAllUserScripts()
        compatibleScripts.forEach(contentController.addUserScript)
    }
}

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = LaRosaBridgeViewController()
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}
