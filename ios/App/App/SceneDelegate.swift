import UIKit
import Capacitor
import FirebaseAuth

@objc(NativeMfaPlugin)
class NativeMfaPlugin: CAPPlugin, CAPBridgedPlugin {
    let identifier = "NativeMfaPlugin"
    let jsName = "NativeMfa"
    let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "sendEnrollmentCode", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "confirmEnrollmentCode", returnType: CAPPluginReturnPromise)
    ]

    @objc func sendEnrollmentCode(_ call: CAPPluginCall) {
        guard let phoneNumber = call.getString("phoneNumber"), phoneNumber.hasPrefix("+") else {
            call.reject("Telefonnummer bitte mit Ländervorwahl eingeben, z. B. +49.")
            return
        }
        guard let user = Auth.auth().currentUser else {
            call.reject("Die iPhone-Anmeldung ist nicht aktiv. Bitte melde dich erneut an.")
            return
        }

        user.multiFactor.getSessionWithCompletion { session, error in
            if let error = error {
                call.reject(error.localizedDescription)
                return
            }
            guard let session = session else {
                call.reject("Die sichere SMS-Sitzung konnte nicht erstellt werden.")
                return
            }
            PhoneAuthProvider.provider().verifyPhoneNumber(
                phoneNumber,
                uiDelegate: nil,
                multiFactorSession: session
            ) { verificationId, error in
                if let error = error {
                    call.reject(error.localizedDescription)
                    return
                }
                guard let verificationId = verificationId else {
                    call.reject("Firebase hat keine SMS-Bestätigung erstellt.")
                    return
                }
                call.resolve(["verificationId": verificationId])
            }
        }
    }

    @objc func confirmEnrollmentCode(_ call: CAPPluginCall) {
        guard let verificationId = call.getString("verificationId"),
              let verificationCode = call.getString("verificationCode") else {
            call.reject("SMS-Code oder Bestätigungs-ID fehlt.")
            return
        }
        guard let user = Auth.auth().currentUser else {
            call.reject("Die iPhone-Anmeldung ist nicht aktiv. Bitte melde dich erneut an.")
            return
        }

        let credential = PhoneAuthProvider.provider().credential(
            withVerificationID: verificationId,
            verificationCode: verificationCode
        )
        let assertion = PhoneMultiFactorGenerator.assertion(with: credential)
        user.multiFactor.enroll(with: assertion, displayName: "Mobiltelefon") { error in
            if let error = error {
                call.reject(error.localizedDescription)
                return
            }
            call.resolve()
        }
    }
}

class LaRosaBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(NativeMfaPlugin())
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
